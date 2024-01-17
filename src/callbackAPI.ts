import { toCypher } from "~/projections";
import { parseProjection } from "@orbifold/projections";
import { Errors, Utils } from "@orbifold/utils";
import neo4j from "neo4j-driver";
import _ from "lodash";
import { Graph } from "@orbifold/graphs";


const DefaultOptions = {
	protocol: "bolt",
	host: "localhost",
	port: 7687,
	username: "neo4j",
	password: "123456789",
	defaultNodeLabel: "Thing",
	defaultEdgeLabel: "RelatedTo",
	database: "neo4j",
};

/**
 * Assembles the Neo4j node from the given specs?.
 * @param specs
 * @returns {{}}
 */
function getNodeParams(specs) {
	let node: any = {};
	if (_.isNil(specs)) {
		return node;
	}
	node.id = specs?.id || Utils.id();
	if (_.isPlainObject(specs?.data)) {
		node = _.assign(node, Utils.getReducedPlainObject(specs?.data, ["id", "labels"]));
	}
	return {
		id: node.id,
		data: node,
		labels: specs?.labels,
	};
}

/**
 * Assembles the Neo4j edge params from the given specs
 * @param specs
 * @returns {{}|{sourceId, data: {}, targetId, id: *, labels}}
 */
function getEdgeParams(specs) {
	let edge: any = {};
	if (_.isNil(specs)) {
		return edge;
	}
	edge.id = specs?.id || Utils.id();
	if (_.isPlainObject(specs?.data)) {
		edge = _.assign(edge, Utils.getReducedPlainObject(specs?.data, ["id", "labels"]));
	}
	return {
		id: edge.id,
		data: edge,
		labels: specs?.labels,
		sourceId: specs?.sourceId,
		targetId: specs?.targetId,
	};
}


export const pathQueryToCypher = (pathQuery, amount = 100) => {
	if (Utils.isEmpty(pathQuery)) {
		return null;
	}
	// check nothing is empty
	pathQuery.forEach((u) => {
		if (Utils.isEmpty(u)) {
			throw new Error("Path query items cannot be empty.");
		}
	});
	if (pathQuery.length === 1) {
		const label = pathQuery[0];
		return `Match (n:${label}) return n limit ${amount}`;
	}
	const coll: string[] = [];
	for (let i = 0; i < pathQuery.length; i++) {
		const u = pathQuery[i];
		if (i % 2 === 0) {
			if (u === "*") {
				coll.push("()");
			} else {
				coll.push(`(:${u})`);
			}
		} else {
			if (u === "*") {
				coll.push("-->");
			} else {
				coll.push(`-[:${u}]->`);
			}
		}
	}
	return `Match p=${coll.join("")} return p limit ${amount}`;
};

/**
 * This API is part of the Qwiery adapter mechanism. It is used by the Qwiery engine to interact with the underlying graph database.
 * The API is used both by the ES GraphAPI (client-side direct access to Neo4j) and the Neo4j GraphAPI (server-side direct access to Neo4j).
 */
export class CallbackAPI {
	get options(): any {
		return this._options;
	}

	set options(value: any) {
		this._options = value;
		if(this.driver){
			this.driver.close();
		}
		this.driver = this.getDriver();
	}
	public driver: any;
	private _options: any;

	constructor(options) {
		this.driver = this.getDriver();
		this._options = options;
	}
	async close(){
		await this.driver.close();
	}



	getDriver() {
		try {
			const opt = _.assign(DefaultOptions, this._options);
			console.log(`Neo4j connection string: ${opt.protocol}://${opt.host}:${opt.port}/${opt.database}`);
			return neo4j.driver(`${opt.protocol}://${opt.host}:${opt.port}`, neo4j.auth.basic(opt.username, opt.password));
		} catch (e: any) {
			console.error(e.message);
		}
		return null;
	}

	/**
	 * Returns a session with optionally the database specified.
	 * @returns {*}
	 */
	getSession(): any {
		if (this._options && !Utils.isEmpty(this._options.database)) {
			return this.driver.session({ database: this._options.database });
		} else {
			return this.driver.session();
		}
	}


	//region Nodes
	async nodeExists(id: String, done) {
		const session = this.getSession();
		try {
			const result = await session.executeRead((tx) => tx.run("Match (n{id: $id}) return n", { id }));
			done(null, [id], result.records.length > 0);
		} catch (e: any) {
			done(e.message, [id], false);
		} finally {
			await session.close();
		}
	}

	async deleteNode(id: string, done) {
		let query;
		let params = {};
		if (_.isString(id)) {
			query = `Match (n{id: $id}) detach delete n`;
			params["id"] = id;
		} else if (_.isFunction(id)) {
			// kinda possible by looping over all nodes in the db with the predicate but that's not really scalable or good practice
			return done("deleteNode with a predicate is not supported by the Neo4j adapter. Please use Mongo-like projections instead (https://www.mongodb.com/docs/manual/reference/operator/query/).", [id], null);
		} else if (_.isPlainObject(id)) {
			try {
				const constraint = toCypher(parseProjection(id), "n");
				query = `Match (n) Where ${constraint} detach delete n`;
			} catch (e: any) {
				return done(e.message, [id], null);
			}
		} else {
			return done("Please use a Mongo-like projections for getNodes, see https://www.mongodb.com/docs/manual/reference/operator/query/.", [id], null);
		}
		const session = this.getSession();
		try {
			await session.executeWrite((tx) => tx.run(query, params));
			done(null, [id], []);
		} catch (e: any) {
			done(e.message, [id], null);
		} finally {
			await session.close();
		}
	}

	async createNode(data, id, labels, done) {
		const specs = Utils.getNodeSpecs(data, id, labels);
		if (_.isNil(specs)) {
			return done(Errors.insufficientNodeSpecs(), [data, id, labels], null);
		}
		if (specs?.labels.length === 0) {
			specs.labels = [DefaultOptions.defaultNodeLabel];
		}
		if (_.isNil(specs?.id)) {
			specs.id = Utils.id();
		}
		// hijack the nodeExist method

		if (await this.nodePresent(specs?.id)) {
			throw new Error(`Node with id '${specs?.id}' exists already.`);
		}
		const session = this.getSession();
		try {
			const query = `Create (n:${specs?.labels.join(":")}) Set n=$data`;
			const params = getNodeParams(specs);
			await session.executeWrite((tx) => tx.run(query, params));
			session.close();
			done(null, [data, id, labels], params.data);
		} catch (e: any) {
			done(e.message, [data, id, labels], null);
		}
	}

	async createNodes(seq, done) {
		try {
			const coll: any[] = [];
			for (const item of seq) {
				// only a string or plain object will work here
				const n = await this.createNode(item, null, null, _.noop);
				if (n) {
					coll.push(n);
				}
			}
			done(null, [seq], coll);
		} catch (e: any) {
			done(e.message, [seq], null);
		}
	}

	async updateNode(data, id, labels, done) {
		const session = this.getSession();
		try {
			const specs = Utils.getNodeSpecs(data, id, labels);
			if (specs === null) {
				return done(Errors.insufficientNodeSpecs(), [data, id, labels], null);
			}
			if (Utils.isEmpty(specs?.data)) {
				specs.data = {};
			}
			if (specs?.id) {
				specs.data.id = specs?.id;
			}
			if (specs?.labels) {
				specs.data.labels = specs?.labels;
			}

			if (!(await this.nodePresent(specs?.data.id))) {
				return done(Errors.nodeDoesNotExist(specs?.data.id), [data, id, labels], null);
			}
			const labelSet = specs?.labels && specs?.labels.length > 0 ? `Set n:${specs?.labels.join(":")}` : "";
			const query = `Match (n{id: $id})  Set n=$data ${labelSet}`;
			const params = getNodeParams(specs);
			await session.executeWrite((tx) => tx.run(query, params));
			done(null, [data, id, labels], params.data);
		} catch (e: any) {
			done(e.message, [data, id, labels], null);
		} finally {
			await session.close();
		}
	}

	async nodePresent(id) {
		let present = false;
		await this.nodeExists(id, (x, y, z) => {
			present = z;
		});
		return present;
	}

	async upsertNode(data, id, labels, done) {
		const specs = Utils.getNodeSpecs(data, id, labels);
		if (specs === null) {
			throw new Error(Errors.insufficientNodeSpecs());
		}

		if (specs?.id && (await this.nodePresent(specs?.id))) {
			await this.updateNode(data, id, labels, done);
		} else {
			await this.createNode(data, id, labels, done);
		}
	}

	async getNodeLabelProperties(labelName, amount, done) {
		try {
			const propNames: string[] = [];
			const nodes = await this._getNodesWithLabel(labelName);
			for (const node of nodes) {
				const names = Object.keys(node);
				names.forEach((name) => {
					if (name !== "labels" && !_.includes(propNames, name)) {
						propNames.push(name);
					}
				});
			}
			done(null, [labelName, amount], propNames);
		} catch (e: any) {
			done(e.message, [labelName, amount], null);
		}
	}

	async searchNodes(term, fields, amount, done) {
		if (!amount) {
			amount = 100;
		}
		if (amount <= 0) {
			return done(null, [term, fields, amount], []);
		}
		if (Utils.isEmpty(term)) {
			return done(null, [term, fields, amount], []);
		}
		if (fields.length === 0) {
			fields = ["name"];
		}
		const lowerTerm = term.trim().toLowerCase();

		const whereOr: string[] = [];
		for (const field of fields) {
			if (field === "labels") {
				whereOr.push(`ANY(l in labels(n) WHERE toLower(l) =~ ".*${lowerTerm}.*")`);
			} else {
				// fulltext search would be a 100x faster and more accurate here
				whereOr.push(`toLower(n.${field}) =~".*${lowerTerm}.*"`);
			}
		}
		const session = this.getSession();
		const query = `Match (n) where ${whereOr.join(" OR ")} return n limit ${amount}`;
		try {
			const params = {};
			const result = await session.executeRead((tx) => tx.run(query, params));

			const records = result.records;
			if (records.length > 0) {
				done(
					null,
					[term, fields, amount],
					records.map((u) => u.get(0).properties),
				);
			} else {
				done(null, [term, fields, amount], []);
			}
		} catch (e: any) {
			done(e.message, [term, fields, amount], null);
		} finally {
			await session.close();
		}
	}

	async searchNodesWithLabel(term, fields, label, amount, done) {
		if (!amount) {
			amount = 100;
		}
		if (amount <= 0) {
			return done(null, [term, fields, label, amount], []);
		}
		if (Utils.isEmpty(term)) {
			return done(null, [term, fields, label, amount], []);
		}
		if (fields.length === 0) {
			fields = ["name"];
		}
		const lowerTerm = term.trim().toLowerCase();

		const whereOr: string[] = [];
		for (const field of fields) {
			if (field === "labels") {
				whereOr.push(`ANY(l in labels(n) WHERE toLower(l) =~ ".*${lowerTerm}.*")`);
			} else {
				// fulltext search would be a 100x faster and more accurate here
				whereOr.push(`toLower(n.${field}) =~".*${lowerTerm}.*"`);
			}
		}
		const session = this.getSession();
		const query = `Match (n) where '${label}' in labels(n) AND (${whereOr.join(" OR ")}) return n limit ${amount}`;
		try {
			const params = {};
			const result = await session.executeRead((tx) => tx.run(query, params));

			const records = result.records;
			if (records.length > 0) {
				done(
					null,
					[term, fields, label, amount],
					records.map((u) => u.get(0).properties),
				);
			} else {
				done(null, [term, fields, label, amount], []);
			}
		} catch (e: any) {
			done(e.message, [term, fields, label, amount], null);
		} finally {
			await session.close();
		}
	}

	async getNode(id, done) {
		let query;
		let params = {};

		if (_.isString(id)) {
			query = `Match (n{id: $id}) return n`;
			params["id"] = id;
		} else if (_.isFunction(id)) {
			// kinda possible by looping over all nodes in the db with the predicate but that's not really scalable or good practice
			return done("getNode with a predicate is not supported by the Neo4j adapter. Please use Mongo-like projections instead (https://www.mongodb.com/docs/manual/reference/operator/query/).", [id], null);
		} else if (_.isPlainObject(id)) {
			// this is where the Mongo-like specs are turned into Cypher constraints
			try {
				const constraint = toCypher(parseProjection(id), "n");
				query = `Match (n) Where ${constraint} return n`;
			} catch (e: any) {
				return done(e.message, [id], null);
			}
		}

		const session = this.getSession();
		try {
			const result = await session.executeRead((tx) => tx.run(query, params));

			const records = result.records;
			if (records.length > 0) {
				const node = Object.assign({}, records[0].get(0).properties);
				node.labels = records[0].get(0).labels;

				done(null, [id], node);
			} else {
				done(null, [id], null);
			}
		} catch (e: any) {
			done(e.message, [id], null);
		} finally {
			await session.close();
		}
	}

	async getNodes(projection, count, done) {
		if (_.isNil(projection)) {
			return done("Nil predicate for getNodes.", [projection, count], null);
		}
		if (!count) {
			count = 100;
		}
		if (count <= 0) {
			return done("The count should be a positive number", [projection, count], null);
		}
		let query;
		if (Utils.isEmpty(projection)) {
			query = `Match (n) return n limit ${count}`;
		} else if (_.isFunction(projection)) {
			// kinda possible by looping over all nodes in the db with the predicate but that's not really scalable or good practice
			return done("getNodes with a predicate is not supported by the Neo4j adapter. Please use Mongo-like projections instead (https://www.mongodb.com/docs/manual/reference/operator/query/).", [projection], null);
		} else if (_.isPlainObject(projection)) {
			try {
				const constraint = toCypher(parseProjection(projection), "n");
				query = `Match (n) Where ${constraint} return n limit ${count}`;
			} catch (e: any) {
				return done(e.message, [projection, count], null);
			}
		} else {
			return done("Please use a Mongo-like projections for getNodes, see https://www.mongodb.com/docs/manual/reference/operator/query/.", [projection, count], null);
		}

		const session = this.getSession();
		try {
			const params = {};
			const result = await session.executeRead((tx) => tx.run(query, params));

			const records = result.records;
			if (records.length > 0) {
				done(
					null,
					[projection, count],
					records.map((u) => u.get(0).properties),
				);
			} else {
				done(null, [projection, count], []);
			}
		} catch (e: any) {
			done(e.message, [projection, count], null);
		} finally {
			await session.close();
		}
	}

	async getNodesWithLabel(label, amount, done) {
		try {
			const nodes = this._getNodesWithLabel(label, amount);
			done(null, [label, amount], nodes);
		} catch (e: any) {
			done(e.message, [label, amount], null);
		}
	}

	async _getNodesWithLabel(label, amount = 100) {
		const session = this.getSession();
		try {
			const query = `Match (n) where '${label}' in labels(n) return n limit ${amount}`;
			const params = { amount };
			const result = await session.executeRead((tx) => tx.run(query, params));

			const records = result.records;
			if (records.length > 0) {
				const nodes = records.map((r) => r.get(0).properties);
				return nodes;
			} else {
				return [];
			}
		} finally {
			await session.close();
		}
	}

	async getNodeLabels(done) {
		const session = this.getSession();
		try {
			// todo: will not work with other dbs, like Memgraph
			const query = `call db.labels()`;
			const result = await session.executeRead((tx) => tx.run(query));

			const records = result.records;
			if (records.length > 0) {
				const labels = records.map((r) => r.get(0));
				done(null, [], labels);
			} else {
				done(null, [], []);
			}
		} catch (e: any) {
			done(e.message, [], null);
		} finally {
			await session.close();
		}
	}

	async deleteNodes(projection, done) {
		let query;

		if (_.isFunction(projection)) {
			// kinda possible by looping over all nodes in the db with the predicate but that's not really scalable or good practice
			return done("getEdges with a predicate is not supported by the Neo4j adapter. Please use Mongo-like projections instead (https://www.mongodb.com/docs/manual/reference/operator/query/).", [projection], null);
		} else if (_.isPlainObject(projection)) {
			try {
				const constraint = toCypher(parseProjection(projection), "n");
				query = `Match (n) Where ${constraint} detach delete n`;
			} catch (e: any) {
				return done(e.message, [projection], null);
			}
		} else {
			return done("Please use a Mongo-like projections for getNodes, see https://www.mongodb.com/docs/manual/reference/operator/query/.", [projection], null);
		}
		const session = this.getSession();
		try {
			const params = {};
			await session.executeWrite((tx) => tx.run(query, params));
			done(null, [projection], []);
		} catch (e: any) {
			done(e.message, [projection], null);
		} finally {
			await session.close();
		}
	}

	async nodeCount(projection, done) {
		let query;
		if (Utils.isEmpty(projection)) {
			query = "Match (n) return count(n)";
		} else if (_.isFunction(projection)) {
			// kinda possible by looping over all nodes in the db with the predicate but that's not really scalable or good practice
			return done("nodeCount with a predicate is not supported by the Neo4j adapter. Please use Mongo-like projections instead (https://www.mongodb.com/docs/manual/reference/operator/query/).", [projection], null);
		} else if (_.isPlainObject(projection)) {
			try {
				const constraint = toCypher(parseProjection(projection), "n");
				query = `Match (n) Where ${constraint} return count(n)`;
			} catch (e: any) {
				return done(e.message, [projection], null);
			}
		} else {
			return done("Please use a Mongo-like projections for nodeCount, see https://www.mongodb.com/docs/manual/reference/operator/query/.", [projection], null);
		}
		const session = this.getSession();
		try {
			const params = {};
			const results = await session.executeRead((tx) => tx.run(query, params));
			done(null, [projection], results.records[0].get(0).toNumber());
		} catch (e: any) {
			done(e.message, [projection], null);
		} finally {
			await session.close();
		}
	}

	//endregion

	//region Edges
	async deleteEdge(id, done) {
		let query;
		let params = {};
		if (_.isString(id)) {
			query = `Match ()-[e{id: $id}]->() delete e`;
			params["id"] = id;
		} else if (_.isFunction(id)) {
			// kinda possible by looping over all nodes in the db with the predicate but that's not really scalable or good practice
			return done("deleteEdge with a predicate is not supported by the Neo4j adapter. Please use Mongo-like projections instead (https://www.mongodb.com/docs/manual/reference/operator/query/).", [id], null);
		} else if (_.isPlainObject(id)) {
			try {
				const constraint = toCypher(parseProjection(id), "e");
				query = `Match  ()-[e]->() Where ${constraint} delete e`;
			} catch (e: any) {
				return done(e.message, [id], null);
			}
		} else {
			return done("Please use a Mongo-like projections for getNodes, see https://www.mongodb.com/docs/manual/reference/operator/query/.", [id], null);
		}
		const session = this.getSession();
		try {
			await session.executeWrite((tx) => tx.run(query, params));
			done(null, [id], []);
		} catch (e: any) {
			done(e.message, [id], null);
		} finally {
			await session.close();
		}
	}

	async getEdge(id, done) {
		let query;
		if (_.isString(id)) {
			query = `Match ()-[e{id: $id}]-() return e`;
		} else if (_.isFunction(id)) {
			// kinda possible by looping over all nodes in the db with the predicate but that's not really scalable or good practice
			return done("getEdge with a predicate is not supported by the Neo4j adapter. Please use Mongo-like projections instead (https://www.mongodb.com/docs/manual/reference/operator/query/).", [id], null);
		} else if (_.isPlainObject(id)) {
			// this is where the Mongo-like specs are turned into Cypher constraints
			try {
				const constraint = toCypher(parseProjection(id), "e");
				query = `Match ()-[e]-() Where ${constraint} return e`;
			} catch (e: any) {
				return done(e.message, [id], null);
			}
		}
		const session = this.getSession();
		try {
			const params = { id };
			const result = await session.executeRead((tx) => tx.run(query, params));
			if (result.records.length === 0) {
				return done(null, [id], null);
			} else {
				return done(null, [id], result.records[0].get(0).properties);
			}
		} catch (e: any) {
			done(e.message, [id], null);
		} finally {
			await session.close();
		}
	}

	async getEdgeBetween(sourceId, targetId, done) {
		const session = this.getSession();
		try {
			const query = `
					Match (u{id: $sourceId})
					Match (v{id: $targetId})
					Match (u)-[e]->(v) return e limit 1`;
			const params = { sourceId, targetId };
			const result = await session.executeRead((tx) => tx.run(query, params));

			const records = result.records;
			if (records.length > 0) {
				const edges = records.map((r) => r.get(0).properties);
				done(null, [sourceId, targetId], edges[0]);
			} else {
				done(null, [sourceId, targetId], null);
			}
		} catch (e: any) {
			done(e.message, [sourceId, targetId], null);
		} finally {
			await session.close();
		}
	}

	async createEdge(sourceId, targetId, data, id, labels, done) {
		const specs = Utils.getEdgeSpecs(sourceId, targetId, data, id, labels);
		if (_.isNil(specs)) {
			return done(Errors.insufficientEdgeSpecs(), [sourceId, targetId, data, id, labels], null);
		}
		if (specs?.labels.length === 0) {
			specs.labels = [DefaultOptions.defaultEdgeLabel];
		}
		if (specs?.labels.length > 1) {
			throw new Error("Cypher does not support multiple labels on a relationship.");
		}
		if (_.isNil(specs?.id)) {
			specs.id = Utils.id();
		}
		if (await this._edgeExists(specs?.id)) {
			throw new Error(`Edge with id '${id}' exists already.`);
		}
		const session = this.getSession();
		try {
			const query = `
					Match (u{id: $sourceId})
					Match (v{id: $targetId})
					Create (u)-[e:${specs?.labels[0]}{id: $id}]->(v)
					Set e=$data
					return e`;
			const params = getEdgeParams(specs);
			await session.executeWrite((tx) => tx.run(query, params));

			done(null, [sourceId, targetId, data, id, labels], params.data);
		} catch (e: any) {
			done(e.message, [sourceId, targetId, data, id, labels], null);
		} finally {
			await session.close();
		}
	}

	async upsertEdge(data, id, labels, done) {
		try {
			const specs = Utils.getEdgeSpecs(data, null, id, labels);
			if (specs === null) {
				return done(Errors.insufficientEdgeSpecs(), [data, id, labels], null);
			}
			if (specs?.id && (await this._edgeExists(specs?.id))) {
				return this.updateEdge(data, id, labels, done);
			} else {
				return this.createEdge(data, null, data, id, labels, done);
			}
		} catch (e: any) {
			done(e.message, [data, id, labels], null);
		}
	}

	async updateEdge(data, id, labels, done) {
		const specs = Utils.getEdgeSpecs(data, null, id, labels);
		if (_.isNil(specs)) {
			return done(Errors.insufficientEdgeSpecs(), [data, id, labels], null);
		}
		if (specs?.labels.length === 0) {
			specs.labels = [DefaultOptions.defaultEdgeLabel];
		}
		if (_.isNil(specs?.id)) {
			specs.id = Utils.id();
		}
		if (await this._edgeExists(specs?.id)) {
			const session = this.getSession();
			try {
				const query = `
							Match ()-[e{id: $id}]->()
							Set e=$data
							return e`;
				const params = getEdgeParams(specs);
				await session.executeWrite((tx) => tx.run(query, params));
				done(null, [data, id, labels], params.data);
			} catch (e: any) {
				done(e.message, [data, id, labels], null);
			}
		} else {
			return done(`Edge with id '${specs?.id}' does not exist and can not be updated.`);
		}
	}

	async getEdgeWithLabel(sourceId, targetId, label, done) {
		const session = this.getSession();
		try {
			const query = `
					Match (u{id: $sourceId})
					Match (v{id: $targetId})
					Match (u)-[e:${label}]->(v) return e limit 1`;
			const params = { sourceId, targetId };
			const result = await session.executeRead((tx) => tx.run(query, params));

			const records = result.records;
			if (records.length > 0) {
				const edges = records.map((r) => r.get(0).properties);
				done(null, [sourceId, targetId, label], edges[0]);
			} else {
				done(null, [sourceId, targetId, label], null);
			}
		} catch (e: any) {
			done(e.message, [sourceId, targetId, label], null);
		} finally {
			await session.close();
		}
	}

	async getEdgeLabels(done) {
		const session = this.getSession();
		try {
			const query = `call db.relationshipTypes()`;
			const result = await session.executeRead((tx) => tx.run(query));

			const records = result.records;
			if (records.length > 0) {
				const labels = records.map((r) => r.get(0));
				done(null, [], labels);
			} else {
				done(null, [], []);
			}
		} catch (e: any) {
			done(e.message, [], null);
		} finally {
			await session.close();
		}
	}

	async getEdgesWithLabel(label, amount, done) {
		const session = this.getSession();
		try {
			const query = `Match ()-[e]->() where type(e)='${label}' return e limit ${amount}`;
			const params = { amount };
			const result = await session.executeRead((tx) => tx.run(query, params));

			const records = result.records;
			if (records.length > 0) {
				const nodes = records.map((r) => r.get(0).properties);
				done(null, [label, amount], nodes);
			} else {
				done(null, [label, amount], []);
			}
		} catch (e: any) {
			done(e.message, [label, amount], null);
		} finally {
			await session.close();
		}
	}

	async getEdges(projection, amount, done) {
		let query;

		if (_.isFunction(projection)) {
			// kinda possible by looping over all nodes in the db with the predicate but that's not really scalable or good practice
			return done("getEdges with a predicate is not supported by the Neo4j adapter. Please use Mongo-like projections instead (https://www.mongodb.com/docs/manual/reference/operator/query/).", [projection], null);
		} else if (_.isPlainObject(projection)) {
			try {
				const constraint = toCypher(parseProjection(projection), "e");
				query = `Match ()-[e]->() Where ${constraint} return e`;
			} catch (e: any) {
				return done(e.message, [projection], null);
			}
		} else {
			return done("Please use a Mongo-like projections for getNodes, see https://www.mongodb.com/docs/manual/reference/operator/query/.", [projection], null);
		}
		const session = this.getSession();
		try {
			const params = {};
			const result = await session.executeRead((tx) => tx.run(query, params));

			const records = result.records;
			if (records.length > 0) {
				done(
					null,
					[projection],
					records.map((u) => u.get(0).properties),
				);
			} else {
				done(null, [projection], []);
			}
		} catch (e: any) {
			done(e.message, [projection], null);
		} finally {
			await session.close();
		}
	}

	async edgeCount(projection, done) {
		let query;
		if (Utils.isEmpty(projection)) {
			query = "Match ()-[e]->() return count(e)";
		} else if (_.isFunction(projection)) {
			// kinda possible by looping over all nodes in the db with the predicate but that's not really scalable or good practice
			return done("nodeCount with a predicate is not supported by the Neo4j adapter. Please use Mongo-like projections instead (https://www.mongodb.com/docs/manual/reference/operator/query/).", [projection], null);
		} else if (_.isPlainObject(projection)) {
			try {
				const constraint = toCypher(parseProjection(projection), "e");
				query = `Match ()-[e]->() Where ${constraint} return count(e)`;
			} catch (e: any) {
				return done(e.message, [projection], null);
			}
		} else {
			return done("Please use a Mongo-like projections for getNodes, see https://www.mongodb.com/docs/manual/reference/operator/query/.", [projection], null);
		}
		const session = this.getSession();
		try {
			const params = {};
			const results = await session.executeRead((tx) => tx.run(query, params));
			done(null, [projection], results.records[0].get(0).toNumber());
		} catch (e: any) {
			done(e.message, [projection], null);
		} finally {
			await session.close();
		}
	}


	async _edgeExists(id) {
		const session = this.getSession();
		try {
			const query = `Match ()-[e{id: $id}]->() return e;`;
			const results = await session.executeRead((tx) => tx.run(query, { id }));
			return results.records.length > 0;
		} catch (e) {
			return false;
		} finally {
			await session.close();
		}
	}

	async edgeExists(id, done) {
		const session = this.getSession();
		try {
			const result = await session.executeRead((tx) => tx.run("Match ()-[e{id: $id}]->() return e", { id }));
			done(null, [id], result.records.length > 0);
		} catch (e: any) {
			done(e.message, [id], false);
		} finally {
			await session.close();
		}
	}

	//endregion

	//region Graph
	async clear(done) {
		try {
			const session = this.getSession();
			try {
				// this would be a proper way to do it but the driver does not accept it
				const queryProper = `
						:auto
						Match (n)
						WITH distinct n
						CALL { WITH n
							detach DELETE n
						} IN TRANSACTIONS OF 10000 ROWS;`;
				// this one will only work for small databases
				const query = "Match (n) detach delete n";
				await session.executeWrite((tx) => tx.run(query));
				done(null, [], null);
			} catch (e: any) {
				done(e.message, [], null);
			} finally {
				await session.close();
			}
		} catch (e: any) {
			done(e.message, [], null);
		}
	}

	async inferSchemaGraph(cached, done) {
		try {
			const g = await this.getSchema();
			done(null, [], g);
		} catch (e: any) {
			done(e.message, [], null);
		}
	}

	async getNeighborhood(id, amount, done) {
		if (!amount) {
			amount = 100;
		}
		if (amount <= 0) {
			return done(null, [id, amount], []);
		}
		const session = this.getSession();
		const query = `
				Match (c{id:'${id}'})
				Optional Match (parent)-[pr]->(c)
				Optional Match (c)-[cr]->(child)
				Return parent,pr,c,cr,child
				limit ${amount}`;
		try {
			const params = {};
			const result = await session.executeRead((tx) => tx.run(query, params));

			const records = result.records;
			const g = new Graph();
			const addNode = (n) => {
				if (!g.nodeIdExists(n.id)) {
					g.addNode(n);
				}
			};
			const addEdge = (e) => {
				if (!g.edgeExists(e.id)) {
					g.addEdge(e);
				}
			};
			const toGraphNode = (b) => {
				const u = Object.assign({}, b.properties);
				u.labels = b.labels;
				return u;
			};
			const toGraphEdge = (sourceId, b, targetId) => {
				const u = Object.assign({}, b.properties);
				u.labels = b.type ? [b.type] : [];
				u.sourceId = sourceId;
				u.targetId = targetId;
				return u;
			};
			if (records.length > 0) {
				//records.map((u) => u.get(0).properties)
				for (const record of records) {
					const center = record.get("c");
					const parent = record.get("parent");
					const child = record.get("child");
					const parentEdge = record.get("pr");
					const childEdge = record.get("cr");

					addNode(toGraphNode(center));
					if (parent) {
						addNode(toGraphNode(parent));
						addEdge(toGraphEdge(parent.properties.id, parentEdge, id));
					}
					if (child) {
						addNode(toGraphNode(child));
						addEdge(toGraphEdge(id, childEdge, child.properties.id));
					}
				}
				done(null, [id, amount], g);
			} else {
				done(null, [id, amount], g);
			}
		} catch (e: any) {
			done(e.message, [id, amount], null);
		} finally {
			await session.close();
		}
	}

	async pathQuery(path, amount, done) {
		try {
			const found = await this._pathQuery(path, amount);
			done(null, [path], found);
		} catch (e: any) {
			done(e.message, [], null);
		}
	}


	async getSchema() {
		const session = this.getSession();
		try {
			const query = `Call db.schema.visualization`;
			const params = {};
			const result = await session.executeRead((tx) => tx.run(query, params));

			const records = result.records;
			const g = new Graph();
			if (records.length > 0) {
				// should be only one record
				const rec = records[0];
				const nodes = rec.get("nodes").map((u) => {
					const w = Object.assign({}, u.properties);
					w.id = u.identity;
					return w;
				});
				const idMap = {};
				for (const node of nodes) {
					const id = Utils.id();
					g.addNode({
						name: node.name,
						id,
					});

					idMap[node.id.toString()] = id;
				}
				const edges = rec.get("relationships").map((u) => {
					const w = Object.assign({}, u.properties);
					w.sourceId = u.startNodeElementId;
					w.targetId = u.endNodeElementId;
					return w;
				});
				for (const edge of edges) {
					g.addEdge({
						name: edge.name,
						sourceId: idMap[edge.sourceId.toString()],
						targetId: idMap[edge.targetId.toString()],
					});
				}
				return g;
			} else {
				return g;
			}
		} finally {
			await session.close();
		}
	}

	async _pathQuery(path, amount = 1000) {
		// check nothing is empty
		path.forEach((u) => {
			if (Utils.isEmpty(u)) {
				throw new Error("Path query items cannot be empty.");
			}
		});
		const session = this.getSession();
		try {
			const g = new Graph();
			const idMap = {};

			function convertNode(n) {
				const u = Object.assign({}, n.properties);
				u.labels = n.labels;
				idMap[n.identity.toNumber().toString()] = u.id;
				return u;
			}

			function convertEdge(e) {
				const u = Object.assign({}, e.properties);

				const internalSourceId = e.start.toNumber().toString();
				const internalTargetId = e.end.toNumber().toString();
				if (!idMap[internalSourceId] || !idMap[internalTargetId]) {
					throw new Error("Could not find relationship endpoint.");
				}
				u.labels = [e.type];
				u.sourceId = idMap[internalSourceId];
				u.targetId = idMap[internalTargetId];
				return u;
			}

			function addNode(n) {
				if (!g.nodeIdExists(n.id)) {
					g.addNode(n);
				}
			}

			function addEdge(e) {
				if (!g.edgeExists(e.id)) {
					g.addEdge(e);
				}
			}

			if (Utils.isEmpty(path)) {
				return g;
			}

			const star = "*";

			if (path.length === 1) {
				if (path[0] === star) {
					throw new Error("Cannot path-query all nodes.");
				} else {
					const nodes = await this._getNodesWithLabel(path[0], amount);
					g.addNodes(nodes);
					return g;
				}
			}
			const query = pathQueryToCypher(path, amount);
			const params = {};
			const result = await session.executeRead((tx) => tx.run(query, params));

			const records = result.records;
			if (records.length > 0) {
				for (const record of records) {
					const segments = record.get("p").segments;
					if (segments.length > 0) {
						for (const segment of segments) {
							const s = convertNode(segment["start"]);
							addNode(s);
							const e = convertNode(segment["end"]);
							addNode(e);
							const r = convertEdge(segment["relationship"]);
							addEdge(r);
						}
					}
				}

				return g;
			} else {
				return g;
			}
		} finally {
			await session.close();
		}
	}


	//endregion

}

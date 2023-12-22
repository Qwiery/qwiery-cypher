import _ from "lodash";
import neo4j from "neo4j-driver";
import { Utils, Errors } from "@orbifold/utils";
import {toCypher} from "./projections";
import {parseProjection} from "@orbifold/projections";
import {Graph} from "@orbifold/graphs";

const AdapterId = "cypher";
const DefaultOptions = {
	protocol: "bolt",
	host: "localhost",
	port: 7687,
	user: "neo4j",
	password: "123456789",
	defaultNodeLabel: "Thing",
	defaultEdgeLabel: "RelatedTo",
	database: "neo4j",
};

/**
 * Assembles the Neo4j node from the given specs.
 * @param specs
 * @returns {{}}
 */
function getNodeParams(specs) {
	let node:any = {};
	if (_.isNil(specs)) {
		return node;
	}
	node.id = specs.id || Utils.id();
	if (_.isPlainObject(specs.data)) {
		node = _.assign(node, Utils.getReducedPlainObject(specs.data, ["id", "labels"]));
	}
	return {
		id: node.id,
		data: node,
		labels: specs.labels,
	};
}

/**
 * Assembles the Neo4j edge params from the given specs
 * @param specs
 * @returns {{}|{sourceId, data: {}, targetId, id: *, labels}}
 */
function getEdgeParams(specs) {
	let edge:any = {};
	if (_.isNil(specs)) {
		return edge;
	}
	edge.id = specs.id || Utils.id();
	if (_.isPlainObject(specs.data)) {
		edge = _.assign(edge, Utils.getReducedPlainObject(specs.data, ["id", "labels"]));
	}
	return {
		id: edge.id,
		data: edge,
		labels: specs.labels,
		sourceId: specs.sourceId,
		targetId: specs.targetId,
	};
}

/**
 * Returns a session with optionally the database specified.
 * @returns {*}
 */
function getSession(driver, options): any {
	if (options && options.neo4j && !Utils.isEmpty(options.neo4j.database)) {
		return driver.session({ database: options.neo4j.database });
	} else {
		return driver.session();
	}
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
	const coll:string[] = [];
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

/*
 * Adapter implementation.
 * */
export  async function CypherAdapter(options, done) {
	const qwiery = this;
	let driver = null;
	let error = null;
	let isInitialized = false;

	async function getNodesWithLabel(label, amount = 100) {
		const session = getSession(driver, options);
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

	async function getSchema() {
		const session = getSession(driver, options);
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

	async function pathQuery(path, amount = 1000) {
		// check nothing is empty
		path.forEach((u) => {
			if (Utils.isEmpty(u)) {
				throw new Error("Path query items cannot be empty.");
			}
		});
		const session = getSession(driver, options);
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
					const nodes = await getNodesWithLabel(path[0], amount);
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

	/**
	 * The method exists below as an adapter override but this one is somewhat easier to use and appears
	 * in pretty much all methods.
	 * @param id
	 * @returns {Promise<boolean>}
	 */
	async function nodeExists(id) {
		const session = getSession(driver, options);
		try {
			const query = `Match (n{id: $id}) return n;`;
			const results = await session.executeRead((tx) => tx.run(query, { id }));
			return results.records.length > 0;
		} catch (e) {
			return false;
		} finally {
			await session.close();
		}
	}

	async function edgeExists(id) {
		const session = getSession(driver, options);
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

	const api = {
		//region Nodes
		createNode(done) {
			return async ([data, id, labels]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				const specs = Utils.getNodeSpecs(data, id, labels);
				if (_.isNil(specs)) {
					return done(Errors.insufficientNodeSpecs(), [data, id, labels], null);
				}
				if (specs.labels.length === 0) {
					specs.labels = [DefaultOptions.defaultNodeLabel];
				}
				if (_.isNil(specs.id)) {
					specs.id = Utils.id();
				}
				// hijack the nodeExist method

				if (await this.nodePresent(specs.id)) {
					throw new Error(`Node with id '${specs.id}' exists already.`);
				}
				const session = getSession(driver, options);
				try {
					const query = `Create (n:${specs.labels.join(":")}) Set n=$data`;
					const params = getNodeParams(specs);
					await session.executeWrite((tx) => tx.run(query, params));
					session.close();
					done(null, [data, id, labels], params.data);
				} catch (e) {
					done(e.message, [data, id, labels], null);
				}
			};
		},

		async nodePresent(id) {
			let present = false;
			await this.nodeExists((x, y, z) => {
				present = z;
			})([id]);
			return present;
		},

		nodeExists(done) {
			return async ([id]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				const session = getSession(driver, options);
				try {
					const result = await session.executeRead((tx) => tx.run("Match (n{id: $id}) return n", { id }));
					done(null, [id], result.records.length > 0);
				} catch (e) {
					error = e.message;
					done(e.message, [id], false);
				} finally {
					await session.close();
				}
			};
		},

		createNodes(done) {
			return async ([seq]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				try {
					const coll = [];
					for (const item of seq) {
						// only a string or plain object will work here
						const n = await this.createNode(_.noop)([item]);
						if (n) {
							coll.push(n);
						}
					}
					done(null, [seq], coll);
				} catch (e) {
					done(e.message, [seq], null);
				}
			};
		},

		updateNode(done) {
			return async ([data, id, labels]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				const session = getSession(driver, options);
				try {
					const specs = Utils.getNodeSpecs(data, id, labels);
					if (specs === null) {
						return done(errors.insufficientNodeSpecs(), [data, id, labels], null);
					}
					if (Utils.isEmpty(specs.data)) {
						specs.data = {};
					}
					if (specs.id) {
						specs.data.id = specs.id;
					}
					if (specs.labels) {
						specs.data.labels = specs.labels;
					}

					if (!(await this.nodePresent(specs.data.id))) {
						return done(errors.nodeDoesNotExist(specs.data.id), [data, id, labels], null);
					}
					const labelSet = specs.labels && specs.labels.length > 0 ? `Set n:${specs.labels.join(":")}` : "";
					const query = `Match (n{id: $id})  Set n=$data ${labelSet}`;
					const params = getNodeParams(specs);
					await session.executeWrite((tx) => tx.run(query, params));
					done(null, [data, id, labels], params.data);
				} catch (e) {
					done(e.message, [data, id, labels], null);
				} finally {
					await session.close();
				}
			};
		},

		upsertNode(done) {
			const self = this;
			return async ([data, id, labels]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				const specs = Utils.getNodeSpecs(data, id, labels);
				if (specs === null) {
					throw new Error(errors.insufficientNodeSpecs());
				}

				if (specs.id && (await this.nodePresent(specs.id))) {
					const m = this.updateNode(done);
					const ar = [data, id, labels];
					await m(ar);
				} else {
					const m = this.createNode(done);
					const ar = [data, id, labels];
					await m(ar);
				}
			};
		},

		getNodeLabelProperties(done) {
			return async ([labelName, amount = 1000]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}

				try {
					const propNames = [];
					const nodes = await getNodesWithLabel(labelName);
					for (const node of nodes) {
						const names = Object.keys(node);
						names.forEach((name) => {
							if (name !== "labels" && !_.includes(propNames, name)) {
								propNames.push(name);
							}
						});
					}
					done(null, [labelName, amount], propNames);
				} catch (e) {
					done(e.message, [labelName, amount], null);
				}
			};
		},

		/**
		 * Search of the nodes for the given term.
		 * @param term {string} A search term.
		 * @param [fields] {string[]} The properties to consider in the search. If none given the name will be considered only.
		 * @param amount {number} The maximum amount of nodes to return.
		 */
		searchNodes(done) {
			return async ([term, fields, amount]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
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

				const whereOr = [];
				for (const field of fields) {
					if (field === "labels") {
						whereOr.push(`ANY(l in labels(n) WHERE toLower(l) =~ ".*${lowerTerm}.*")`);
					} else {
						// fulltext search would be a 100x faster and more accurate here
						whereOr.push(`toLower(n.${field}) =~".*${lowerTerm}.*"`);
					}
				}
				const session = getSession(driver, options);
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
				} catch (e) {
					done(e.message, [term, fields, amount], null);
				} finally {
					await session.close();
				}
			};
		},

		searchNodesWithLabel(done) {
			return async ([term, fields, label, amount]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
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

				const whereOr = [];
				for (const field of fields) {
					if (field === "labels") {
						whereOr.push(`ANY(l in labels(n) WHERE toLower(l) =~ ".*${lowerTerm}.*")`);
					} else {
						// fulltext search would be a 100x faster and more accurate here
						whereOr.push(`toLower(n.${field}) =~".*${lowerTerm}.*"`);
					}
				}
				const session = getSession(driver, options);
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
				} catch (e) {
					done(e.message, [term, fields, label, amount], null);
				} finally {
					await session.close();
				}
			};
		},

		getNode(done) {
			return async ([id]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}

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
					} catch (e) {
						return done(e.message, [id], null);
					}
				}

				const session = getSession(driver, options);
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
				} catch (e) {
					done(e.message, [id], null);
				} finally {
					await session.close();
				}
			};
		},

		getNodes(done) {
			return async ([projection, count]) => {
				if (_.isNil(projection)) {
					return done("Nil predicate for getNodes.", [projection, count], null);
				}
				if (!count) {
					count = 100;
				}
				if (count <= 0) {
					return done(e.message, [projection, count], null);
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
					} catch (e) {
						return done(e.message, [projection, count], null);
					}
				} else {
					return done("Please use a Mongo-like projections for getNodes, see https://www.mongodb.com/docs/manual/reference/operator/query/.", [projection, count], null);
				}

				const session = getSession(driver, options);
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
				} catch (e) {
					done(e.message, [projection, count], null);
				} finally {
					await session.close();
				}
			};
		},

		getNodesWithLabel(done) {
			return async ([label, amount = 1000]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}

				try {
					const nodes = getNodesWithLabel(label, amount);
					done(null, [label, amount], nodes);
				} catch (e) {
					done(e.message, [label, amount], null);
				}
			};
		},

		getNodeLabels(done) {
			return async ([]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				const session = getSession(driver, options);
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
				} catch (e) {
					done(e.message, [], null);
				} finally {
					await session.close();
				}
			};
		},

		deleteNodes(done) {
			return async ([projection]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				let query;

				if (_.isFunction(projection)) {
					// kinda possible by looping over all nodes in the db with the predicate but that's not really scalable or good practice
					return done("getEdges with a predicate is not supported by the Neo4j adapter. Please use Mongo-like projections instead (https://www.mongodb.com/docs/manual/reference/operator/query/).", [projection], null);
				} else if (_.isPlainObject(projection)) {
					try {
						const constraint = toCypher(parseProjection(projection), "n");
						query = `Match (n) Where ${constraint} detach delete n`;
					} catch (e) {
						return done(e.message, [projection], null);
					}
				} else {
					return done("Please use a Mongo-like projections for getNodes, see https://www.mongodb.com/docs/manual/reference/operator/query/.", [projection], null);
				}
				const session = getSession(driver, options);
				try {
					const params = {};
					await session.executeWrite((tx) => tx.run(query, params));
					done(null, [projection], []);
				} catch (e) {
					done(e.message, [projection], null);
				} finally {
					await session.close();
				}
			};
		},

		deleteNode(done) {
			return async ([id]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
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
					} catch (e) {
						return done(e.message, [id], null);
					}
				} else {
					return done("Please use a Mongo-like projections for getNodes, see https://www.mongodb.com/docs/manual/reference/operator/query/.", [id], null);
				}
				const session = getSession(driver, options);
				try {
					await session.executeWrite((tx) => tx.run(query, params));
					done(null, [id], []);
				} catch (e) {
					done(e.message, [id], null);
				} finally {
					await session.close();
				}
			};
		},

		nodeCount(done) {
			return async ([projection]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
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
					} catch (e) {
						return done(e.message, [projection], null);
					}
				} else {
					return done("Please use a Mongo-like projections for nodeCount, see https://www.mongodb.com/docs/manual/reference/operator/query/.", [projection], null);
				}
				const session = getSession(driver, options);
				try {
					const params = {};
					const results = await session.executeRead((tx) => tx.run(query, params));
					done(null, [projection], results.records[0].get(0).toNumber());
				} catch (e) {
					done(e.message, [projection], null);
				} finally {
					await session.close();
				}
			};
		},
		//endregion

		//region Edges

		deleteEdge(done) {
			return async ([id]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
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
					} catch (e) {
						return done(e.message, [id], null);
					}
				} else {
					return done("Please use a Mongo-like projections for getNodes, see https://www.mongodb.com/docs/manual/reference/operator/query/.", [id], null);
				}
				const session = getSession(driver, options);
				try {
					await session.executeWrite((tx) => tx.run(query, params));
					done(null, [id], []);
				} catch (e) {
					done(e.message, [id], null);
				} finally {
					await session.close();
				}
			};
		},

		getEdge(done) {
			return async ([id]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
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
					} catch (e) {
						return done(e.message, [id], null);
					}
				}
				const session = getSession(driver, options);
				try {
					const params = { id };
					const result = await session.executeRead((tx) => tx.run(query, params));
					if (result.records.length === 0) {
						return done(null, [id], null);
					} else {
						return done(null, [id], result.records[0].get(0).properties);
					}
				} catch (e) {
					done(e.message, [id], null);
				} finally {
					await session.close();
				}
			};
		},

		getEdgeBetween(done) {
			return async ([sourceId, targetId]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				const session = getSession(driver, options);
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
				} catch (e) {
					done(e.message, [sourceId, targetId], null);
				} finally {
					await session.close();
				}
			};
		},

		createEdge(done) {
			return async ([sourceId, targetId, data = null, id = null, labels = null]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				const specs = Utils.getEdgeSpecs(sourceId, targetId, data, id, labels);
				if (_.isNil(specs)) {
					return done(Errors.insufficientEdgeSpecs(), [sourceId, targetId, data, id, labels], null);
				}
				if (specs.labels.length === 0) {
					specs.labels = [DefaultOptions.defaultEdgeLabel];
				}
				if (specs.labels.length > 1) {
					throw new Error("Cypher does not support multiple labels on a relationship.");
				}
				if (_.isNil(specs.id)) {
					specs.id = Utils.id();
				}
				if (await edgeExists(specs.id)) {
					throw new Error(`Edge with id '${id}' exists already.`);
				}
				const session = getSession(driver, options);
				try {
					const query = `
					Match (u{id: $sourceId})
					Match (v{id: $targetId})
					Create (u)-[e:${specs.labels[0]}{id: $id}]->(v)
					Set e=$data
					return e`;
					const params = getEdgeParams(specs);
					await session.executeWrite((tx) => tx.run(query, params));

					done(null, [sourceId, targetId, data, id, labels], params.data);
				} catch (e) {
					done(e.message, [sourceId, targetId, data, id, labels], null);
				} finally {
					await session.close();
				}
			};
		},

		upsertEdge(done) {
			return async ([data = null, id = null, labels = null]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				try {
					const specs = Utils.getEdgeSpecs(data, null, id, labels);
					if (specs === null) {
						return done(errors.insufficientEdgeSpecs(), [data, id, labels], null);
					}
					if (specs.id && (await edgeExists(specs.id))) {
						return this.updateEdge(done)([data, id, labels]);
					} else {
						return this.createEdge(done)([data, null, data, id, labels]);
					}
				} catch (e) {
					done(e.message, [data, id, labels], null);
				}
			};
		},

		updateEdge(done) {
			return async ([data, id, labels]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				const specs = Utils.getEdgeSpecs(data, null, id, labels);
				if (_.isNil(specs)) {
					return done(Errors.insufficientEdgeSpecs(), [data, id, labels], null);
				}
				if (specs.labels.length === 0) {
					specs.labels = [DefaultOptions.defaultEdgeLabel];
				}
				if (_.isNil(specs.id)) {
					specs.id = Utils.id();
				}
				if (await edgeExists(specs.id)) {
					const session = getSession(driver, options);
					try {
						const query = `
							Match ()-[e{id: $id}]->()
							Set e=$data
							return e`;
						const params = getEdgeParams(specs);
						await session.executeWrite((tx) => tx.run(query, params));
						done(null, [data, id, labels], params.data);
					} catch (e) {
						done(e.message, [data, id, labels], null);
					}
				} else {
					return done(`Edge with id '${specs.id}' does not exist and can not be updated.`);
				}
			};
		},

		getEdgeWithLabel(done) {
			return async ([sourceId, targetId, label]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				const session = getSession(driver, options);
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
				} catch (e) {
					done(e.message, [sourceId, targetId, label], null);
				} finally {
					await session.close();
				}
			};
		},

		getEdgeLabels(done) {
			return async ([]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				const session = getSession(driver, options);
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
				} catch (e) {
					done(e.message, [], null);
				} finally {
					await session.close();
				}
			};
		},

		getEdgesWithLabel(done) {
			return async ([label, amount]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				const session = getSession(driver, options);
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
				} catch (e) {
					done(e.message, [label, amount], null);
				} finally {
					await session.close();
				}
			};
		},

		getEdges(done) {
			return async ([projection, amount]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				let query;

				if (_.isFunction(projection)) {
					// kinda possible by looping over all nodes in the db with the predicate but that's not really scalable or good practice
					return done("getEdges with a predicate is not supported by the Neo4j adapter. Please use Mongo-like projections instead (https://www.mongodb.com/docs/manual/reference/operator/query/).", [projection], null);
				} else if (_.isPlainObject(projection)) {
					try {
						const constraint = toCypher(parseProjection(projection), "e");
						query = `Match ()-[e]->() Where ${constraint} return e`;
					} catch (e) {
						return done(e.message, [projection], null);
					}
				} else {
					return done("Please use a Mongo-like projections for getNodes, see https://www.mongodb.com/docs/manual/reference/operator/query/.", [projection], null);
				}
				const session = getSession(driver, options);
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
				} catch (e) {
					done(e.message, [projection], null);
				} finally {
					await session.close();
				}
			};
		},

		edgeCount(done) {
			return async ([projection]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
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
					} catch (e) {
						return done(e.message, [projection], null);
					}
				} else {
					return done("Please use a Mongo-like projections for getNodes, see https://www.mongodb.com/docs/manual/reference/operator/query/.", [projection], null);
				}
				const session = getSession(driver, options);
				try {
					const params = {};
					const results = await session.executeRead((tx) => tx.run(query, params));
					done(null, [projection], results.records[0].get(0).toNumber());
				} catch (e) {
					done(e.message, [projection], null);
				} finally {
					await session.close();
				}
			};
		},

		edgeExists(done) {
			return async ([id]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				const session = getSession(driver, options);
				try {
					const result = await session.executeRead((tx) => tx.run("Match ()-[e{id: $id}]->() return e", { id }));
					done(null, [id], result.records.length > 0);
				} catch (e) {
					error = e.message;
					done(e.message, [id], false);
				} finally {
					await session.close();
				}
			};
		},
		//endregion

		//region Graphs
		clear(done) {
			return async () => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				try {
					const session = getSession(driver, options);
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
					} catch (e) {
						done(e.message, [], null);
					} finally {
						await session.close();
					}
				} catch (e) {
					done(e.message, [], null);
				}
			};
		},

		/** @inheritdoc */
		inferSchemaGraph(done) {
			return async ([cached]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				try {
					const g = await getSchema();
					done(null, [], g);
				} catch (e) {
					done(e.message, [], null);
				}
			};
		},

		getNeighborhood(done) {
			return async ([id, amount]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				if (!amount) {
					amount = 100;
				}
				if (amount <= 0) {
					return done(null, [id, amount], []);
				}
				const session = getSession(driver, options);
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
				} catch (e) {
					done(e.message, [id, amount], null);
				} finally {
					await session.close();
				}
			};
		},

		/**
		 * A path query defines a patter, e.g. ["A",*,"B","knows","C"].
		 * There are only two possibilities:
		 * - an arbitrary edge, meaning all nodes with the label in the next entry
		 * - a specific edge label, the next item has to be *
		 * @param path
		 * @return {Promise<Graph>}
		 */
		pathQuery(done) {
			return async ([path, amount]) => {
				if (!isInitialized) {
					// 'sqlite' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}

				try {
					const found = await pathQuery(path, amount);
					done(null, [path], found);
				} catch (e) {
					done(e.message, [], null);
				}
			};
		},
		//endregion
	};

	function getDriver(opt = {}) {
		try {
			opt = _.assign(DefaultOptions, opt);
			console.log(`${opt.protocol}://${opt.host}:${opt.port}/${opt.database}`);
			return neo4j.driver(`${opt.protocol}://${opt.host}:${opt.port}`, neo4j.auth.basic(opt.user, opt.password));
		} catch (e:any) {
			error = e.message;
			console.error(error)
		}
		return null;
	}

	async function setup(opt = {}) {
		if (isInitialized) {
			return;
		}
		error = null;
		driver = getDriver(opt);
		if (driver) {
			const session = getSession(driver, options);
			try {
				const result = await session.executeWrite((tx) => tx.run("return 3.14"));
				const singleRecord = result.records[0];
				const pi = singleRecord.get(0);
				error = pi === 3.14 ? null : "Failed to connect to Neo4j.";
				await session.close();
				// make sure this hook is set up only once
				process.on("SIGTERM", () => {
					if (driver) {
						driver.close();
					}
				});
				isInitialized = true;
			} catch (e) {
				error = e.message;
			}
		}
	}

	process.nextTick(() => {
		done(null, api);
	});
}

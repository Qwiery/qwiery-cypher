import { CallbackAPI } from "~/callbackAPI";


/**
 * This is the client-side API with direct access from the browser to Neo4j.
 * The odd-looking twist from callbacks to promises is because the callback API is used by Qwiery DAL.
 */
export class GraphAPI {
	public get options(): any {
		return this.callbackAPI.options;
	}

	public set options(value: any) {
		this.callbackAPI.options = value;
	}

	private callbackAPI: CallbackAPI;

	constructor(options: any = {}) {
		this.callbackAPI = new CallbackAPI(options);

	}

	/**
	 * Closes the underlying connection.
	 * @return {Promise<void>}
	 */
	async close(): Promise<void> {
		await this.callbackAPI.close();
	}

	//region Nodes

	async nodeExists(id): Promise<any> {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.nodeExists(id, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async deleteNode(id: string) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.deleteNode(id, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}


	async createNode(data = null, id = null, labels = null): Promise<any> {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.createNode(data, id, labels, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}


	async createNodes(seq) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.createNodes(seq, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async updateNode(data, id, labels) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.updateNode(data, id, labels, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}


	async upsertNode(data, id, labels) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.upsertNode(data, id, labels, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async getNodeLabelProperties(labelName, amount) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.getNodeLabelProperties(labelName, amount, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async searchNodes(term, fields, amount) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.searchNodes(term, fields, amount, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async searchNodesWithLabel(term, fields, label, amount) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.searchNodesWithLabel(term, fields, label, amount, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async getNode(id) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.getNode(id, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async getNodes(projection, count) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.getNodes(projection, count, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async getNodesWithLabel(label, amount) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.getNodesWithLabel(label, amount, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}


	async getNodeLabels() {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.getNodeLabels((err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async deleteNodes(projection) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.deleteNodes(projection, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async nodeCount(projection) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.nodeCount(projection, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	//endregion

	//region Edges
	async deleteEdge(id) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.deleteEdge(id, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async getEdge(id) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.getEdge(id, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async getEdgeBetween(sourceId, targetId) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.getEdgeBetween(sourceId, targetId, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async createEdge(sourceId, targetId, data, id, labels) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.createEdge(sourceId, targetId, data, id, labels, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async upsertEdge(data, id, labels) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.upsertEdge(data, id, labels, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async updateEdge(data, id, labels) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.updateEdge(data, id, labels, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async getEdgeWithLabel(sourceId, targetId, label) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.getEdgeWithLabel(sourceId, targetId, label, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async getEdgeLabels() {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.getEdgeLabels((err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async getEdgesWithLabel(label, amount) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.getEdgesWithLabel(label, amount, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async getEdges(projection, amount) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.getEdges(projection, amount, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async edgeCount(projection) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.edgeCount(projection, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}


	async edgeExists(id) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.edgeExists(id, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	//endregion

	//region Graph
	async clear() {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.clear((err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async inferSchemaGraph(cached) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.inferSchemaGraph(cached, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async getNeighborhood(id, amount) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.getNeighborhood(id, amount, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	async pathQuery(path, amount) {
		return new Promise(async (resolve, reject) => {
			await this.callbackAPI.pathQuery(path, amount, (err, params, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}


	//endregion
}


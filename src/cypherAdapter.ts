import _ from "lodash";
import neo4j from "neo4j-driver";
import { Utils, Errors } from "@orbifold/utils";
import { toCypher } from "./projections";
import { parseProjection } from "@orbifold/projections";
import { Graph } from "@orbifold/graphs";
import { CallbackAPI } from "~/callbackAPI";

const AdapterId = "cypher";

/*
 * Adapter implementation.
 * */
export async function CypherAdapter(options, done) {
	const qwiery = this;
	let driver = null;
	let error = null;
	let isInitialized = false;
	let callbackAPI: CallbackAPI | null = null;



	const api = {
		//region Nodes
		createNode(done) {
			return async ([data, id, labels]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				await callbackAPI?.createNode(data, id, labels, done);
			};
		},

		nodeExists(done) {
			return async ([id]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				await callbackAPI?.nodeExists(id, done);
			};
		},

		createNodes(done) {
			return async ([seq]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				await callbackAPI?.createNodes(seq, done);
			};
		},

		updateNode(done) {
			return async ([data, id, labels]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				await callbackAPI?.updateNode(data, id, labels, done);
			};
		},

		upsertNode(done) {
			const self = this;
			return async ([data, id, labels]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				await callbackAPI?.upsertNode(data, id, labels, done);
			};
		},

		getNodeLabelProperties(done) {
			return async ([labelName, amount = 1000]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}

				await callbackAPI?.getNodeLabelProperties(labelName, amount, done);
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
				await callbackAPI?.searchNodes(term, fields, amount, done);
			};
		},

		searchNodesWithLabel(done) {
			return async ([term, fields, label, amount]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				await callbackAPI?.searchNodesWithLabel(term, fields, label, amount, done);
			};
		},

		getNode(done) {
			return async ([id]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}

				await callbackAPI?.getNode(id, done);
			};
		},

		getNodes(done) {
			return async ([projection, count]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				await callbackAPI?.getNodes(projection, count, done);
			};
		},

		getNodesWithLabel(done) {
			return async ([label, amount = 1000]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}

				await callbackAPI?.getNodesWithLabel(label, amount, done);
			};
		},

		getNodeLabels(done) {
			return async ([]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				await callbackAPI?.getNodeLabels(done);
			};
		},

		deleteNodes(done) {
			return async ([projection]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				await callbackAPI?.deleteNodes(projection, done);
			};
		},

		deleteNode(done) {
			return async ([id]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				await callbackAPI?.deleteNode(id, done);
			};
		},

		nodeCount(done) {
			return async ([projection]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				await callbackAPI?.nodeCount(projection, done);
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
				await callbackAPI?.deleteEdge(id, done);
			};
		},

		getEdge(done) {
			return async ([id]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				await callbackAPI?.getEdge(id, done);
			};
		},

		getEdgeBetween(done) {
			return async ([sourceId, targetId]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				await callbackAPI?.getEdgeBetween(sourceId, targetId, done);
			};
		},

		createEdge(done) {
			return async ([sourceId, targetId, data = null, id = null, labels = null]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				await callbackAPI?.createEdge(sourceId, targetId, data, id, labels, done);
			};
		},

		upsertEdge(done) {
			return async ([data = null, id = null, labels = null]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				await callbackAPI?.upsertEdge(data, id, labels, done);
			};
		},

		updateEdge(done) {
			return async ([data, id, labels]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
			await callbackAPI?.updateEdge(data, id, labels, done);
			};
		},

		getEdgeWithLabel(done) {
			return async ([sourceId, targetId, label]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				await callbackAPI?.getEdgeWithLabel(sourceId, targetId, label, done);
			};
		},

		getEdgeLabels(done) {
			return async ([]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				await callbackAPI?.getEdgeLabels(done);
			};
		},

		getEdgesWithLabel(done) {
			return async ([label, amount]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				await callbackAPI?.getEdgesWithLabel(label, amount, done);
			};
		},

		getEdges(done) {
			return async ([projection, amount]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				await callbackAPI?.getEdges(projection, amount, done);
			};
		},

		edgeCount(done) {
			return async ([projection]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				await callbackAPI?.edgeCount(projection, done);
			};
		},

		edgeExists(done) {
			return async ([id]) => {
				if (!isInitialized) {
					// 'neo4j' is the id of the adapter which should be used to pass options
					await setup(options[AdapterId]);
				}
				await callbackAPI?.edgeExists(id, done);
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
				await callbackAPI?.clear(done);
			};
		},

		/** @inheritdoc */
		inferSchemaGraph(done) {
			return async ([cached]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				await callbackAPI?.inferSchemaGraph(cached, done);
			};
		},

		getNeighborhood(done) {
			return async ([id, amount]) => {
				if (!isInitialized) {
					await setup(options[AdapterId]);
				}
				await callbackAPI?.getNeighborhood(id, amount, done);
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

				await callbackAPI?.pathQuery(path, amount, done);
			};
		},
		//endregion
	};


	async function setup(opt = {}) {
		if (isInitialized) {
			return;
		}
		let error: string | null = null;

		callbackAPI = new CallbackAPI(options[AdapterId]);
		if (callbackAPI && callbackAPI.driver) {
			const session = callbackAPI.getSession();
			try {
				const result = await session.executeWrite((tx) => tx.run("return 3.14"));
				const singleRecord = result.records[0];
				const pi = singleRecord.get(0);
				error = pi === 3.14 ? null : "Failed to connect to Neo4j.";
				await session.close();
				// make sure this hook is set up only once
				process.on("SIGTERM", () => {
					if (driver) {
						callbackAPI?.driver.close();
					}
				});
				isInitialized = true;
			} catch (e: any) {
				error = e.message;
			}
		}
		if (error) {
			throw new Error(error);
		}
	}

	process.nextTick(() => {
		done(null, api);
	});
}

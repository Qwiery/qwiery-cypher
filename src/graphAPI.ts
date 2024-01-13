import { CallbackAPI } from "~/callbackAPI";


/**
 * This is the client-side API with direct access from the browser to Neo4j.
 * The odd-looking twist from callbacks to promises is because the callback API is used by Qwiery DAL.
 */
export class GraphAPI {
	private options: any;
	private callbackAPI: CallbackAPI;

	constructor(options: any = {}) {
		this.options = options;
		this.callbackAPI = new CallbackAPI(options);

	}

	async close() {
		await this.callbackAPI.close();
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

	async createNode(data=null, id=null, labels=null): Promise<any> {
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

}


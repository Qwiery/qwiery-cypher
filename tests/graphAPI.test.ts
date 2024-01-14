import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GraphAPI } from "../src/graphAPI";
import { Utils } from "@orbifold/utils";

/**
 * Because the GraphAPI is a thin wrapper around the CallbackAPI, it doesn't make sense to test it separately.
 */

let api: GraphAPI;
describe("Graph API", () => {
	beforeAll(() => {
		api = new GraphAPI();
	});
	afterAll(() => {
		api.close();
	});
	it("should check nodes", async () => {
		const id = Utils.id();
		console.log(id);
		await api.createNode(id);
		expect(await api.nodeExists(id)).toBeTruthy();
	});
	it("should work with the readme example", async () => {
		const n = await api.createNode({ name: "John" });
		let john = await api.getNode(n.id);
		expect(john.name).toEqual("John");
		john = await api.getNode({ name: "John" });
		expect(john.name).toEqual("John");
	});
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GraphAPI } from "../src/graphAPI";
import { Utils } from "@orbifold/utils";

let api: GraphAPI;
describe("Graph API", () => {
	beforeAll(() => {
		api = new GraphAPI();
	});
	afterAll(() => {
		api.close();
	});
	it("should delete nodes", async () => {
		const id = Utils.id();
		console.log(id);
		await api.createNode(id);
		expect(await api.nodeExists(id)).toBeTruthy();
	});
});

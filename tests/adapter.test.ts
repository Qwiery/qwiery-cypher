import {describe, test, it, expect, vi, afterAll} from "vitest";
import {Qwiery} from "@orbifold/dal";
import {Cypher} from "../src/";
import {Utils} from "@orbifold/utils";
import _ from "lodash";
import path from "path";
import {pathQueryToCypher} from "../src/cypherAdapter";

const AdapterId = "cypher";

function createRandomLabel() {
    return `Label${Utils.randomId(5)}`;
}

describe("Adapter", function () {
    afterAll(() => {
    });

    it("should allow configuration", async () => {
        const f = vi.fn();
        const p = (Q) => {
            Q.adapter("A", (opt, done) => {
                f(opt);
            });
        };
        Qwiery.plugin(p);
        expect(_.keys(Qwiery.adapterDic)).toHaveLength(2);
        let q = new Qwiery();
        expect(f).not.toHaveBeenCalled();
        let options = {adapters: ["A"], A: {x: 3}};
        q = new Qwiery(options);
        // internally assigned if not given
        options.id = q.id;
        // an adapter init is called with all options, not just the ones for the specific adapter
        expect(f).toHaveBeenCalledWith(options);

        const filePath = path.join(__dirname, `${Utils.randomId()}.cypher`);

        // generic way to configure plugins
        Qwiery.plugin(Cypher);
        q = new Qwiery({
            adapters: [AdapterId],
        });

        await q.createNode("n1");
        expect(await q.nodeExists("n1")).toBeTruthy();
    });

    it("should get all node labels", async () => {
        Qwiery.plugin(Cypher);
        const q = new Qwiery({
            adapters: [AdapterId],
        });
        let labelsBefore = await q.getNodeLabels();
        const threeLabels = [createRandomLabel(), createRandomLabel(), createRandomLabel()];
        await q.createNode({id: Utils.randomId(), labels: [threeLabels[0], threeLabels[1]]});
        await q.createNode({id: Utils.randomId(), labels: [threeLabels[0], threeLabels[2]]});
        let labelsAfter = await q.getNodeLabels();
        expect(labelsAfter).toEqual(labelsBefore.concat(threeLabels));
    });

    it("should get all edge labels", async () => {
        Qwiery.plugin(Cypher);
        const q = new Qwiery({
            adapters: [AdapterId],
        });

        const a = await q.createNode({id: Utils.randomId()});
        const b = await q.createNode({id: Utils.randomId()});
        let labelsBefore = await q.getEdgeLabels();
        const twoLabels = [createRandomLabel(), createRandomLabel()];
        const e1 = await q.createEdge(a, b, null, Utils.randomId(), [twoLabels[0]]);
        const e2 = await q.createEdge(a, b, null, Utils.randomId(), [twoLabels[1]]);

        let labelsAfter = await q.getEdgeLabels();
        expect(labelsAfter).toEqual(labelsBefore.concat(twoLabels));
    });

    it("should set a default node label", async function () {
        Qwiery.plugin(Cypher);
        // uses default connection info to Neo4j
        const q = new Qwiery({
            adapters: [AdapterId],
        });
        let node = await q.createNode({name: "ump", u: 45, m: 7, p: -2});
        expect(await q.nodeExists(node.id)).toBeTruthy();
        node = await q.getNode(node.id);
        expect(node.name).toEqual("ump");
        // in a semantic spirit, the default label is a Thing
        expect(node.labels).toEqual(["Thing"]);
    });

    it("should throw if node id exists", async function () {
        Qwiery.plugin(Cypher);
        const q = new Qwiery({
            adapters: [AdapterId],
            cypher: {
                recreateTables: true,
            },
        });
        let a = await q.createNode(Utils.id());
        await expect(q.createNode(a.id)).rejects.toThrow(Error);
    });

    it("should throw if edge id exists", async function () {
        Qwiery.plugin(Cypher);
        const q = new Qwiery({
            adapters: [AdapterId],
            cypher: {
                recreateTables: true,
            },
        });
        let a = await q.createNode(Utils.id());
        let b = await q.createNode(Utils.id());
        const edgeId = Utils.id();
        await q.createEdge(a.id, b.id, null, edgeId);
        await expect(q.createEdge(a.id, b.id, null, edgeId)).rejects.toThrow(Error);
    });

    it("should crud edges", async function () {
        Qwiery.plugin(Cypher);
        const q = new Qwiery({
            adapters: [AdapterId],
        });
        let a = await q.createNode(Utils.id());
        let b = await q.createNode(Utils.id());
        const e1 = Utils.id();
        const e2 = Utils.id();
        await q.createEdge(a.id, b.id, null, e1);
        await q.createEdge({
            sourceId: a.id,
            targetId: b.id,
            id: e2,
            x: -4,
            y: 23,
        });
        let found = await q.getEdgeBetween(a.id, b.id);
        expect(found.id).toEqual(e1);
        expect(await q.edgeExists(e1)).toBeTruthy();
        expect(await q.edgeExists(e2)).toBeTruthy();
        let ed = await q.getEdge(e2);
        expect(ed.x).toEqual(-4);
        expect(ed.y).toEqual(23);

        await q.updateEdge({
            sourceId: a.id,
            targetId: b.id,
            id: e2,
            x: 4,
            y: 23,
        });
        ed = await q.getEdge(e2);
        expect(ed.x).toEqual(4);
        expect(ed.y).toEqual(23);

        await q.deleteEdge({id: e2});
        expect(await q.edgeExists(e2)).toBeFalsy();
        let e3 = Utils.id();
        const label = Utils.randomLetters(3);
        await q.createEdge({
            sourceId: a.id,
            targetId: b.id,
            labels: [label],
            id: e3,
        });
        let edl = await q.getEdgeWithLabel(a.id, b.id, label);
        expect(edl.id).toEqual(e3);
        expect(await q.getEdgesWithLabel(label)).toHaveLength(1);
    });

    it("should update a node", async function () {
        Qwiery.plugin(Cypher);
        const q = new Qwiery({
            adapters: [AdapterId],
        });
        let a = await q.createNode({
            name: "a",
            x: 9,
        });
        expect(await q.nodeExists(a.id)).toBeTruthy();
        await q.updateNode({
            id: a.id,
            name: "b",
        });
        const found = await q.getNode(a.id);
        expect(found.name).toEqual("b");
        expect(found.x).toBeUndefined();
    });

    it("should delete an edge", async function () {
        Qwiery.plugin(Cypher);
        const q = new Qwiery({
            adapters: [AdapterId],
        });
        let a = await q.createNode(Utils.id());
        let b = await q.createNode(Utils.id());
        const e1 = Utils.id();
        await q.createEdge(a.id, b.id, null, e1);
        expect(await q.edgeExists(e1)).toBeTruthy();

        await q.deleteEdge(e1);
        expect(await q.edgeExists(e1)).toBeFalsy();
    });

    it("should get nodes with a specific label", async function () {
        Qwiery.plugin(Cypher);
        const q = new Qwiery({
            adapters: [AdapterId],
        });
        const A = "A" + Utils.randomInteger(1, 100000);
        const B = "B" + Utils.randomInteger(1, 100000);
        const C = "C" + Utils.randomInteger(1, 100000);
        const a = await q.createNode({
            labels: [A, B],
            name: "a",
        });
        const b = await q.createNode({
            labels: [A, C],
            name: "b",
        });
        const as = await q.getNodesWithLabel(A);
        const bs = await q.getNodesWithLabel(B);
        const cs = await q.getNodesWithLabel(C);
        expect(as).toHaveLength(2);
        expect(bs).toHaveLength(1);
        expect(cs).toHaveLength(1);
    });

    it("should upsert elements", async function () {
        Qwiery.plugin(Cypher);
        const q = new Qwiery({
            adapters: [AdapterId],
        });
        let a = await q.createNode(Utils.id());
        let b = await q.createNode(Utils.id());
        const e1 = Utils.id();
        await q.upsertEdge({
            sourceId: a.id,
            targetId: b.id,
            id: e1,
        });
        expect(await q.edgeExists(e1)).toBeTruthy();

        await q.deleteEdge(e1);
        expect(await q.edgeExists(e1)).toBeFalsy();

        await q.upsertEdge({
            sourceId: a.id,
            targetId: b.id,
            id: e1,
            x: 55,
        });
        const e = await q.getEdge(e1);
        expect(e.x).toEqual(55);

        // upsert a
        await q.upsertNode({
            id: a.id,
            h: 0.9,
        });
        a = await q.getNode(a.id);
        expect(a.h).toEqual(0.9);

        await q.upsertNode({
            id: a.id,
            h: 0.9,
        });

        let r = await q.upsertNode({
            id: Utils.id(),
            s: "A",
        });
        r = await q.getNode(r.id);
        expect(r.s).toEqual("A");
        await q.deleteNode(r.id);
        expect(await q.nodeExists(r.id)).toBeFalsy();
    });

    it("should use Mongo projections", async function () {
        Qwiery.plugin(Cypher);
        const q = new Qwiery({
            adapters: [AdapterId],
        });
        const prefix = Utils.randomLetters(3);
        const a = await q.createNode({id: Utils.id(), x: 9, y: 45});

        let found = await q.getNode({x: 9});
        expect(found).not.toBeNull();
        expect(found.y).toEqual(45);

        found = await q.getNode({x: {$gt: 8}});
        expect(found).not.toBeNull();
        expect(found.y).toEqual(45);

        found = await q.getNode({$and: [{x: {$gt: 8}}, {x: {$lte: 9}}]});
        expect(found).not.toBeNull();
        expect(found.y).toEqual(45);

        await q.createNodes([{name: `${prefix}1`}, {name: `${prefix}2`}, {name: `${prefix}3`}, {name: `${prefix}4`}]);
        found = await q.getNodes({name: {$startsWith: prefix}});
        expect(found).toHaveLength(4);

        await q.createNodes([{name: `abc${prefix}efg`}]);
        found = await q.getNodes({name: {$contains: prefix}});
        expect(found.length).toBeGreaterThan(0);

        // ensure repeatable tests
        let d = {};
        d[prefix] = [4, 5, 6, 7, 88];
        let n = await q.createNode(d); //?
        let pred = {};
        pred[prefix] = {$size: 5};
        found = await q.getNodes(pred); //?
        expect(found).toHaveLength(1);
        expect(found[0].id).toEqual(n.id);
        pred = {};
        pred[prefix] = {$all: [88]};
        // found = await q.getNodes(pred);//?
        // expect(found[0].id).toEqual(n.id);
    });

    it("should count nodes", async function () {
        Qwiery.plugin(Cypher);
        const q = new Qwiery({
            adapters: [AdapterId],
        });
        const prefix = Utils.randomLetters(3);
        await q.createNodes(_.range(10).map((i) => ({name: `${prefix}${i}`})));
        let count = await q.nodeCount({name: {$startsWith: prefix}});
        expect(count).toEqual(10);
    });

    it("should count edges", async function () {
        Qwiery.plugin(Cypher);
        const q = new Qwiery({
            adapters: [AdapterId],
        });
        const prefix = Utils.randomLetters(3);
        let a = await q.createNode(Utils.id());
        let b = await q.createNode(Utils.id());
        let edges = _.range(10).map((i) => ({
            sourceId: a.id,
            targetId: b.id,
            name: `${prefix}${i}`,
            id: Utils.id(),
        }));
        for (const edge of edges) {
            await q.createEdge(edge);
        }
        let count = await q.edgeCount({name: {$startsWith: prefix}});
        expect(count).toEqual(10);
        let found = await q.getEdge({id: edges[0].id});
        expect(found.name).toEqual(`${prefix}0`);

        found = await q.getEdges({id: edges[0].id});
        expect(found).toHaveLength(1);
    });

    it("should delete nodes", async function () {
        Qwiery.plugin(Cypher);
        const q = new Qwiery({
            adapters: [AdapterId],
        });
        await q.deleteNodes({n: {$gt: 1}});

        let beforeCount = await q.nodeCount();
        await q.createNodes(_.range(100).map((i) => ({id: Utils.id() + i, n: i})));
        let afterCount = await q.nodeCount();
        expect(afterCount).toEqual(beforeCount + 100);

        let found = await q.getNodes({n: {$gt: 1}});
        expect(found).toHaveLength(98);
        await q.deleteNodes({n: {$gt: 1}});
        afterCount = await q.nodeCount();
        expect(afterCount).toEqual(beforeCount + 2);
    });

    it("should clear the graph", async function () {
        Qwiery.plugin(Cypher);
        const q = new Qwiery({
            adapters: [AdapterId],
        });
        await q.deleteNodes({n: {$gt: 1}});
        const prefix = Utils.id();
        await q.createNodes(_.range(100).map((i) => ({id: `${prefix}${i}`, n: i})));
        let nodeCount = await q.nodeCount({n: {$gt: 1}});
        expect(nodeCount).toEqual(98);
        const x = Utils.randomInteger(233, 1e12);
        await q.createEdge(`${prefix}0`, `${prefix}1`, {x});
        let edgeCount = await q.edgeCount({x: {$eq: x}});
        expect(edgeCount).toEqual(1);
        await q.clear();
        nodeCount = await q.nodeCount();
        expect(nodeCount).toEqual(0);
        edgeCount = await q.edgeCount();
        expect(edgeCount).toEqual(0);
    });

    it("should give you Cypher power", async function () {
        Qwiery.plugin(Cypher);
        const q = new Qwiery({
            adapters: [AdapterId],
            cypher: {
                recreateTables: true,
            },
        });
        let a = await q.createNode(Utils.id());
        let b = await q.createNode(Utils.id());
        const e1 = Utils.id();
        const e2 = Utils.id();
        await q.createEdge(a.id, b.id, null, e1);
        await q.createEdge({
            sourceId: a.id,
            targetId: b.id,
            id: e2,
            x: -4,
            y: 23,
        });
        let found = await q.getEdgeBetween(a.id, b.id);
        expect(found.id).toEqual(e1);
        expect(await q.edgeExists(e1)).toBeTruthy();
        expect(await q.edgeExists(e2)).toBeTruthy();
        let ed = await q.getEdge(e2);
        expect(ed.x).toEqual(-4);
        expect(ed.y).toEqual(23);

        await q.updateEdge({
            sourceId: a.id,
            targetId: b.id,
            id: e2,
            x: 4,
            y: 23,
        });
        ed = await q.getEdge(e2);
        expect(ed.x).toEqual(4);
        expect(ed.y).toEqual(23);

        await q.deleteEdge({id: e2});
        expect(await q.edgeExists(e2)).toBeFalsy();
        let e3 = Utils.id();
        const label = Utils.randomLetters(3);
        await q.createEdge({
            sourceId: a.id,
            targetId: b.id,
            labels: [label],
            id: e3,
        });
        let edl = await q.getEdgeWithLabel(a.id, b.id, label);
        expect(edl.id).toEqual(e3);
        expect(await q.getEdgesWithLabel(label)).toHaveLength(1);
    });

    it(
        "should infer the schema",
        async () => {
            Qwiery.plugin(Cypher);
            const q = new Qwiery({
                adapters: [AdapterId],
            });

            const nodeLabels = [`AA${Utils.randomId(5)}`, `BB${Utils.randomId(5)}`, `CC${Utils.randomId(5)}`];
            const edgeLabels = [`EE${Utils.randomId(5)}`, `EE${Utils.randomId(5)}`];

            // thing here is that the schema includes all the other nodes created with unit testing and it will, hence, always be more than we wish to check
            // so, we remove the schema elements which are not part of this test
            function reduceSchema(g) {
                const ns = g.nodes.slice(0);
                for (const n of ns) {
                    if (!_.includes(nodeLabels, n.name)) {
                        g.removeNode(n.id);
                    }
                }
                const es = g.edges.slice(0);
                for (const e of es) {
                    if (!_.includes(edgeLabels, e.name)) {
                        g.removeEdge(e.id);
                    }
                }
            }

            let a = await q.createNode({labels: [nodeLabels[0]]});
            let b = await q.createNode({labels: [nodeLabels[1]]});
            let c = await q.createNode({labels: [nodeLabels[1]]});
            let e1 = await q.createEdge(a, b, null, Utils.id(), [edgeLabels[0]]);

            let schema = await q.inferSchemaGraph();
            reduceSchema(schema);
            expect(schema.nodeCount).toEqual(2);
            expect(schema.edgeCount).toEqual(1);

            let e2 = await q.createEdge(a, b, null, Utils.id(), [edgeLabels[1]]);
            schema = await q.inferSchemaGraph();
            reduceSchema(schema);
            expect(schema.nodeCount).toEqual(2);
            expect(schema.edgeCount).toEqual(2);

            await q.updateNode({
                id: a.id,
                labels: [nodeLabels[0], nodeLabels[2]],
            });
            schema = await q.inferSchemaGraph();
            reduceSchema(schema);
            expect(schema.nodeCount).toEqual(3);
            expect(schema.edgeCount).toEqual(4);
        },
        {timeout: 30000},
    );

    it("should path-query", async () => {
        Qwiery.plugin(Cypher);
        const g = new Qwiery({
            adapters: [AdapterId],
        });
        const A = `A${Utils.randomId(5)}`;
        const B = `B${Utils.randomId(5)}`;
        const C = `C${Utils.randomId(5)}`;
        const nodeLabels = [A, B, C];

        const E1 = `E1${Utils.randomId(5)}`;
        const E2 = `E2${Utils.randomId(5)}`;
        const edgeLabels = [E1, E2];

        const star = "*";

        let a = await g.createNode({id: Utils.id(), labels: [A]});
        let b = await g.createNode({id: Utils.id(), labels: [B]});
        let c = await g.createNode({id: Utils.id(), labels: [C]});

        let e1 = await g.createEdge(a.id, b.id, null, Utils.id(), E1);
        let e2 = await g.createEdge(b.id, c.id, null, Utils.id(), E2);

        let found = await g.pathQuery([A, star, B]);
        expect(found.nodeCount).toEqual(2);
        expect(found.edgeCount).toEqual(1);
        expect(found.edges[0].labels).toEqual([E1]);

        found = await g.pathQuery([A, star, B, star, C]);
        // console.log(JSON.stringify(found.toJSON(), null, 2));
        expect(found.nodeCount).toEqual(3);
        expect(found.edgeCount).toEqual(2);
        expect(found.edges[0].labels).toEqual([E1]);
        expect(found.edges[1].labels).toEqual([E2]);

        // can specify both an edge and a node label
        await expect(g.pathQuery([""])).rejects.toThrow(Error);
        await expect(g.pathQuery([A, ""])).rejects.toThrow(Error);

        found = await g.pathQuery([C]);
        expect(found.nodeCount).toEqual(1);
        expect(found.edgeCount).toEqual(0);

        found = await g.pathQuery([star, E1, star]);
        expect(found.nodeCount).toEqual(2);
        expect(found.edgeCount).toEqual(1);

        found = await g.pathQuery([star, E1, star, E2, star]);
        expect(found.nodeCount).toEqual(3);
        expect(found.edgeCount).toEqual(2);
    }, 30000);

    it("should turn a path-query to Cypher", () => {
        const star = "*";

        let q = [star, "R", star];
        expect(pathQueryToCypher([])).toEqual(null);
        expect(() => pathQueryToCypher([" "])).toThrow(Error);
        expect(pathQueryToCypher(["A"], 4)).toEqual("Match (n:A) return n limit 4");
        expect(pathQueryToCypher(["A", star, "B"], 14)).toEqual("Match p=(:A)-->(:B) return p limit 14");
        expect(pathQueryToCypher(["A", star, "B", star, "C"], 23)).toEqual("Match p=(:A)-->(:B)-->(:C) return p limit 23");
        expect(pathQueryToCypher([star, "R", star, star, "D"], 23)).toEqual("Match p=()-[:R]->()-->(:D) return p limit 23");
    });

    it(
        "should get nodes and respect the amount",
        async () => {
            Qwiery.plugin(Cypher);
            const g = new Qwiery({
                adapters: [AdapterId],
            });
            const prefix = Utils.randomId(3);
            const beforeCount = await g.nodeCount();
            const N = Utils.randomInteger(10, 100);
            for (const i of _.range(N)) {
                await g.createNode(`${prefix}${i}`);
            }
            expect(await g.nodeCount()).toEqual(beforeCount + N);

            const count = Utils.randomInteger(3, 50);
            let ns = await g.getNodes({}, count);
            expect(ns.length).toEqual(count);
        },
        {timeout: 30000},
    );

    it(
        "should search for nodes",
        async () => {
            Qwiery.plugin(Cypher);
            const g = new Qwiery({
                adapters: [AdapterId],
            });
            const prefix = Utils.randomId(7);
            const cLabel = `C${Utils.randomId(5)}`;
            for (let i = 0; i < 300; i++) {
                await g.createNode({
                    id: `A${prefix}${i}`,
                    labels: ["A"],
                    name: "A " + i,
                });
            }
            for (let i = 0; i < 150; i++) {
                await g.createNode({
                    id: `B${prefix}${i}`,
                    labels: ["B"],
                    name: "B " + i,
                });
            }
            const c1 = await g.createNode({
                id: `C1${prefix}`,
                labels: [cLabel],
                name: "a",
            });
            const c2 = await g.createNode({
                id: `C2${prefix}`,
                labels: [cLabel],
                name: "b",
            });
            let found = await g.searchNodes("A");
            // default amount is 100
            expect(found).toHaveLength(100);

            found = await g.searchNodes(cLabel.slice(0, 3), ["labels"]);
            expect(found).toHaveLength(2);

            found = await g.searchNodesWithLabel("b", ["name"], cLabel);
            expect(found).toHaveLength(1);
            expect(found[0].id).toEqual(c2.id);
        },
        {timeout: 30000},
    );

    it(
        "should get the neighborhood graph",
        async () => {
            Qwiery.plugin(Cypher);
            const g = new Qwiery({
                adapters: [AdapterId],
            });
            const prefix = Utils.randomId(4);
            const root = await g.createNode(`${prefix}Root`);
            for (let i = 0; i < 30; i++) {
                const n = await g.createNode({
                    id: `${prefix}${i}`,
                    labels: ["A"],
                    name: "A " + i,
                });
                await g.createEdge(root.id, n.id);
            }
            const ng = await g.getNeighborhood(root.id, 1000);
            expect(ng.nodeCount).toEqual(31);
            expect(ng.edgeCount).toEqual(30);
        },
        {timeout: 60000},
    );

    it("should get node label properties", async () => {
        Qwiery.plugin(Cypher);
        const g = new Qwiery({
            adapters: [AdapterId],
        });
        const labels = ["LAB" + Utils.randomId(5)];
        await g.createNode({
            labels,
            x: 2,
        });
        await g.createNode({
            labels,
            y: 2,
        });
        await g.createNode({
            labels,
            y: 2,
            z: 5,
        });
        let found = await g.getNodeLabelProperties(labels[0]);
        found.sort();

        // the id is always added even if not given
        expect(found).toEqual(["id", "x", "y", "z"]);
    });
});

# Cypher Adapter

This package wraps the essential CRUD (create,read, update, delete) operations for a Cypher backend. 
It is also a plugin for the [Qwiery](https://qwiery.com) data access layer. 

If you need to create a proof of concept (browser app) with a graph sitting in Neo4j, this is the package to use. It doesn;t depend on a particular UI framework and is straightforward to use.

If you use Qwiery, this adapter can be plugged in and replaces the default (lightweight) JSON implementation. 

## In a browser app

Whether you use React, Angular, Vue or any other framework, you can use this adapter to connect to a Neo4j backend.



```bash
npm install neo4j-driver
npm install @orbifold/cypher
```

```js
import {GraphAPI} from "@orbifold/cypher";

const n = await api.createNode({ name: "John" });
let john = await api.getNode(n.id);
expect(john.name).toEqual("John");
john = await api.getNode({ name: "John" });
expect(john.name).toEqual("John");
```

The following defaults are used to connect:
```js
const ConnectionDefaults = {
	protocol: "bolt",
	host: "localhost",
	port: 7687,
	user: "neo4j",
	password: "123456789",
	defaultNodeLabel: "Thing",
	defaultEdgeLabel: "RelatedTo",
	database: "neo4j"
};
```
you can simply pass the options in the constructor:
```js
const api = new GraphAPI({
    password: "my-pass"
});
```

Some remarks with respect to the API:

- all methods return a promise
- most methods are polymorphic, meaning that you can pass various types of arguments. For example, in the `getNode` example above you can pass a node id or a Mongo-like projection. 
- Neo4j does not allow multiple types/labels but the API does. The adapter will simply take the first given. The reason it's an array is because other Qwiery adapters do support multiple relationship labels (e.g. the [Qwiery SQL adapter](https://github.com/Qwiery/qwiery-sql).
- some methods allow to pass separately the id, labels and data. At the same time, you can pass it as an object:
```js
// with an object
const n = await api.createNode({ name: "John", id:"j", labels:["Person"] });
// with separate arguments
const m = await api.createNode({ name: "John" },"j",["Person"]);
```
If you pass conflicting information, the parameters will have priority. For example, this will result in a node with id "a" and label "Person":

```js
const m = await api.createNode({ name: "John", id:"b", labels:["P"] },"a",["Person"]);
```

## As a Qwiery plugin

This adapter implements all the Qwiery graph API methods. So, you only need to plug it in and your app will work with a Neo4j backend.

```bash
npm install neo4j-driver
npm install @orbifold/cypher
```

```js
import {Qwiery} from "@orbifold/dal";
import {Cypher} from "@orbifold/cypher";
// add the plugin to Qwiery
Qwiery.plugin(Cypher);
const q = new Qwiery({
    // define which adapter to use (this replaces the default JSON adapter)
    adapters: ["cypher"],
    // optional: replace the defaults to connect
    cypher: {
        // the URL of the Cypher backend
        url: "bolt://localhost:7474",
        // the username
        username: "neo4j",
        // the password
        password: "neo4j"
    }
});

```

## Building

This package is written in TypeScript and uses Vite with Vitest for testing. Vite makes it easy to build and configure the package:
```bash
npm run build
```
The adapter has an ES module and a CommonJS version. The ES module for the browser is defined in the `graphAPI.ts` file. The Qwiery adapter sits in the `cypherAdapter.ts` file. Both rewire methods to the `callbackAPI.ts` file which contains the actual implementation.

The Qwiery adapter can't be used in the browser because it depends on some NodeJs mechanics. The whole Qwiery data access layer is, in fact, only meaningful as a backend module.

To test the code use
```bash
npm run test
```
Note that the Qwiery adapter necessarily depends on the DAL but if you are only interested in the browser API you can simply ignore the Qwiery mechanics. In fact, if you fork this project you can simply delete this portion without harming the client package.

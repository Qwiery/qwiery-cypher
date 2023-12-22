# Qwiery Cypher Adapter

This Qwiery adapter allows to use a Cypher backend. It replaces the default JSON adapter and transparently uses the same Qwiery API.



```bash
npm install neo4j-driver
npm install @orbifold/cypher
```

```js
import {Qwiery} from "@orbifold/dal";
import {Cypher} from "@orbifold/qwiery-cypher";
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

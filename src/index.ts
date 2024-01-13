import {CypherAdapter} from "./cypherAdapter";

export const Cypher =  (Q:any) => {
	Q.adapter("cypher", CypherAdapter);
};

export {pathQueryToCypher} from "./callbackAPI";
export {CypherAdapter}

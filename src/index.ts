import { CypherAdapter } from "./cypherAdapter";
import { GraphAPI } from "./graphAPI";

export const Cypher = (Q: any) => {
	Q.adapter("cypher", CypherAdapter);
};

export { pathQueryToCypher } from "./callbackAPI";
export { CypherAdapter };
export { GraphAPI };

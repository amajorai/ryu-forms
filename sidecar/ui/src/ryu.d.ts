import type {
	FormsAdminRequestBody,
	FormsAdminResponse,
} from "../../src/contracts.ts";

declare global {
	interface Window {
		ryu?: {
			app?: {
				request(input: {
					body?: FormsAdminRequestBody;
					method?: "GET" | "POST" | "PUT" | "DELETE";
					path: string;
				}): Promise<FormsAdminResponse>;
			};
			node?: {
				shareOrigins(): Promise<
					{
						origin: string;
						reachable: true;
						source: "active" | "lan" | "mesh";
					}[]
				>;
			};
		};
	}
}

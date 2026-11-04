import { formsAdminResponseSchema } from "../../src/contracts.ts";

declare global {
	interface Window {
		__formsFixtureSchemas?: { response: typeof formsAdminResponseSchema.parse };
	}
}
window.__formsFixtureSchemas = {
	response(value) {
		return formsAdminResponseSchema.parse(value);
	},
};

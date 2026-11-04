import { join } from "node:path";
import {
	resolvePluginDataDir,
	resolveSidecarPort,
	resolveSidecarToken,
} from "@ryu/sidecar-runtime";
import { capturePluginKeys } from "@ryu/sidecar-runtime/seal";
import { createFormsServer } from "./server.ts";
import { FormsStore } from "./store.ts";

// Capture (and remove from the environment) the content key before anything
// else runs, so no later child or log can see it.
const keys = capturePluginKeys("@ryu/forms", Bun.env);
const token = resolveSidecarToken(Bun.env);
if (!token) {
	throw new Error("Forms requires its Core-minted extension token");
}
const dataDirectory = resolvePluginDataDir(Bun.env, "@ryu/forms");
const store = new FormsStore(join(dataDirectory, "forms.sqlite"), { keys });
const server = createFormsServer({
	store,
	token,
	port: resolveSidecarPort(Bun.env, "RYU_FORMS_PORT", 8023),
});
console.info(`[ryu-forms] service listening on ${server.port}`);

function stop(): void {
	server.stop();
	store.close();
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

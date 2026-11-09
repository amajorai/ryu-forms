import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: here,
	base: "./",
	plugins: [react(), viteSingleFile()],
	build: {
		outDir: "../bundle",
		emptyOutDir: true,
		target: "esnext",
		cssCodeSplit: false,
		assetsInlineLimit: Number.POSITIVE_INFINITY,
		modulePreload: { polyfill: false },
		rollupOptions: {
			input: { forms: resolve(here, "index.html") },
			output: { inlineDynamicImports: true },
		},
	},
	server: {
		host: "127.0.0.1",
		port: 8421,
		strictPort: true,
		proxy: {
			"/api/forms": { target: "http://127.0.0.1:8422" },
			"/forms": {
				target: "http://127.0.0.1:8422",
				rewrite: (path) => path.replace(/^\/forms/, "/api/forms"),
			},
		},
	},
});

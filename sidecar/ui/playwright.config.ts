import { defineConfig } from "@playwright/test";

const isolatedDataDir =
	process.env.RYU_FORMS_TEST_DATA_DIR ?? "/tmp/ryu-forms-e2e";
process.env.RYU_DIR = isolatedDataDir;
process.env.RYU_FORMS_TEST_DATA_DIR = isolatedDataDir;

export default defineConfig({
	testDir: "./e2e",
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 15_000 },
	use: {
		headless: true,
		viewport: { width: 1440, height: 960 },
	},
	reporter: "list",
	outputDir: "/tmp/ryu-forms-playwright-results",
	webServer: [
		{
			command: `RYU_PROFILE=dev RYU_KEYCHAIN=off RYU_DIR=${isolatedDataDir} RYU_EXT_TOKEN=forms-e2e-token RYU_FORMS_PORT=8422 bun run ../src/index.ts`,
			url: "http://127.0.0.1:8422/health",
			reuseExistingServer: false,
			timeout: 30_000,
		},
		{
			command: "bunx vite --config vite.config.ts",
			url: "http://127.0.0.1:8421/",
			reuseExistingServer: false,
			timeout: 30_000,
		},
	],
});

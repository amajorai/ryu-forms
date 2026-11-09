import { afterEach, expect, test } from "bun:test";
import { createRequire } from "node:module";

// happy-dom is declared by @ryu/ui, which this package already depends on.
const requireFromUi = createRequire(
	new URL("../node_modules/@ryu/ui/package.json", import.meta.url)
);
const { GlobalRegistrator } = await import(
	requireFromUi.resolve("@happy-dom/global-registrator")
);
if (!GlobalRegistrator.isRegistered) {
	GlobalRegistrator.register();
}
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { I18nProvider } = await import("@ryu/i18n/react");
const { registerLiteralCatalogLoader } = await import("@ryu/i18n/core");
const { FormsApp } = await import("./App.tsx");

const JAPANESE: Record<string, string> = {
	"Forms could not connect": "フォームに接続できませんでした",
	"The Forms service is unavailable. Retry when the Ryu node is ready.":
		"フォームサービスを利用できません。Ryu ノードの準備ができたら再試行してください。",
	Retry: "再試行",
};

afterEach(() => {
	registerLiteralCatalogLoader(null);
	document.body.innerHTML = "";
});

async function renderFormsApp(locale: string): Promise<string> {
	const mount = document.createElement("div");
	document.body.append(mount);
	const root = createRoot(mount);
	await act(async () => {
		root.render(
			<I18nProvider
				autoLocalizeDom={false}
				initialLocale={locale}
				initialPackId={null}
			>
				<FormsApp />
			</I18nProvider>
		);
	});
	// The list request fails outside Ryu; let it settle into the empty state.
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	const text = mount.textContent ?? "";
	await act(async () => {
		root.unmount();
	});
	return text;
}

test("renders the unavailable state as whole translated sentences", async () => {
	registerLiteralCatalogLoader(() => JAPANESE);
	const text = await renderFormsApp("ja");
	expect(text).toContain("フォームに接続できませんでした");
	expect(text).toContain(
		"フォームサービスを利用できません。Ryu ノードの準備ができたら再試行してください。"
	);
	expect(text).not.toContain("Forms could not connect");
});

test("keeps the English source copy without a catalog entry", async () => {
	registerLiteralCatalogLoader(() => ({}));
	const text = await renderFormsApp("ja");
	expect(text).toContain("Forms could not connect");
});

const bundlePath = new URL("../bundle/index.html", import.meta.url);
const html = await Bun.file(bundlePath).text();
const normalized = html.replace(/[ \t]+$/gm, "");

if (normalized !== html) {
	await Bun.write(bundlePath, normalized);
}

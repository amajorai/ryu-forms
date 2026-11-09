import { expect, test } from "bun:test";
import { z } from "zod";

const manifest = await Bun.file(
	new URL("../../manifest.json", import.meta.url)
).json();

test("Forms manifest routes management through permissions and only publicizes responses", () => {
	expect(manifest.id).toBe("@ryu/forms");
	expect(manifest.sidecars).toHaveLength(1);
	expect(manifest.sidecars[0].http.public_mount).toBe("/forms");
	const routes = z
		.array(
			z.object({
				auth: z.string().optional(),
				method: z.string(),
				path: z.string(),
				permission: z.string().optional(),
			})
		)
		.parse(manifest.sidecars[0].http.routes);
	const publicRoutes = routes.filter((route) => route.auth === "public");
	expect(publicRoutes).toEqual([
		{ path: "/:slug", method: "GET", auth: "public" },
		{ path: "/:slug/submissions", method: "POST", auth: "public" },
	]);
	expect(
		routes
			.filter((route) => route.path.startsWith("/admin/"))
			.every((route) => route.permission)
	).toBe(true);
	expect(manifest.permission_grants).toEqual(["app:http", "crypto:seal"]);
});

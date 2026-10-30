import { describe, expect, it } from "bun:test";
import { createFormsHandler } from "./server.ts";
import { FormsStore } from "./store.ts";

const TOKEN = "forms-test-token";
const API_ORIGIN = "http://forms.test";

function start() {
	const store = new FormsStore(":memory:");
	return { handler: createFormsHandler({ store, token: TOKEN }), store };
}

function request(path: string, init: RequestInit = {}): Request {
	return new Request(new URL(path, API_ORIGIN), init);
}

describe("Forms HTTP service", () => {
	it("protects management routes while serving published forms publicly", async () => {
		const { handler, store } = start();
		try {
			const denied = await handler(request("/api/forms/status"));
			expect(denied.status).toBe(401);
			const created = await handler(
				request("/api/forms/admin/forms", {
					method: "POST",
					headers: {
						authorization: `Bearer ${TOKEN}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						title: "Feedback",
						slug: "feedback-form",
						template: "feedback",
					}),
				})
			);
			expect(created.status).toBe(201);
			const form = await created.json();
			const published = await handler(
				request(`/api/forms/admin/forms/${form.id}/publish`, {
					method: "POST",
					headers: { authorization: `Bearer ${TOKEN}` },
				})
			);
			expect(published.status).toBe(200);
			const respondentPage = await handler(request(`/api/forms/${form.slug}`));
			expect(respondentPage.status).toBe(200);
			expect(respondentPage.headers.get("content-security-policy")).toContain(
				"frame-ancestors 'none'"
			);
			const respondentHtml = await respondentPage.text();
			expect(respondentHtml).toContain("Feedback");
			expect(respondentHtml).toContain('data-ryu-powered-by="forms"');

			process.env.RYU_BRANDING_REMOVABLE = "1";
			const unbranded = await handler(request(`/api/forms/${form.slug}`));
			expect(await unbranded.text()).not.toContain("data-ryu-powered-by");
		} finally {
			delete process.env.RYU_BRANDING_REMOVABLE;
			store.close();
		}
	});

	it("renders author content as text and stores a public answer once", async () => {
		const { handler, store } = start();
		try {
			const created = await handler(
				request("/api/forms/admin/forms", {
					method: "POST",
					headers: {
						authorization: `Bearer ${TOKEN}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						title: "<svg onload=alert(1)>",
						slug: "safe-feedback",
						template: "feedback",
					}),
				})
			);
			const form = await created.json();
			await handler(
				request(`/api/forms/admin/forms/${form.id}/publish`, {
					method: "POST",
					headers: { authorization: `Bearer ${TOKEN}` },
				})
			);
			const page = await handler(request(`/api/forms/${form.slug}`));
			const html = await page.text();
			expect(html).not.toContain("<svg onload");
			expect(html).toContain("\\u003csvg");
			const answers = {
				[form.fields[0].id]: "An idea",
				[form.fields[1].id]: "A better form flow.",
			};
			const payload = { submissionId: "public-submit-0001", answers };
			for (let attempt = 0; attempt < 2; attempt += 1) {
				const response = await handler(
					request(`/api/forms/${form.slug}/submissions`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(payload),
					})
				);
				expect(response.status).toBe(201);
			}
			const list = await handler(
				request(`/api/forms/admin/forms/${form.id}/responses`, {
					headers: { authorization: `Bearer ${TOKEN}` },
				})
			);
			expect((await list.json()).items).toHaveLength(1);
		} finally {
			store.close();
		}
	});

	it("keeps form links clear of the management routes", async () => {
		const { handler, store } = start();
		const createForm = (slug: string) =>
			handler(
				request("/api/forms/admin/forms", {
					method: "POST",
					headers: {
						authorization: `Bearer ${TOKEN}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({ title: "Intake", slug, template: "contact" }),
				})
			);
		try {
			for (const reserved of ["status", "admin", "STATUS"]) {
				const rejected = await createForm(reserved);
				expect(rejected.status).toBe(400);
				expect((await rejected.json()).error.message).toContain("reserved");
			}

			const created = await createForm("admin-feedback");
			expect(created.status).toBe(201);
			const form = await created.json();
			await handler(
				request(`/api/forms/admin/forms/${form.id}/publish`, {
					method: "POST",
					headers: { authorization: `Bearer ${TOKEN}` },
				})
			);
			const respondentPage = await handler(
				request("/api/forms/admin-feedback")
			);
			expect(respondentPage.status).toBe(200);
			expect(await respondentPage.text()).toContain("Intake");

			const adminRoot = await handler(request("/api/forms/admin"));
			expect(adminRoot.status).toBe(401);
		} finally {
			store.close();
		}
	});
});

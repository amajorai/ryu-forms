import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { z } from "zod";
import {
	type createFormSchema,
	type FormsAdminRequestBody,
	formDocumentSchema,
	formSubmissionPageSchema,
	type publicSubmissionSchema,
} from "./contracts.ts";
import { createFormsServer } from "./server.ts";
import { FormsStore } from "./store.ts";

const token = "forms-local-runtime-test";

test("HTTP authorization, conflict recovery and submission retries survive a SQLite restart", async () => {
	const directory = mkdtempSync(join(tmpdir(), "ryu-forms-http-"));
	const path = join(directory, "forms.sqlite");
	let store = new FormsStore(path);
	let server = createFormsServer({ store, token });
	const request = (
		route: string,
		method = "GET",
		body?: FormsAdminRequestBody | z.input<typeof publicSubmissionSchema>,
		approved = true
	) => {
		const headers: Record<string, string> = {};
		if (approved) {
			headers.authorization = `Bearer ${token}`;
		}
		const init: RequestInit = { method, headers };
		if (body !== undefined) {
			headers["content-type"] = "application/json";
			init.body = JSON.stringify(body);
		}
		return fetch(new URL(route, server.url), init);
	};
	try {
		const input: z.input<typeof createFormSchema> = {
			title: "Local feedback",
			slug: "runtime-feedback",
			template: "feedback",
		};
		const denied = await request(
			"/api/forms/admin/forms",
			"POST",
			input,
			false
		);
		expect(denied.status).toBe(401);
		expect((await denied.json()).error.code).toBe("unauthorized");
		const created = await request("/api/forms/admin/forms", "POST", input);
		expect(created.status).toBe(201);
		const form = formDocumentSchema.parse(await created.json());
		const route = `/api/forms/admin/forms/${form.id}`;
		expect(
			(await request(`/api/forms/${form.slug}`, "GET", undefined, false)).status
		).toBe(404);
		const duplicate = await request("/api/forms/admin/forms", "POST", input);
		expect(duplicate.status).toBe(409);
		expect((await duplicate.json()).error.code).toBe("conflict");
		const update = {
			title: "Saved feedback",
			description: "Local runtime roundtrip",
			fields: form.fields,
			submitButtonText: form.submitButtonText,
			confirmationTitle: form.confirmationTitle,
			confirmationBody: form.confirmationBody,
			expectedRevision: form.revision,
		};
		expect((await request(route, "PUT", update)).status).toBe(200);
		const stale = await request(route, "PUT", {
			...update,
			title: "Stale content",
		});
		expect(stale.status).toBe(409);
		expect((await stale.json()).error.code).toBe("conflict");
		const readback = formDocumentSchema.parse(
			await (await request(route)).json()
		);
		expect(readback.title).toBe("Saved feedback");
		expect(readback.revision).toBe(1);
		expect(
			(
				await request(route, "PUT", {
					...update,
					expectedRevision: readback.revision,
				})
			).status
		).toBe(200);
		expect((await request(`${route}/publish`, "POST")).status).toBe(200);
		const page = await request(
			`/api/forms/${form.slug}`,
			"GET",
			undefined,
			false
		);
		expect(page.status).toBe(200);
		expect(page.headers.get("content-security-policy")).toContain(
			"frame-ancestors 'none'"
		);
		expect(await page.text()).toContain("Saved feedback");
		const [firstField, secondField] = form.fields;
		if (!(firstField && secondField)) {
			throw new Error("Feedback fixture requires two questions");
		}
		const answers = {
			[firstField.id]: "An idea",
			[secondField.id]: "Persist this response",
		};
		const submissionRoute = `/api/forms/${form.slug}/submissions`;
		const invalid = await request(
			submissionRoute,
			"POST",
			{ submissionId: "runtime-invalid", answers: {} },
			false
		);
		expect(invalid.status).toBe(400);
		const invalidBody = await invalid.json();
		expect(invalidBody.error.code).toBe("operation_failed");
		expect(invalidBody.error.message).toContain("to continue");
		const first = await request(
			submissionRoute,
			"POST",
			{ submissionId: "runtime-retry-0001", answers },
			false
		);
		expect(first.status).toBe(201);
		expect(await first.json()).toEqual({ accepted: true, duplicate: false });
		expect(statSync(path).mode & 0o777).toBe(0o600);
		await server.stop(true);
		store.close();
		store = new FormsStore(path);
		server = createFormsServer({ store, token });
		const retry = await request(
			submissionRoute,
			"POST",
			{ submissionId: "runtime-retry-0001", answers },
			false
		);
		expect(retry.status).toBe(201);
		expect(await retry.json()).toEqual({ accepted: true, duplicate: true });
		expect(
			(await request(`${route}/responses`, "GET", undefined, false)).status
		).toBe(401);
		const responses = formSubmissionPageSchema.parse(
			await (await request(`${route}/responses`)).json()
		);
		expect(responses.items).toHaveLength(1);
		expect(responses.items[0]?.answers).toEqual(answers);
		expect(responses.nextCursor).toBeNull();
		const cursor = await request(`${route}/responses?cursor=broken`);
		expect(cursor.status).toBe(400);
		expect((await cursor.json()).error.code).toBe("invalid_cursor");
		expect((await request(`${route}/unpublish`, "POST")).status).toBe(200);
		expect(
			(
				await request(
					submissionRoute,
					"POST",
					{ submissionId: "runtime-retry-0002", answers },
					false
				)
			).status
		).toBe(404);
		expect((await request(route, "DELETE")).status).toBe(200);
		expect((await request(route)).status).toBe(404);
		expect(store.exportResponses.bind(store, form.id)).toThrow(
			"Form not found"
		);
	} finally {
		await server.stop(true);
		store.close();
		rmSync(directory, { recursive: true, force: true });
	}
});

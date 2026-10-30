import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formStoredCountSchema } from "./contracts.ts";
import { FormsError, FormsStore } from "./store.ts";

describe("FormsStore", () => {
	it("uses revisions when saving a form", () => {
		const store = new FormsStore(":memory:");
		try {
			const form = store.create({
				title: "Contact",
				slug: "contact-form",
				template: "contact",
			});
			const saved = store.update(form.id, {
				title: "Contact us",
				description: "Send a note to our team.",
				fields: form.fields,
				submitButtonText: "Send",
				confirmationTitle: form.confirmationTitle,
				confirmationBody: form.confirmationBody,
				expectedRevision: form.revision,
			});
			expect(saved.revision).toBe(1);
			expect(() =>
				store.update(form.id, {
					title: "Stale write",
					description: "",
					fields: form.fields,
					submitButtonText: "Submit",
					confirmationTitle: "Thanks",
					confirmationBody: "",
					expectedRevision: form.revision,
				})
			).toThrow("form changed");
		} finally {
			store.close();
		}
	});

	it("publishes contact forms and deduplicates retried submissions", () => {
		const store = new FormsStore(":memory:");
		try {
			const draft = store.create({
				title: "Contact",
				slug: "contact-form",
				template: "contact",
			});
			expect(() => store.setPublished(draft.id, true)).not.toThrow();
			const form = store.get(draft.id);
			const answers = Object.fromEntries([
				[form.fields[0]?.id ?? "", "Sam"],
				[form.fields[1]?.id ?? "", "sam@example.com"],
				[form.fields[2]?.id ?? "", "I need help."],
			]);
			const first = store.addSubmission(form.slug, {
				submissionId: "request-0001",
				answers,
			});
			const retry = store.addSubmission(form.slug, {
				submissionId: "request-0001",
				answers,
			});
			expect(first.duplicate).toBe(false);
			expect(retry.duplicate).toBe(true);
			expect(store.list()[0]?.responseCount).toBe(1);
		} finally {
			store.close();
		}
	});

	it("keeps drafts private and enforces the per-form response limit", () => {
		const store = new FormsStore(":memory:");
		try {
			const draft = store.create({
				title: "Feedback",
				slug: "feedback-form",
				template: "feedback",
			});
			expect(() =>
				store.addSubmission(draft.slug, {
					submissionId: "request-0001",
					answers: {},
				})
			).toThrow(FormsError);
			const form = store.setPublished(draft.id, true);
			const firstField = form.fields[0];
			const answers = { [firstField?.id ?? ""]: "An idea" };
			for (let index = 0; index < 30; index += 1) {
				store.addSubmission(
					form.slug,
					{
						submissionId: `request-${String(index).padStart(4, "0")}`,
						answers: {
							...answers,
							[form.fields[1]?.id ?? ""]: "Add a helpful feature.",
						},
					},
					new Date("2026-09-25T00:00:00.000Z")
				);
			}
			expect(() =>
				store.addSubmission(
					form.slug,
					{
						submissionId: "request-limit",
						answers: { ...answers, [form.fields[1]?.id ?? ""]: "One more" },
					},
					new Date("2026-09-25T00:00:00.000Z")
				)
			).toThrow("Too many responses");
		} finally {
			store.close();
		}
	});

	it("persists responses across a restart and deletes their form data", () => {
		const directory = mkdtempSync(join(tmpdir(), "ryu-forms-store-"));
		const path = join(directory, "forms.sqlite");
		const first = new FormsStore(path);
		try {
			const draft = first.create({
				title: "Contact",
				slug: "contact-form",
				template: "contact",
			});
			const form = first.setPublished(draft.id, true);
			first.addSubmission(form.slug, {
				submissionId: "request-0001",
				answers: {
					[form.fields[0]?.id ?? ""]: "Sam",
					[form.fields[1]?.id ?? ""]: "sam@example.com",
					[form.fields[2]?.id ?? ""]: "Please call me.",
				},
			});
			expect(statSync(path).mode & 0o777).toBe(0o600);
		} finally {
			first.close();
		}
		const reopened = new FormsStore(path);
		try {
			const form = reopened.getBySlug("contact-form");
			expect(form?.published).toBe(true);
			expect(reopened.list()[0]?.responseCount).toBe(1);
			if (!form) {
				throw new Error("Persisted form was not found");
			}
			reopened.delete(form.id);
			expect(reopened.list()).toHaveLength(0);
			expect(
				formStoredCountSchema.parse(
					reopened.db.query("SELECT COUNT(*) AS count FROM submissions").get()
				).count
			).toBe(0);
		} finally {
			reopened.close();
			rmSync(directory, { recursive: true, force: true });
		}
	});
});

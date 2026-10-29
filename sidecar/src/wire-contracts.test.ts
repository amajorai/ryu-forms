import { expect, test } from "bun:test";
import {
	formAnswersSchema,
	formDocumentSchema,
	formExportResponseSchema,
	formStoredCountSchema,
	formSubmissionPageSchema,
} from "./contracts.ts";
import { FormsStore } from "./store.ts";

test("complete form response contracts retain native metadata and nested references", () => {
	const store = new FormsStore(":memory:");
	try {
		const form = store.create({
			title: "Contact",
			slug: "contract-contact",
			template: "contact",
		});
		const native = { ...form, nativeMetadata: { revisionOwner: "sidecar" } };
		expect(Object.is(formDocumentSchema.parse(native), native)).toBe(true);
		expect(
			Object.is(formDocumentSchema.parse(native).fields, native.fields)
		).toBe(true);
		expect(
			formDocumentSchema.safeParse({ ...form, publishedAt: 7 }).success
		).toBe(false);
		expect(
			formDocumentSchema.safeParse({
				...form,
				fields: [{ ...form.fields[0], required: 7 }],
			}).success
		).toBe(false);
		const exportReply = {
			form: { fields: form.fields, title: form.title },
			responses: [],
		};
		const exported = formExportResponseSchema.parse(exportReply);
		expect(Object.is(exported, exportReply)).toBe(true);
		expect(Object.is(exported.form.fields, form.fields)).toBe(true);
		expect(exported.form.title).toBe("Contact");
		expect(exported.form.fields).toEqual(form.fields);
	} finally {
		store.close();
	}
});

test("submission response owners retain own prototype-named answers and native cursor null", () => {
	const answers = JSON.parse('{"name":"Guest","__proto__":["Option A"]}');
	const parsed = formAnswersSchema.parse(answers);
	expect(Object.is(parsed, answers)).toBe(true);
	expect(Object.getOwnPropertyDescriptor(parsed, "__proto__")?.value).toEqual([
		"Option A",
	]);
	const page = {
		items: [{ id: "response-1", submittedAt: "today", answers }],
		nextCursor: null,
	};
	expect(Object.is(formSubmissionPageSchema.parse(page), page)).toBe(true);
	expect(
		formAnswersSchema.safeParse(JSON.parse('{"__proto__":7}')).success
	).toBe(false);
	expect(formStoredCountSchema.safeParse({ count: "1" }).success).toBe(false);
});

test("persisted documents validate full native fields without trimming historical display text", () => {
	const store = new FormsStore(":memory:");
	try {
		const form = store.create({
			title: "Historical",
			slug: "historical-contact",
			template: "contact",
		});
		const historical = {
			...form,
			title: "  Historical  ",
			fields: form.fields.map((field) => ({
				...field,
				title: ` ${field.title} `,
			})),
		};
		store.db
			.query("UPDATE forms SET document=? WHERE id=?")
			.run(JSON.stringify(historical), form.id);
		expect(store.get(form.id)).toEqual(historical);
		expect(store.list()[0]?.title).toBe("  Historical  ");
	} finally {
		store.close();
	}
});

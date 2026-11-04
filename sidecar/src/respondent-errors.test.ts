import { describe, expect, it } from "bun:test";
import type { FormDocument } from "./contracts.ts";
import { renderRespondentPage } from "./respondent.ts";
import { respondentErrorCopy } from "./respondent-errors.ts";
import {
	type RespondentLocale,
	respondentLocale,
} from "./respondent-locale.ts";
import { createFormsHandler } from "./server.ts";
import { FormsStore } from "./store.ts";

const marked: RespondentLocale = {
	dir: "ltr",
	locale: "xx",
	tl: (source) => `«${source}»`,
};

const FORM: FormDocument = {
	confirmationBody: "Your response has been saved.",
	confirmationTitle: "Thanks for your response",
	createdAt: "2026-01-01T00:00:00.000Z",
	description: "",
	fields: [],
	id: "form-1",
	published: true,
	publishedAt: "2026-01-02T00:00:00.000Z",
	revision: 1,
	slug: "feedback",
	submitButtonText: "Submit",
	title: "Feedback",
	updatedAt: "2026-01-02T00:00:00.000Z",
};

function pageErrors(acceptLanguage: string) {
	const { html } = renderRespondentPage(FORM, { acceptLanguage });
	const copy = JSON.parse(
		html.split('id="page-copy"')[1]?.split(">")[1]?.split("</script")[0] ?? "{}"
	) as { errors: ReturnType<typeof respondentErrorCopy> };
	return copy.errors;
}

describe("respondent error copy", () => {
	it("translates every submission error code and the changed-form message", () => {
		const { codes, messages } = respondentErrorCopy(marked);
		for (const code of ["not_found", "quota", "rate_limited", "too_large"]) {
			expect(codes[code]).toMatch(/^«.+»$/u);
		}
		expect(messages["This form changed. Reload it and try again."]).toBe(
			"«This form changed. Reload it and try again.»"
		);
	});

	it("ships German error copy to a German visitor and English to others", () => {
		const german = pageErrors("de-DE,de;q=0.9");
		expect(german.codes.rate_limited).not.toBe(
			"Too many responses. Try again in a minute."
		);
		expect(german.codes.quota).not.toBe(
			"This form is no longer accepting responses."
		);
		expect(german.codes.too_large).not.toBe("This response is too large.");
		expect(
			german.messages["This form changed. Reload it and try again."]
		).not.toBe("This form changed. Reload it and try again.");
		expect(pageErrors("en").codes.rate_limited).toBe(
			"Too many responses. Try again in a minute."
		);
	});
});

/** The respondent page's own `errorText`, run against the copy its page carries. */
function pageErrorText(acceptLanguage: string) {
	const { html } = renderRespondentPage(FORM, { acceptLanguage });
	const copy = JSON.parse(
		html.split('id="page-copy"')[1]?.split(">")[1]?.split("</script")[0] ?? "{}"
	);
	const source = html.match(/const errors = [\s\S]*?copy\.saveFailed;/u)?.[0];
	if (!source) {
		throw new Error("errorText is missing from the respondent script");
	}
	return new Function("copy", `${source}\nreturn errorText;`)(copy) as (
		error: unknown
	) => string;
}

describe("respondent page error text (end to end)", () => {
	/** Real public submission errors: a changed form, too large, and an unknown form. */
	async function serverErrors() {
		const store = new FormsStore(":memory:");
		try {
			const handler = createFormsHandler({ store, token: "t" });
			const call = (path: string, body: unknown, auth = false) =>
				handler(
					new Request(`http://forms.test/api/forms${path}`, {
						method: "POST",
						headers: {
							"content-type": "application/json",
							...(auth ? { authorization: "Bearer t" } : {}),
						},
						body: JSON.stringify(body),
					})
				).then((response) => response.json());
			const form = (await call(
				"/admin/forms",
				{ title: "Feedback", slug: "feedback-form", template: "feedback" },
				true
			)) as FormDocument;
			await call(`/admin/forms/${form.id}/publish`, {}, true);
			const submit = (slug: string, answers: Record<string, string>) =>
				call(`/${slug}/submissions`, {
					submissionId: crypto.randomUUID(),
					answers,
				});
			const [first, second] = form.fields;
			return {
				changed: await submit(form.slug, { gone: "An answer" }),
				missing: await submit("no-such-form", { gone: "An answer" }),
				tooLarge: await submit(form.slug, {
					[first?.id ?? ""]: "é".repeat(1999),
					[second?.id ?? ""]: "é".repeat(1999),
				}),
			};
		} finally {
			store.close();
		}
	}

	it("shows ja, ar and de respondents their own language, never the server English", async () => {
		const errors = await serverErrors();
		expect(errors.changed.error.code).toBe("operation_failed");
		expect(errors.tooLarge.error.code).toBe("too_large");
		expect(errors.missing.error.code).toBe("not_found");
		for (const locale of ["ja", "ar", "de"]) {
			const t = respondentLocale(locale);
			const text = pageErrorText(locale);
			const changed = text(errors.changed.error);
			expect(changed).toBe(t.tl("This form changed. Reload it and try again."));
			expect(changed).not.toBe(errors.changed.error.message);
			const tooLarge = text(errors.tooLarge.error);
			expect(tooLarge).toBe(t.tl("This response is too large."));
			expect(tooLarge).not.toBe(errors.tooLarge.error.message);
			expect(text(errors.missing.error)).toBe(
				t.tl("This form is no longer available.")
			);
			expect(text({ code: "invalid_input", message: "Required" })).toBe(
				t.tl("Your response could not be saved.")
			);
		}
	});

	it("keeps English copy as before for codes it knows", () => {
		const text = pageErrorText("en");
		expect(text({ code: "quota", message: "x" })).toBe(
			"This form is no longer accepting responses."
		);
		expect(text(undefined)).toBe("Your response could not be saved.");
	});
});

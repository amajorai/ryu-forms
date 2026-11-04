import { afterEach, describe, expect, it } from "bun:test";
import type { FormDocument } from "./contracts.ts";
import { renderRespondentPage } from "./respondent.ts";
import catalogs from "./respondent-catalog.generated.json" with {
	type: "json",
};
import {
	acceptedLanguages,
	negotiateRespondentLocale,
	ownerLocaleFromEnv,
} from "./respondent-locale.ts";
import { createFormsHandler } from "./server.ts";
import { FormsStore } from "./store.ts";

const LOCALE_ENV = ["LC_ALL", "LC_MESSAGES", "LANG"] as const;
const savedEnv = Object.fromEntries(
	LOCALE_ENV.map((name) => [name, process.env[name]])
);

function setOwnerLocale(value: string | undefined): void {
	for (const name of LOCALE_ENV) {
		delete process.env[name];
	}
	if (value !== undefined) {
		process.env.LANG = value;
	}
}

afterEach(() => {
	for (const name of LOCALE_ENV) {
		const value = savedEnv[name];
		if (value === undefined) {
			delete process.env[name];
		} else {
			process.env[name] = value;
		}
	}
});

function defaultForm(): FormDocument {
	return {
		confirmationBody: "Your response has been saved.",
		confirmationTitle: "Thanks for your response",
		createdAt: "2026-01-01T00:00:00.000Z",
		description: "Tell us more",
		fields: [
			{
				id: "ok",
				title: "Coming?",
				description: "",
				type: "yes_no",
				required: true,
				options: [],
			},
		],
		id: "form-1",
		published: true,
		publishedAt: "2026-01-02T00:00:00.000Z",
		revision: 1,
		slug: "rsvp",
		submitButtonText: "Submit",
		title: "RSVP",
		updatedAt: "2026-01-03T00:00:00.000Z",
	};
}

const arabic = (catalogs as Record<string, Record<string, string>>).ar ?? {};

describe("respondent page language", () => {
	it("renders right-to-left Arabic chrome for an Arabic visitor", () => {
		setOwnerLocale(undefined);
		const { html } = renderRespondentPage(defaultForm(), {
			acceptLanguage: "ar-EG,ar;q=0.9,en;q=0.5",
		});
		expect(html).toContain('<html lang="ar" dir="rtl">');
		const submit = arabic.Submit;
		expect(submit).toBeDefined();
		expect(submit).not.toBe("Submit");
		expect(html).toContain(`type="submit">${submit}</button>`);
		expect(html).toContain(`"submitButtonText":"${submit}"`);
	});

	it("never prints the catalog's fragment translation of a yes/no answer", () => {
		for (const acceptLanguage of ["de", "ja", "ar"]) {
			const { html } = renderRespondentPage(defaultForm(), { acceptLanguage });
			const copy = JSON.parse(
				html.split('id="page-copy"')[1]?.split(">")[1]?.split("</script")[0] ??
					"{}"
			) as { no?: string; yes?: string };
			for (const fragment of ["Keine", "追加された", "لم تتم إضافة أي"]) {
				expect(copy.no).not.toBe(fragment);
			}
			// Yes and No ship as a pair, so the two radios share one language.
			expect(copy.yes === "Yes").toBe(copy.no === "No");
		}
		expect(
			renderRespondentPage(defaultForm(), { acceptLanguage: "de-DE" }).html
		).toContain('type="submit">Senden</button>');
	});

	it("keeps author-written button text as written", () => {
		const form = { ...defaultForm(), submitButtonText: "Count me in" };
		const { html } = renderRespondentPage(form, { acceptLanguage: "ar" });
		expect(html).toContain('type="submit">Count me in</button>');
	});

	it("falls back to the owner's locale, then English", () => {
		setOwnerLocale(undefined);
		const english = renderRespondentPage(defaultForm()).html;
		expect(english).toContain('<html lang="en" dir="ltr">');
		expect(english).toContain('type="submit">Submit</button>');

		setOwnerLocale("ar_SA.UTF-8");
		expect(renderRespondentPage(defaultForm()).html).toContain(
			'<html lang="ar" dir="rtl">'
		);
		// A visitor who asks for English gets English even on an Arabic node.
		expect(
			renderRespondentPage(defaultForm(), { acceptLanguage: "en-GB" }).html
		).toContain('<html lang="en" dir="ltr">');
	});

	it("negotiates by quality and by language/script match", () => {
		expect(acceptedLanguages("de;q=0.4, fr, *, ja;q=0")).toEqual(["fr", "de"]);
		expect(negotiateRespondentLocale("pt-PT", null).locale).toBe("pt-BR");
		expect(negotiateRespondentLocale("zh-TW", null).locale).toBe("en");
		expect(negotiateRespondentLocale("sw, de;q=0.8", null).locale).toBe("de");
		expect(negotiateRespondentLocale("not a tag", null).locale).toBe("en");
		expect(ownerLocaleFromEnv({ LANG: "C.UTF-8" })).toBeNull();
		expect(ownerLocaleFromEnv({ LANG: "de_DE.UTF-8" })).toBe("de-DE");
	});
});

describe("respondent route language", () => {
	it("negotiates each request's Accept-Language", async () => {
		const store = new FormsStore(":memory:");
		const token = "forms-i18n-token";
		const handler = createFormsHandler({ store, token });
		const origin = "http://forms.test";
		try {
			const created = await handler(
				new Request(`${origin}/api/forms/admin/forms`, {
					method: "POST",
					headers: {
						authorization: `Bearer ${token}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						title: "Feedback",
						slug: "feedback-form",
						template: "feedback",
					}),
				})
			);
			const form = (await created.json()) as { id: string; slug: string };
			await handler(
				new Request(`${origin}/api/forms/admin/forms/${form.id}/publish`, {
					method: "POST",
					headers: { authorization: `Bearer ${token}` },
				})
			);
			const page = await handler(
				new Request(`${origin}/api/forms/${form.slug}`, {
					headers: { "accept-language": "ar" },
				})
			);
			expect(page.headers.get("vary")).toBe("Accept-Language");
			const html = await page.text();
			expect(html).toContain('<html lang="ar" dir="rtl">');
			expect(html).toContain(`type="submit">${arabic.Submit}</button>`);
		} finally {
			store.close();
		}
	});
});

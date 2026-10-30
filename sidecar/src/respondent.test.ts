import { describe, expect, it } from "bun:test";
import type { FormDocument } from "./contracts.ts";
import { renderRespondentPage } from "./respondent.ts";

const HOSTILE = "</script><img src=x onerror=alert(1)>&amp;\u2028\u2029";

function hostileForm(): FormDocument {
	return {
		confirmationBody: `Thanks ${HOSTILE}`,
		confirmationTitle: `Done ${HOSTILE}`,
		createdAt: "2026-01-01T00:00:00.000Z",
		description: `Intro ${HOSTILE}`,
		fields: [
			{
				id: "colour",
				title: `Colour ${HOSTILE}`,
				description: `Hint ${HOSTILE}`,
				type: "single_choice",
				required: true,
				options: [`Red ${HOSTILE}`, "Blue"],
			},
		],
		id: "form-private-id-123",
		published: true,
		publishedAt: "2026-01-02T00:00:00.000Z",
		revision: 7,
		slug: "private-slug-xyz",
		submitButtonText: `Send ${HOSTILE}`,
		title: `<svg onload=alert(1)> ${HOSTILE}`,
		updatedAt: "2026-01-03T00:00:00.000Z",
	};
}

function embeddedFormJson(html: string, nonce: string): string {
	const open = `<script id="form-data" type="application/json" nonce="${nonce}">`;
	const start = html.indexOf(open);
	if (start === -1) {
		throw new Error("The respondent page has no form-data script.");
	}
	const bodyStart = start + open.length;
	const end = html.indexOf("</script>", bodyStart);
	return html.slice(bodyStart, end);
}

describe("renderRespondentPage", () => {
	it("embeds author content as inert JSON that round-trips exactly", () => {
		const form = hostileForm();
		const { html, nonce } = renderRespondentPage(form);
		const json = embeddedFormJson(html, nonce);

		// No raw markup or JS line terminators escape into the document.
		expect(json).not.toContain("<");
		expect(json).not.toContain(">");
		expect(json).not.toContain("&");
		expect(json).not.toContain("\u2028");
		expect(json).not.toContain("\u2029");
		expect(html).not.toContain("<img src=x");
		expect(html).not.toContain("<svg onload");

		// The escaped JSON still decodes to the author's exact text.
		const decoded = JSON.parse(json) as {
			title: string;
			description: string;
			fields: FormDocument["fields"];
			submitButtonText: string;
			confirmationTitle: string;
			confirmationBody: string;
		};
		expect(decoded.title).toBe(form.title);
		expect(decoded.description).toBe(form.description);
		expect(decoded.fields[0]?.title).toBe(form.fields[0]?.title);
		expect(decoded.fields[0]?.description).toBe(form.fields[0]?.description);
		expect(decoded.fields[0]?.options).toEqual(form.fields[0]?.options ?? []);
		expect(decoded.submitButtonText).toBe(form.submitButtonText);
		expect(decoded.confirmationTitle).toBe(form.confirmationTitle);
		expect(decoded.confirmationBody).toBe(form.confirmationBody);
	});

	it("publishes only respondent-facing fields, not internal identifiers", () => {
		const { html, nonce } = renderRespondentPage(hostileForm());
		const decoded = JSON.parse(embeddedFormJson(html, nonce)) as Record<
			string,
			unknown
		>;
		expect(Object.keys(decoded).sort()).toEqual([
			"confirmationBody",
			"confirmationTitle",
			"description",
			"fields",
			"submitButtonText",
			"title",
		]);
		expect(html).not.toContain("form-private-id-123");
		expect(html).not.toContain("private-slug-xyz");
	});

	it("tags both script elements with a fresh per-render nonce", () => {
		const first = renderRespondentPage(hostileForm());
		const second = renderRespondentPage(hostileForm());
		expect(first.nonce).toMatch(/^[0-9a-f]{32}$/);
		expect(first.nonce).not.toBe(second.nonce);
		const tagged = first.html.match(/<script[^>]*nonce="([^"]+)"/g) ?? [];
		expect(tagged).toHaveLength(2);
		for (const tag of tagged) {
			expect(tag).toContain(`nonce="${first.nonce}"`);
		}
		expect(first.html.match(/<script\b/g) ?? []).toHaveLength(2);
	});

	it("shows the Ryu attribution by default and drops it when removable", () => {
		const branded = renderRespondentPage(hostileForm()).html;
		expect(branded).toContain('data-ryu-powered-by="forms"');
		expect(branded).toContain('rel="noopener"');
		const href = branded.match(
			/data-ryu-powered-by="forms" href="([^"]+)"/
		)?.[1];
		expect(href).toBeDefined();
		// Query separators are HTML-escaped inside the attribute.
		expect(href).not.toMatch(/&(?!amp;)/);

		const unbranded = renderRespondentPage(hostileForm(), {
			poweredByRyu: false,
		}).html;
		expect(unbranded).not.toContain("data-ryu-powered-by");
		expect(unbranded).not.toContain('class="attribution"');
	});
});

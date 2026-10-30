import { z } from "zod";
import type {
	FormDocument,
	FormListItem,
	FormSubmission,
	FormSubmissionPage,
} from "../../src/contracts.ts";
import {
	type FormsAdminRequestBody,
	type FormWriteBody,
	formDeleteResponseSchema,
	formDocumentSchema,
	formErrorResponseSchema,
	formListItemSchema,
	formSubmissionPageSchema,
} from "../../src/contracts.ts";

export async function formsRequest<T>(
	schema: z.ZodType<T>,
	path: string,
	method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
	body?: FormsAdminRequestBody
): Promise<T> {
	if (!window.ryu?.app?.request) {
		throw new Error("Open Forms in Ryu to connect to its service.");
	}
	const result = await window.ryu.app.request({ path, method, body });
	const error = formErrorResponseSchema.safeParse(result);
	if (error.success) {
		throw new Error(error.data.error.message);
	}
	return schema.parse(result);
}

export async function sharePathForForm(slug: string): Promise<{
	path: string;
	url: string | null;
}> {
	const path = `/forms/${encodeURIComponent(slug)}`;
	try {
		const origins = await window.ryu?.node?.shareOrigins();
		const origin = (origins ?? [])
			.filter(
				(candidate) => candidate.reachable && isHttpOrigin(candidate.origin)
			)
			.sort(
				(left, right) =>
					shareOriginRank(left.source) - shareOriginRank(right.source)
			)[0];
		return {
			path,
			url: origin ? new URL(path, origin.origin).toString() : null,
		};
	} catch {
		return { path, url: null };
	}
}

export function buildFormCsv(
	form: Pick<FormDocument, "fields" | "title">,
	responses: FormSubmission[]
): string {
	const header = ["Submitted at", ...form.fields.map((field) => field.title)];
	const rows = responses.map((response) => [
		response.submittedAt,
		...form.fields.map((field) => answerText(response.answers[field.id])),
	]);
	return [header, ...rows]
		.map((row) => row.map(csvCell).join(","))
		.join("\r\n");
}

export interface FormsApi {
	create(input: {
		slug: string;
		template: "blank" | "contact" | "feedback";
		title: string;
	}): Promise<FormDocument>;
	delete(id: string): Promise<{ deleted: true }>;
	detail(id: string): Promise<FormDocument>;
	list(): Promise<FormListItem[]>;
	responses(id: string, cursor?: string | null): Promise<FormSubmissionPage>;
	save(id: string, body: FormWriteBody): Promise<FormDocument>;
	setPublished(id: string, published: boolean): Promise<FormDocument>;
}

export const formsApi: FormsApi = {
	list: () => formsRequest(z.array(formListItemSchema), "/admin/forms"),
	detail: (id) =>
		formsRequest(formDocumentSchema, `/admin/forms/${encodeURIComponent(id)}`),
	create: (input) =>
		formsRequest(formDocumentSchema, "/admin/forms", "POST", input),
	save: (id, body) =>
		formsRequest(
			formDocumentSchema,
			`/admin/forms/${encodeURIComponent(id)}`,
			"PUT",
			body
		),
	setPublished: (id, published) =>
		formsRequest(
			formDocumentSchema,
			`/admin/forms/${encodeURIComponent(id)}/${published ? "publish" : "unpublish"}`,
			"POST"
		),
	delete: (id) =>
		formsRequest(
			formDeleteResponseSchema,
			`/admin/forms/${encodeURIComponent(id)}`,
			"DELETE"
		),
	responses: (id, cursor) => {
		const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
		return formsRequest(
			formSubmissionPageSchema,
			`/admin/forms/${encodeURIComponent(id)}/responses${query}`
		);
	},
};

function isHttpOrigin(value: string): boolean {
	try {
		const protocol = new URL(value).protocol;
		return protocol === "http:" || protocol === "https:";
	} catch {
		return false;
	}
}

function shareOriginRank(source: "active" | "lan" | "mesh"): number {
	return source === "active" ? 0 : source === "lan" ? 1 : 2;
}

function answerText(value: string | string[] | undefined): string {
	return Array.isArray(value) ? value.join("; ") : (value ?? "");
}

function csvCell(value: string): string {
	const safe = /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : value;
	return `"${safe.replaceAll('"', '""')}"`;
}

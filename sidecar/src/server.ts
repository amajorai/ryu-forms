import { bearerOk } from "@ryu/sidecar-runtime";
import { brandingRemovable } from "@ryu/sidecar-runtime/branding";
import { z } from "zod";
import {
	createFormSchema,
	FORM_LIMITS,
	type FormDocument,
	type FormsHttpResponse,
	formContentSchema,
	publicSubmissionSchema,
} from "./contracts.ts";
import { renderRespondentPage } from "./respondent.ts";
import { FormsError, type FormsStore } from "./store.ts";

const API_PREFIX = "/api/forms";
const json = (value: FormsHttpResponse, status = 200) =>
	Response.json(value, {
		status,
		headers: {
			"cache-control": "no-store",
			"x-content-type-options": "nosniff",
		},
	});

export interface FormsServerOptions {
	port?: number;
	store: FormsStore;
	token: string | null;
}

export function createFormsHandler(options: FormsServerOptions) {
	return async (request: Request): Promise<Response> => {
		const url = new URL(request.url);
		const path = url.pathname;
		if (path === "/health" && request.method === "GET") {
			return json({ status: "ok" });
		}
		if (
			(path === `${API_PREFIX}/admin` ||
				path.startsWith(`${API_PREFIX}/admin/`) ||
				path === `${API_PREFIX}/status`) &&
			!bearerOk(
				request.headers.get("authorization") ?? undefined,
				options.token
			)
		) {
			return errorResponse(
				new FormsError(
					"unauthorized",
					"Ryu has not approved this app request.",
					401
				)
			);
		}
		try {
			if (path === `${API_PREFIX}/status` && request.method === "GET") {
				return json({
					status: "ready",
					formCount: options.store.list().length,
					sealing: options.store.sealHealth(),
				});
			}
			if (path === `${API_PREFIX}/admin/forms` && request.method === "GET") {
				return json(options.store.list());
			}
			if (path === `${API_PREFIX}/admin/forms` && request.method === "POST") {
				return json(
					options.store.create(await readJson(request, createFormSchema)),
					201
				);
			}

			const exportMatch = new RegExp(
				`^${API_PREFIX}/admin/forms/([^/]+)/export$`
			).exec(path);
			if (exportMatch && request.method === "GET") {
				const form = options.store.get(
					decodeURIComponent(exportMatch[1] ?? "")
				);
				return json({
					form: { fields: form.fields, title: form.title },
					responses: options.store.exportResponses(form.id),
				});
			}

			const responseMatch = new RegExp(
				`^${API_PREFIX}/admin/forms/([^/]+)/responses$`
			).exec(path);
			if (responseMatch && request.method === "GET") {
				const requestedLimit = url.searchParams.has("limit")
					? Number(url.searchParams.get("limit"))
					: FORM_LIMITS.responsePage;
				if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
					throw new FormsError(
						"invalid_input",
						"Response limit must be a positive integer."
					);
				}
				return json(
					options.store.responses(
						decodeURIComponent(responseMatch[1] ?? ""),
						url.searchParams.get("cursor"),
						requestedLimit
					)
				);
			}

			const actionMatch = new RegExp(
				`^${API_PREFIX}/admin/forms/([^/]+)/(publish|unpublish)$`
			).exec(path);
			if (actionMatch && request.method === "POST") {
				const published = actionMatch[2] === "publish";
				return json(
					options.store.setPublished(
						decodeURIComponent(actionMatch[1] ?? ""),
						published
					)
				);
			}

			const adminMatch = new RegExp(`^${API_PREFIX}/admin/forms/([^/]+)$`).exec(
				path
			);
			if (adminMatch && request.method === "GET") {
				return json(options.store.get(decodeURIComponent(adminMatch[1] ?? "")));
			}
			if (adminMatch && request.method === "PUT") {
				return json(
					options.store.update(
						decodeURIComponent(adminMatch[1] ?? ""),
						await readJson(request, formContentSchema)
					)
				);
			}
			if (adminMatch && request.method === "DELETE") {
				options.store.delete(decodeURIComponent(adminMatch[1] ?? ""));
				return json({ deleted: true });
			}

			const publicSubmission = new RegExp(
				`^${API_PREFIX}/([a-z0-9][a-z0-9-]{1,46}[a-z0-9])/submissions$`
			).exec(path);
			if (publicSubmission && request.method === "POST") {
				const input = await readJson(request, publicSubmissionSchema, 16_384);
				return json(
					{
						accepted: true,
						...options.store.addSubmission(publicSubmission[1] ?? "", input),
					},
					201
				);
			}
			const publicForm = new RegExp(
				`^${API_PREFIX}/([a-z0-9][a-z0-9-]{1,46}[a-z0-9])$`
			).exec(path);
			if (publicForm && request.method === "GET") {
				const form = options.store.getBySlug(publicForm[1] ?? "");
				if (!form?.published) {
					throw new FormsError("not_found", "Form not found", 404);
				}
				return respondentResponse(form);
			}
			return errorResponse(
				new FormsError("not_found", "Resource not found.", 404)
			);
		} catch (cause) {
			return errorResponse(toFormsError(cause));
		}
	};
}

export function createFormsServer(options: FormsServerOptions) {
	if (!options.token) {
		throw new Error("Forms requires its Core-minted extension token");
	}
	return Bun.serve({
		hostname: "127.0.0.1",
		port: options.port ?? 0,
		fetch: createFormsHandler(options),
	});
}

async function readJson<T>(
	request: Request,
	schema: z.ZodType<T>,
	limit = 131_072
): Promise<T> {
	if (
		!request.headers
			.get("content-type")
			?.toLowerCase()
			.includes("application/json")
	) {
		throw new FormsError("invalid_input", "JSON body required.", 415);
	}
	const reader = request.body?.getReader();
	if (!reader) {
		throw new FormsError("invalid_input", "Request body required.");
	}
	let size = 0;
	const chunks: Uint8Array[] = [];
	while (true) {
		const chunk = await reader.read();
		if (chunk.done) {
			break;
		}
		size += chunk.value.byteLength;
		if (size > limit) {
			await reader.cancel();
			throw new FormsError("too_large", "Request exceeds the size limit.", 413);
		}
		chunks.push(chunk.value);
	}

	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	const serialized = new TextDecoder().decode(bytes);
	let parsed: z.input<typeof schema>;
	try {
		parsed = JSON.parse(serialized);
	} catch {
		throw new FormsError("invalid_input", "Request body is not valid JSON.");
	}
	return schema.parse(parsed);
}

function respondentResponse(form: FormDocument): Response {
	const { html, nonce } = renderRespondentPage(form, {
		poweredByRyu: !brandingRemovable(process.env),
	});
	return new Response(html, {
		headers: {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "no-store",
			"content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
			"referrer-policy": "no-referrer",
			"x-content-type-options": "nosniff",
			"x-frame-options": "DENY",
		},
	});
}

function toFormsError(cause: unknown): FormsError {
	if (cause instanceof FormsError) {
		return cause;
	}
	if (cause instanceof z.ZodError) {
		const message = cause.issues[0]?.message ?? "Form input is invalid.";
		return new FormsError("invalid_input", message, 400);
	}
	if (cause instanceof Error) {
		return new FormsError("operation_failed", cause.message);
	}
	return new FormsError("operation_failed", "The Forms operation failed.", 500);
}

function errorResponse(error: FormsError): Response {
	return json(
		{ error: { code: error.code, message: error.message } },
		error.status
	);
}

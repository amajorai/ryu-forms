import type { Page } from "@playwright/test";
import {
	type FormDocument,
	type FormsAdminRequestBody,
	type FormsAdminResponse,
	formDocumentSchema,
} from "../../src/contracts.ts";
import { formsFixtureBundle } from "./fixture-bundle.ts";
import type {} from "./fixture-schemas.ts";

export interface FormsRequestCall {
	body?: FormsAdminRequestBody;
	method: string;
	path: string;
	response?: FormsAdminResponse;
	status?: number;
}

declare global {
	interface Window {
		__ryuFormsCalls?: FormsRequestCall[];
	}
}
export async function installFormsHost(
	page: Page,
	options: { initialListFailures?: number } = {}
): Promise<void> {
	await page.addInitScript({ content: formsFixtureBundle() });
	await page.addInitScript(({ initialListFailures }) => {
		const schemas = window.__formsFixtureSchemas;
		if (!schemas) {
			throw new Error("Forms fixture codecs are unavailable.");
		}
		const calls: FormsRequestCall[] = [];
		let listFailuresRemaining = initialListFailures ?? 0;
		Object.defineProperty(window, "__ryuFormsCalls", {
			configurable: true,
			value: calls,
		});
		const appRequest = async (input: {
			body?: FormsAdminRequestBody;
			method?: string;
			path: string;
		}) => {
			const call: FormsRequestCall = {
				path: input.path,
				method: input.method ?? "GET",
			};
			if (input.body !== undefined) {
				call.body = input.body;
			}
			calls.push(call);
			if (
				input.path === "/admin/forms" &&
				call.method === "GET" &&
				listFailuresRemaining > 0
			) {
				listFailuresRemaining -= 1;
				throw new Error("Forms fixture temporarily unavailable.");
			}

			const headers = new Headers({ authorization: "Bearer forms-e2e-token" });
			const init: RequestInit = { method: call.method, headers };
			if (input.body !== undefined) {
				headers.set("content-type", "application/json");
				init.body = JSON.stringify(input.body);
			}
			const response = await fetch(`/api/forms${input.path}`, init);
			const payload = schemas.response(await response.json());
			call.response = payload;
			call.status = response.status;
			if (!response.ok) {
				throw new Error(
					"error" in payload ? payload.error.message : "Forms request failed"
				);
			}
			return payload;
		};
		Object.defineProperty(window, "ryu", {
			configurable: true,
			value: {
				app: { request: appRequest },
				node: {
					shareOrigins: async () => [
						{ origin: location.origin, reachable: true, source: "active" },
					],
				},
			},
		});
	}, options);
}

export async function formsRequestLog(page: Page): Promise<FormsRequestCall[]> {
	return page.evaluate(() => window.__ryuFormsCalls ?? []);
}

export async function createdFormResponse(page: Page): Promise<FormDocument> {
	const calls = await formsRequestLog(page);
	const form = calls.find(
		(call) =>
			call.method === "POST" &&
			call.path === "/admin/forms" &&
			call.status === 201 &&
			formDocumentSchema.safeParse(call.response).success
	)?.response;
	const parsed = formDocumentSchema.safeParse(form);
	if (!parsed.success) {
		throw new Error("The Forms create request did not return its saved form.");
	}
	return parsed.data;
}

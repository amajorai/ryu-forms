import type { LiteralMessage } from "@ryu/i18n/react";
import { z } from "zod";
import type { FormDocument, FormListItem } from "../../src/contracts.ts";

export const screenSchema = z.enum(["builder", "responses", "share"]);
export type Screen = z.output<typeof screenSchema>;
export interface ShareLink {
	path: string;
	url: string | null;
}

export function editableContent(form: FormDocument) {
	return {
		title: form.title,
		description: form.description,
		fields: form.fields.map((field) => ({
			...field,
			options: field.options.map((option) => option.trim()).filter(Boolean),
		})),
		submitButtonText: form.submitButtonText,
		confirmationTitle: form.confirmationTitle,
		confirmationBody: form.confirmationBody,
	};
}

export function toListItem(form: FormDocument): FormListItem {
	return {
		id: form.id,
		slug: form.slug,
		title: form.title,
		description: form.description,
		submitButtonText: form.submitButtonText,
		confirmationTitle: form.confirmationTitle,
		published: form.published,
		publishedAt: form.publishedAt,
		createdAt: form.createdAt,
		updatedAt: form.updatedAt,
		revision: form.revision,
		responseCount: 0,
	};
}

export function errorMessage(cause: unknown, tl: LiteralMessage): string {
	return cause instanceof Error
		? cause.message
		: tl("The Forms operation failed.");
}

export function createErrorMessage(cause: unknown, tl: LiteralMessage): string {
	const message = errorMessage(cause, tl);
	if (message.includes("must match pattern")) {
		return tl(
			"Use 3–48 lowercase letters, numbers, or hyphens. Start and end with a letter or number."
		);
	}
	return message;
}

export function safeFilename(value: string): string {
	return (
		value
			.normalize("NFKD")
			.replace(/[^a-zA-Z0-9_-]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 80) || "form"
	);
}

/** A URL-safe slug from a form title, ending in the dialog's random suffix. */
export function slugFromTitle(value: string, suffix: string): string {
	const normalized = value
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40)
		.replace(/-+$/g, "");
	return `${normalized || "form"}-${suffix}`;
}

import { describe, expect, it } from "bun:test";
import {
	createFormSchema,
	type FormField,
	formFieldSchema,
	RESERVED_FORM_SLUGS,
	validateAnswers,
} from "./contracts.ts";

describe("form fields and response validation", () => {
	it("requires distinct options for choice questions", () => {
		const field = {
			id: "topic",
			title: "Topic",
			description: "",
			type: "single_choice",
			required: true,
			options: ["Bug", "bug"],
		};
		expect(formFieldSchema.safeParse(field).success).toBe(false);
	});

	it("validates required, email, and option answers on the server", () => {
		const fields: FormField[] = [
			{
				id: "email",
				title: "Email",
				description: "",
				type: "email",
				required: true,
				options: [],
			},
			{
				id: "kind",
				title: "Kind",
				description: "",
				type: "single_choice",
				required: true,
				options: ["Idea", "Bug"],
			},
		];
		expect(() => validateAnswers(fields, { email: "", kind: "Idea" })).toThrow(
			"Answer"
		);
		expect(() =>
			validateAnswers(fields, { email: "  ", kind: "Idea" })
		).toThrow("Answer");
		expect(() =>
			validateAnswers(fields, { email: "not-email", kind: "Idea" })
		).toThrow("valid email");
		expect(() =>
			validateAnswers(fields, { email: "team@example.com", kind: "Other" })
		).toThrow("Choose an option");
		expect(
			validateAnswers(fields, { email: "team@example.com", kind: "Idea" })
		).toEqual({
			email: "team@example.com",
			kind: "Idea",
		});
	});

	it("rejects answer keys that no longer exist in the form", () => {
		expect(() => validateAnswers([], { stale: "answer" })).toThrow(
			"form changed"
		);
	});

	it("rejects form links that collide with management routes", () => {
		const form = { title: "Intake", template: "blank" } as const;
		for (const slug of [...RESERVED_FORM_SLUGS, " Status "]) {
			const result = createFormSchema.safeParse({ ...form, slug });
			expect(result.success).toBe(false);
			expect(result.error?.issues[0]?.message).toContain("reserved");
		}
		for (const slug of ["status-check", "admin-feedback"]) {
			expect(createFormSchema.safeParse({ ...form, slug }).success).toBe(true);
		}
	});
});

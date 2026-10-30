import { z } from "zod";

export const FORM_LIMITS = {
	forms: 100,
	fields: 40,
	options: 12,
	optionLength: 120,
	formTitle: 160,
	formDescription: 1000,
	fieldTitle: 160,
	fieldDescription: 500,
	answerLength: 2000,
	answerBytes: 4096,
	responsesPerForm: 1000,
	responsesTotal: 2000,
	responsesPerMinute: 30,
	responsePage: 100,
} as const;

export const FIELD_TYPES = [
	"short_text",
	"long_text",
	"email",
	"number",
	"date",
	"single_choice",
	"multi_choice",
	"yes_no",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const formFieldSchema = z
	.object({
		id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
		title: z.string().trim().min(1).max(FORM_LIMITS.fieldTitle),
		description: z.string().trim().max(FORM_LIMITS.fieldDescription),
		type: z.enum(FIELD_TYPES),
		required: z.boolean(),
		options: z
			.array(z.string().trim().min(1).max(FORM_LIMITS.optionLength))
			.max(FORM_LIMITS.options),
	})
	.strict()
	.superRefine((field, context) => {
		const isChoice =
			field.type === "single_choice" || field.type === "multi_choice";
		if (isChoice && field.options.length < 2) {
			context.addIssue({
				code: "custom",
				path: ["options"],
				message: "Choice questions need at least two options",
			});
		}
		if (!isChoice && field.options.length > 0) {
			context.addIssue({
				code: "custom",
				path: ["options"],
				message: "Only choice questions have options",
			});
		}
		const normalizedOptions = field.options.map((option) =>
			option.toLocaleLowerCase()
		);
		if (new Set(normalizedOptions).size !== normalizedOptions.length) {
			context.addIssue({
				code: "custom",
				path: ["options"],
				message: "Choice options must be unique",
			});
		}
	});

export type FormField = z.infer<typeof formFieldSchema>;

export const formContentSchema = z
	.object({
		title: z.string().trim().min(1).max(FORM_LIMITS.formTitle),
		description: z.string().trim().max(FORM_LIMITS.formDescription),
		fields: z.array(formFieldSchema).max(FORM_LIMITS.fields),
		submitButtonText: z.string().trim().min(1).max(40),
		confirmationTitle: z.string().trim().min(1).max(160),
		confirmationBody: z.string().trim().max(500),
		expectedRevision: z.number().int().nonnegative(),
	})
	.strict()
	.superRefine((value, context) => {
		const ids = value.fields.map((field) => field.id);
		if (new Set(ids).size !== ids.length) {
			context.addIssue({
				code: "custom",
				path: ["fields"],
				message: "Question IDs must be unique",
			});
		}
	});

// One-segment paths the manifest already routes to the management API. A form
// link with one of these names would resolve to that route, never the form.
export const RESERVED_FORM_SLUGS: readonly string[] = ["admin", "status"];

export const createFormSchema = z
	.object({
		title: z.string().trim().min(1).max(FORM_LIMITS.formTitle),
		slug: z
			.string()
			.trim()
			.toLowerCase()
			.min(3)
			.regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/)
			.refine((slug) => !RESERVED_FORM_SLUGS.includes(slug), {
				message: "This form link is reserved. Choose another link name.",
			}),
		template: z.enum(["blank", "contact", "feedback"]),
	})
	.strict();

export const publicSubmissionSchema = z
	.object({
		submissionId: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
		answers: z.record(
			z.string(),
			z.union([
				z.string().max(FORM_LIMITS.answerLength),
				z
					.array(z.string().max(FORM_LIMITS.answerLength))
					.max(FORM_LIMITS.options),
			])
		),
		website: z.string().max(500).optional(),
	})
	.strict();

export type FormTemplate = "blank" | "contact" | "feedback";

export interface FormDocument {
	confirmationBody: string;
	confirmationTitle: string;
	createdAt: string;
	description: string;
	fields: FormField[];
	id: string;
	published: boolean;
	publishedAt: string | null;
	revision: number;
	slug: string;
	submitButtonText: string;
	title: string;
	updatedAt: string;
}

export interface FormListItem
	extends Omit<FormDocument, "fields" | "confirmationBody"> {
	responseCount: number;
}

export interface FormSubmission {
	answers: Record<string, string | string[]>;
	id: string;
	submittedAt: string;
}

export interface FormSubmissionPage {
	items: FormSubmission[];
	nextCursor: string | null;
}

/** Complete persisted/wire owners validate fields without normalizing stored rows. */
const formFieldRecordSchema = z.object({
	id: z.string(),
	title: z.string(),
	description: z.string(),
	type: z.enum(FIELD_TYPES),
	required: z.boolean(),
	options: z.array(z.string()),
});
export const formFieldRecordBoundarySchema = z.custom<
	z.output<typeof formFieldRecordSchema>
>((value) => formFieldRecordSchema.safeParse(value).success);
const formDocumentFieldsSchema = z.object({
	confirmationBody: z.string(),
	confirmationTitle: z.string(),
	createdAt: z.string(),
	description: z.string(),
	fields: z.array(formFieldRecordBoundarySchema),
	id: z.string(),
	published: z.boolean(),
	publishedAt: z.string().nullable(),
	revision: z.number(),
	slug: z.string(),
	submitButtonText: z.string(),
	title: z.string(),
	updatedAt: z.string(),
});
export const formDocumentSchema = z.custom<FormDocument>(
	(value) => formDocumentFieldsSchema.safeParse(value).success
);
const formListItemFieldsSchema = formDocumentFieldsSchema
	.omit({ fields: true, confirmationBody: true })
	.extend({ responseCount: z.number() });
export const formListItemSchema = z.custom<FormListItem>(
	(value) => formListItemFieldsSchema.safeParse(value).success
);
const formAnswerSchema = z.union([z.string(), z.array(z.string())]);
const formAnswerFieldsSchema = z.record(z.string(), formAnswerSchema);
export const formAnswersSchema = z.custom<FormSubmission["answers"]>(
	(value) => {
		if (!formAnswerFieldsSchema.safeParse(value).success) {
			return false;
		}
		const entry = Object.getOwnPropertyDescriptor(value, "__proto__");
		return !entry || formAnswerSchema.safeParse(entry.value).success;
	}
);
const formSubmissionFieldsSchema = z.object({
	answers: formAnswersSchema,
	id: z.string(),
	submittedAt: z.string(),
});
export const formSubmissionSchema = z.custom<FormSubmission>(
	(value) => formSubmissionFieldsSchema.safeParse(value).success
);
const formSubmissionPageFieldsSchema = z.object({
	items: z.array(formSubmissionSchema),
	nextCursor: z.string().nullable(),
});
export const formSubmissionPageSchema = z.custom<FormSubmissionPage>(
	(value) => formSubmissionPageFieldsSchema.safeParse(value).success
);
const formExportFieldsSchema = z.object({
	form: formDocumentFieldsSchema.pick({ fields: true, title: true }),
	responses: z.array(formSubmissionSchema),
});
export const formExportResponseSchema = z.custom<
	z.output<typeof formExportFieldsSchema>
>((value) => formExportFieldsSchema.safeParse(value).success);
export const formDeleteResponseSchema = z.object({ deleted: z.literal(true) });
export const formErrorResponseSchema = z.object({
	error: z.object({ code: z.string().optional(), message: z.string() }),
});
export const formsAdminResponseSchema = z.union([
	formDocumentSchema,
	z.array(formListItemSchema),
	formSubmissionPageSchema,
	formExportResponseSchema,
	formDeleteResponseSchema,
	formErrorResponseSchema,
]);
export type FormsAdminResponse = z.output<typeof formsAdminResponseSchema>;
export type FormWriteBody = z.input<typeof formContentSchema>;
export type FormsAdminRequestBody =
	| z.input<typeof createFormSchema>
	| FormWriteBody;
export const fieldTypeSchema = z.enum(FIELD_TYPES);
export const formTemplateSchema = z.enum(["blank", "contact", "feedback"]);
export const formStoredDocumentSchema = z.object({ document: z.string() });
export const formStoredListItemSchema = formStoredDocumentSchema.extend({
	response_count: z.number(),
});
export const formStoredSubmissionSchema = z.object({
	answers: z.string(),
	id: z.string(),
	submitted_at: z.string(),
});
export const formStoredCountSchema = z.object({ count: z.number() });
export const formCursorSchema = z.object({
	id: z.string(),
	submittedAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
});

export function templateFields(template: FormTemplate): FormField[] {
	const field = (
		title: string,
		type: FieldType,
		required: boolean,
		options: string[] = []
	): FormField => ({
		id: crypto.randomUUID(),
		title,
		description: "",
		type,
		required,
		options,
	});
	if (template === "contact") {
		return [
			field("Your name", "short_text", true),
			field("Email address", "email", true),
			field("How can we help?", "long_text", true),
		];
	}
	if (template === "feedback") {
		return [
			field("What is this about?", "single_choice", true, [
				"An idea",
				"A bug",
				"Something else",
			]),
			field("Tell us more", "long_text", true),
			field("Email address", "email", false),
		];
	}
	return [];
}

export function validateAnswers(
	fields: FormField[],
	answers: Record<string, string | string[]>
): Record<string, string | string[]> {
	const fieldIds = new Set(fields.map((field) => field.id));
	if (Object.keys(answers).some((id) => !fieldIds.has(id))) {
		throw new Error("This form changed. Reload it and try again.");
	}
	for (const field of fields) {
		const value = answers[field.id];
		const empty =
			value === undefined ||
			(!Array.isArray(value) && value.trim() === "") ||
			(Array.isArray(value) && value.length === 0);
		if (empty) {
			if (field.required) {
				throw new Error(`Answer “${field.title}” to continue.`);
			}
			continue;
		}
		if (field.type === "multi_choice") {
			if (
				!Array.isArray(value) ||
				value.some((option) => !field.options.includes(option)) ||
				new Set(value).size !== value.length
			) {
				throw new Error(`Choose valid options for “${field.title}”.`);
			}
			continue;
		}
		if (Array.isArray(value)) {
			throw new Error(`Enter one answer for “${field.title}”.`);
		}
		if (
			field.type === "email" &&
			!z.string().email().safeParse(value).success
		) {
			throw new Error(`Enter a valid email address for “${field.title}”.`);
		}
		if (field.type === "number" && !Number.isFinite(Number(value))) {
			throw new Error(`Enter a valid number for “${field.title}”.`);
		}
		if (field.type === "date") {
			const date = new Date(`${value}T00:00:00.000Z`);
			if (
				!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
				Number.isNaN(date.getTime()) ||
				date.toISOString().slice(0, 10) !== value
			) {
				throw new Error(`Enter a valid date for “${field.title}”.`);
			}
		}
		if (field.type === "single_choice" && !field.options.includes(value)) {
			throw new Error(`Choose an option for “${field.title}”.`);
		}
		if (field.type === "yes_no" && value !== "yes" && value !== "no") {
			throw new Error(`Choose yes or no for “${field.title}”.`);
		}
	}
	if (
		new TextEncoder().encode(JSON.stringify(answers)).byteLength >
		FORM_LIMITS.answerBytes
	) {
		throw new Error(
			"This response is too large. Shorten the answers and try again."
		);
	}
	return answers;
}

export const formHealthResponseSchema = z.object({ status: z.literal("ok") });
export const formSealingStatusSchema = z.object({
	store: z.string(),
	state: z.string(),
	sealing: z.string(),
	unreadableRows: z.number(),
	vacuumPending: z.boolean(),
});
export const formStatusResponseSchema = z.object({
	status: z.literal("ready"),
	formCount: z.number(),
	/** At-rest sealing of stored responses (absent from older sidecars). */
	sealing: formSealingStatusSchema.optional(),
});
export const formAcceptedResponseSchema = z.object({
	accepted: z.literal(true),
	duplicate: z.boolean(),
});
export const formsHttpResponseSchema = z.union([
	formsAdminResponseSchema,
	formHealthResponseSchema,
	formStatusResponseSchema,
	formAcceptedResponseSchema,
]);
export type FormsHttpResponse = z.output<typeof formsHttpResponseSchema>;

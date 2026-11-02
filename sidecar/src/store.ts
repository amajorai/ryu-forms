import { Database } from "bun:sqlite";
import { Buffer } from "node:buffer";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
	type SealedColumn,
	SealUnavailableError,
	StoreSeal,
	type StoreSealHealth,
} from "@ryu/sidecar-runtime/content-seal";
import type { PluginKeys } from "@ryu/sidecar-runtime/seal";
import { z } from "zod";
import {
	createFormSchema,
	FORM_LIMITS,
	type FormDocument,
	type FormListItem,
	type FormSubmission,
	type FormSubmissionPage,
	formAnswersSchema,
	formContentSchema,
	formCursorSchema,
	formDocumentSchema,
	formStoredCountSchema,
	formStoredDocumentSchema,
	formStoredListItemSchema,
	formStoredSubmissionSchema,
	publicSubmissionSchema,
	templateFields,
	validateAnswers,
} from "./contracts.ts";

export class FormsError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly status = 400
	) {
		super(message);
	}
}

interface StoredSubmission {
	answers: string;
	id: string;
	submitted_at: string;
}

interface AddSubmissionResult {
	duplicate: boolean;
}

/** Registered content-store name (KDF input; never renamed). */
export const FORMS_CONTENT_STORE = "forms.sqlite";

/** Respondent answers: `encb:v1:` bound to the submission id. */
const SUBMISSION_ANSWERS: SealedColumn = {
	table: "submissions",
	column: "answers",
	kind: "text",
	orderKey: "id",
	bind: ["id"],
};

export interface FormsStoreOptions {
	/** The app's captured keys; omitted (tests, tools) keeps plaintext. */
	keys?: PluginKeys | null;
}

export class FormsStore {
	readonly db: Database;
	readonly seal: StoreSeal;

	constructor(path: string, options: FormsStoreOptions = {}) {
		if (path !== ":memory:") {
			mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
		}
		this.db = new Database(path, { create: true });
		if (path !== ":memory:") {
			chmodSync(path, 0o600);
		}
		this.db.exec(`
			PRAGMA journal_mode=WAL;
			PRAGMA foreign_keys=ON;
			CREATE TABLE IF NOT EXISTS forms (
				id TEXT PRIMARY KEY,
				slug TEXT NOT NULL UNIQUE,
				document TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS submissions (
				id TEXT PRIMARY KEY,
				form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
				submission_key TEXT NOT NULL,
				submitted_at TEXT NOT NULL,
				answers TEXT NOT NULL,
				UNIQUE(form_id, submission_key)
			);
			CREATE INDEX IF NOT EXISTS submissions_form_date
				ON submissions(form_id, submitted_at DESC, id DESC);
			CREATE TABLE IF NOT EXISTS submission_limits (
				form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
				minute_bucket TEXT NOT NULL,
				count INTEGER NOT NULL,
				PRIMARY KEY(form_id, minute_bucket)
			);
		`);
		// Version 2 seals submissions.answers (migrated, then compacted, below).
		this.seal = StoreSeal.open(
			this.db,
			path === ":memory:" ? null : path,
			FORMS_CONTENT_STORE,
			options.keys ?? null,
			[SUBMISSION_ANSWERS]
		);
		this.db.exec("PRAGMA user_version=2");
	}

	/** Sealing state for the authenticated status route. */
	sealHealth(): StoreSealHealth {
		return this.seal.health();
	}

	list(): FormListItem[] {
		const rows = z.array(formStoredListItemSchema).parse(
			this.db
				.query(
					`SELECT forms.document, COUNT(submissions.id) AS response_count
				 FROM forms LEFT JOIN submissions ON submissions.form_id=forms.id
				 GROUP BY forms.id ORDER BY json_extract(forms.document, '$.updatedAt') DESC`
				)
				.all()
		);
		return rows.map(({ document, response_count }) => {
			const form = formDocumentSchema.parse(JSON.parse(document));
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
				responseCount: response_count,
			};
		});
	}

	get(id: string): FormDocument {
		const row = formStoredDocumentSchema
			.nullable()
			.parse(this.db.query("SELECT document FROM forms WHERE id=?").get(id));
		if (!row) {
			throw new FormsError("not_found", "Form not found", 404);
		}
		return formDocumentSchema.parse(JSON.parse(row.document));
	}

	getBySlug(slug: string): FormDocument | null {
		const row = formStoredDocumentSchema
			.nullable()
			.parse(
				this.db.query("SELECT document FROM forms WHERE slug=?").get(slug)
			);
		return row ? formDocumentSchema.parse(JSON.parse(row.document)) : null;
	}

	create(input: z.input<typeof createFormSchema>): FormDocument {
		const parsed = createFormSchema.parse(input);
		if (this.list().length >= FORM_LIMITS.forms) {
			throw new FormsError("quota", "Form limit reached", 429);
		}
		this.assertSlugAvailable(parsed.slug);
		const now = new Date().toISOString();
		const form: FormDocument = {
			id: crypto.randomUUID(),
			slug: parsed.slug,
			title: parsed.title,
			description: "",
			fields: templateFields(parsed.template),
			submitButtonText: "Submit",
			confirmationTitle: "Thanks for your response",
			confirmationBody: "Your response has been saved.",
			published: false,
			publishedAt: null,
			createdAt: now,
			updatedAt: now,
			revision: 0,
		};
		this.db
			.query("INSERT INTO forms (id, slug, document) VALUES (?, ?, ?)")
			.run(form.id, form.slug, JSON.stringify(form));
		return form;
	}

	update(id: string, input: z.input<typeof formContentSchema>): FormDocument {
		const parsed = formContentSchema.parse(input);
		return this.db.transaction(() => {
			const current = this.get(id);
			if (current.published && parsed.fields.length === 0) {
				throw new FormsError(
					"invalid_form",
					"A published form must keep at least one question."
				);
			}
			if (current.revision !== parsed.expectedRevision) {
				throw new FormsError(
					"conflict",
					"This form changed. Reload it before saving.",
					409
				);
			}
			const { expectedRevision: _expectedRevision, ...content } = parsed;
			const next: FormDocument = {
				...current,
				...content,
				revision: current.revision + 1,
				updatedAt: new Date().toISOString(),
			};
			this.db
				.query("UPDATE forms SET document=? WHERE id=?")
				.run(JSON.stringify(next), id);
			return next;
		})();
	}

	setPublished(id: string, published: boolean): FormDocument {
		return this.db.transaction(() => {
			const current = this.get(id);
			if (published && current.fields.length === 0) {
				throw new FormsError(
					"invalid_form",
					"Add at least one question before publishing."
				);
			}
			const now = new Date().toISOString();
			const next: FormDocument = {
				...current,
				published,
				publishedAt: published ? (current.publishedAt ?? now) : null,
				revision: current.revision + 1,
				updatedAt: now,
			};
			this.db
				.query("UPDATE forms SET document=? WHERE id=?")
				.run(JSON.stringify(next), id);
			return next;
		})();
	}

	delete(id: string): void {
		const result = this.db.query("DELETE FROM forms WHERE id=?").run(id);
		if (result.changes === 0) {
			throw new FormsError("not_found", "Form not found", 404);
		}
	}

	addSubmission(
		slug: string,
		input: z.input<typeof publicSubmissionSchema>,
		now = new Date()
	): AddSubmissionResult {
		const parsed = publicSubmissionSchema.parse(input);
		const bytes = new TextEncoder().encode(
			JSON.stringify(parsed.answers)
		).byteLength;
		if (bytes > FORM_LIMITS.answerBytes) {
			throw new FormsError("too_large", "This response is too large.", 413);
		}
		return this.db.transaction(() => {
			const form = this.getBySlug(slug);
			if (!form?.published) {
				throw new FormsError("not_found", "Form not found", 404);
			}
			if (parsed.website?.trim()) {
				return { duplicate: false };
			}
			validateAnswers(form.fields, parsed.answers);
			const existing = this.db
				.query(
					"SELECT id FROM submissions WHERE form_id=? AND submission_key=?"
				)
				.get(form.id, parsed.submissionId);
			if (existing) {
				return { duplicate: true };
			}
			const total = formStoredCountSchema.parse(
				this.db.query("SELECT COUNT(*) AS count FROM submissions").get()
			);
			const forForm = formStoredCountSchema.parse(
				this.db
					.query("SELECT COUNT(*) AS count FROM submissions WHERE form_id=?")
					.get(form.id)
			);
			if (
				total.count >= FORM_LIMITS.responsesTotal ||
				forForm.count >= FORM_LIMITS.responsesPerForm
			) {
				throw new FormsError(
					"quota",
					"This form is no longer accepting responses.",
					429
				);
			}
			const minuteBucket = now.toISOString().slice(0, 16);
			const used = formStoredCountSchema
				.nullable()
				.parse(
					this.db
						.query(
							"SELECT count FROM submission_limits WHERE form_id=? AND minute_bucket=?"
						)
						.get(form.id, minuteBucket)
				);
			if ((used?.count ?? 0) >= FORM_LIMITS.responsesPerMinute) {
				throw new FormsError(
					"rate_limited",
					"Too many responses. Try again in a minute.",
					429
				);
			}
			this.db
				.query(
					`INSERT INTO submission_limits (form_id, minute_bucket, count) VALUES (?, ?, 1)
					 ON CONFLICT(form_id, minute_bucket) DO UPDATE SET count=count+1`
				)
				.run(form.id, minuteBucket);
			const submissionId = crypto.randomUUID();
			this.db
				.query(
					"INSERT INTO submissions (id, form_id, submission_key, submitted_at, answers) VALUES (?, ?, ?, ?, ?)"
				)
				.run(
					submissionId,
					form.id,
					parsed.submissionId,
					now.toISOString(),
					this.sealAnswers(submissionId, JSON.stringify(parsed.answers))
				);
			return { duplicate: false };
		})();
	}

	responses(
		id: string,
		cursor: string | null,
		requestedLimit: number = FORM_LIMITS.responsePage
	): FormSubmissionPage {
		this.get(id);
		const limit = Math.max(
			1,
			Math.min(FORM_LIMITS.responsePage, Math.floor(requestedLimit))
		);
		const decoded = cursor ? decodeCursor(cursor) : null;
		const rows = z.array(formStoredSubmissionSchema).parse(
			decoded
				? this.db
						.query(
							`SELECT id, submitted_at, answers FROM submissions
						 WHERE form_id=? AND (submitted_at<? OR (submitted_at=? AND id<?))
						 ORDER BY submitted_at DESC, id DESC LIMIT ?`
						)
						.all(
							id,
							decoded.submittedAt,
							decoded.submittedAt,
							decoded.id,
							limit + 1
						)
				: this.db
						.query(
							`SELECT id, submitted_at, answers FROM submissions WHERE form_id=?
						 ORDER BY submitted_at DESC, id DESC LIMIT ?`
						)
						.all(id, limit + 1)
		);
		const hasMore = rows.length > limit;
		const page = rows.slice(0, limit);
		const items = this.openSubmissions(page);
		// The cursor follows the last stored row, even when that row is skipped
		// as unreadable, so paging never repeats or loses rows.
		const lastRow = page.at(-1);
		return {
			items,
			nextCursor:
				hasMore && lastRow
					? encodeCursor({ submittedAt: lastRow.submitted_at, id: lastRow.id })
					: null,
		};
	}

	exportResponses(id: string): FormSubmission[] {
		this.get(id);
		const rows = z.array(formStoredSubmissionSchema).parse(
			this.db
				.query(
					`SELECT id, submitted_at, answers FROM submissions
				 WHERE form_id=? ORDER BY submitted_at ASC, id ASC`
				)
				.all(id)
		);
		return this.openSubmissions(rows);
	}

	close(): void {
		this.db.close();
	}

	private sealAnswers(id: string, answers: string): string {
		try {
			return this.seal.sealText(SUBMISSION_ANSWERS, { id }, answers);
		} catch (error) {
			if (error instanceof SealUnavailableError) {
				throw new FormsError("sealing_unavailable", error.message, 503);
			}
			throw error;
		}
	}

	/** Decode stored rows; a sealed row that does not open is counted and skipped. */
	private openSubmissions(rows: StoredSubmission[]): FormSubmission[] {
		const items: FormSubmission[] = [];
		for (const row of rows) {
			const answers = this.seal.tryOpenText(
				SUBMISSION_ANSWERS,
				{ id: row.id },
				row.answers
			);
			if (answers !== null) {
				items.push(toSubmission({ ...row, answers }));
			}
		}
		return items;
	}

	private assertSlugAvailable(slug: string): void {
		if (this.db.query("SELECT 1 FROM forms WHERE slug=?").get(slug)) {
			throw new FormsError(
				"conflict",
				"This form link is already in use.",
				409
			);
		}
	}
}

function toSubmission(row: StoredSubmission): FormSubmission {
	return {
		id: row.id,
		submittedAt: row.submitted_at,
		answers: formAnswersSchema.parse(JSON.parse(row.answers)),
	};
}

function encodeCursor(submission: { id: string; submittedAt: string }): string {
	return Buffer.from(
		JSON.stringify({ submittedAt: submission.submittedAt, id: submission.id })
	).toString("base64url");
}

interface DecodeCursorResult {
	id: string;
	submittedAt: string;
}

function decodeCursor(cursor: string): DecodeCursorResult {
	try {
		const value = formCursorSchema.parse(
			JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
		);
		return { id: value.id, submittedAt: value.submittedAt };
	} catch {
		throw new FormsError("invalid_cursor", "Response cursor is invalid.");
	}
}

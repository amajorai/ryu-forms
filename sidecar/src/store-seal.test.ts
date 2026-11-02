import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capturePluginKeys, type PluginKeys } from "@ryu/sidecar-runtime/seal";
import { FormsStore } from "./store.ts";

const SECRET = "respondent-secret@example.com";

function keys(fill = 9): PluginKeys {
	return capturePluginKeys("@ryu/forms", {
		RYU_SEAL_KEY: Buffer.from(new Uint8Array(32).fill(fill)).toString("base64"),
		RYU_SEAL_SCOPE: "plugin:@ryu/forms",
	});
}

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

function tempPath(): string {
	const dir = mkdtempSync(join(tmpdir(), "ryu-forms-seal-"));
	roots.push(dir);
	return join(dir, "forms.sqlite");
}

function disk(path: string): string {
	let text = readFileSync(path).toString("latin1");
	try {
		text += readFileSync(`${path}-wal`).toString("latin1");
	} catch {
		// No WAL.
	}
	return text;
}

function publishContact(store: FormsStore) {
	const draft = store.create({
		title: "Contact",
		slug: "contact-form",
		template: "contact",
	});
	return store.setPublished(draft.id, true);
}

function answersFor(
	form: ReturnType<typeof publishContact>,
	email: string
): Record<string, string> {
	return {
		[form.fields[0]?.id ?? ""]: "Sam",
		[form.fields[1]?.id ?? ""]: email,
		[form.fields[2]?.id ?? ""]: "Please call me.",
	};
}

describe("FormsStore sealing", () => {
	it("seals submission answers on disk and reads them back", () => {
		const path = tempPath();
		const store = new FormsStore(path, { keys: keys() });
		const form = publishContact(store);
		store.addSubmission(form.slug, {
			submissionId: "request-0001",
			answers: answersFor(form, SECRET),
		});
		const stored = store.db.query("SELECT answers FROM submissions").get() as {
			answers: string;
		};
		expect(stored.answers.startsWith("encb:v1:")).toBe(true);
		expect(store.responses(form.id, null).items[0]?.answers).toMatchObject({
			[form.fields[1]?.id ?? ""]: SECRET,
		});
		expect(store.exportResponses(form.id)).toHaveLength(1);
		store.close();
		expect(disk(path)).not.toContain(SECRET);
		const reopened = new FormsStore(path, { keys: keys() });
		expect(reopened.exportResponses(form.id)[0]?.answers).toMatchObject({
			[form.fields[1]?.id ?? ""]: SECRET,
		});
		expect(
			(
				reopened.db.query("PRAGMA user_version").get() as {
					user_version: number;
				}
			).user_version
		).toBe(2);
		reopened.close();
	});

	it("migrates a version 1 plaintext store and still reads its answers", () => {
		const path = tempPath();
		const legacy = new FormsStore(path);
		const form = publishContact(legacy);
		legacy.addSubmission(form.slug, {
			submissionId: "request-0001",
			answers: answersFor(form, SECRET),
		});
		legacy.db.exec("PRAGMA user_version=1");
		legacy.close();
		expect(disk(path)).toContain(SECRET);

		const sealed = new FormsStore(path, { keys: keys() });
		expect(sealed.exportResponses(form.id)[0]?.answers).toMatchObject({
			[form.fields[1]?.id ?? ""]: SECRET,
		});
		expect(sealed.sealHealth()).toMatchObject({
			sealing: "ok",
			vacuumPending: false,
		});
		sealed.close();
		expect(disk(path)).not.toContain(SECRET);
	});

	it("seals a response an older build wrote after a rollback", () => {
		const path = tempPath();
		const store = new FormsStore(path, { keys: keys() });
		const form = publishContact(store);
		store.close();
		// The pre-sealing build: plaintext answers, user_version reset to 1.
		const old = new Database(path);
		old
			.query(
				"INSERT INTO submissions(id, form_id, submission_key, submitted_at, answers) VALUES ('old-1', ?, 'k-old', '2026-01-01T00:00:00.000Z', ?)"
			)
			.run(form.id, JSON.stringify({ x: "SECRET-DOWNGRADE" }));
		old.exec("PRAGMA user_version=1");
		old.close();

		const reopened = new FormsStore(path, { keys: keys() });
		const stored = reopened.db
			.query("SELECT answers FROM submissions WHERE id='old-1'")
			.get() as { answers: string };
		expect(stored.answers.startsWith("encb:v1:")).toBe(true);
		expect(reopened.exportResponses(form.id)[0]?.answers).toMatchObject({
			x: "SECRET-DOWNGRADE",
		});
		reopened.close();
		expect(disk(path)).not.toContain("SECRET-DOWNGRADE");
	});

	it("skips and counts a response that does not open", () => {
		const store = new FormsStore(tempPath(), { keys: keys() });
		const form = publishContact(store);
		for (const id of ["request-0001", "request-0002"]) {
			store.addSubmission(form.slug, {
				submissionId: id,
				answers: answersFor(form, SECRET),
			});
		}
		const rows = store.db
			.query("SELECT id, answers FROM submissions ORDER BY id")
			.all() as { id: string; answers: string }[];
		// Swap one sealed value onto the other row: its AAD no longer matches.
		store.db
			.query("UPDATE submissions SET answers=? WHERE id=?")
			.run(rows[0]?.answers ?? "", rows[1]?.id ?? "");
		expect(store.exportResponses(form.id)).toHaveLength(1);
		expect(store.sealHealth().unreadableRows).toBe(1);
		store.close();
	});

	it("refuses new responses when the store was sealed under another key", () => {
		const path = tempPath();
		const first = new FormsStore(path, { keys: keys(1) });
		const form = publishContact(first);
		first.addSubmission(form.slug, {
			submissionId: "request-0001",
			answers: answersFor(form, SECRET),
		});
		first.close();
		const other = new FormsStore(path, { keys: keys(2) });
		expect(() =>
			other.addSubmission(form.slug, {
				submissionId: "request-0002",
				answers: answersFor(form, SECRET),
			})
		).toThrow("different key");
		other.close();
		const raw = new Database(path);
		expect(
			(
				raw.query("SELECT COUNT(*) AS n FROM submissions").get() as {
					n: number;
				}
			).n
		).toBe(1);
		raw.close();
	});
});

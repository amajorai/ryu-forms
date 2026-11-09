import { join } from "node:path";
import { resolvePluginDataDir } from "@ryu/sidecar-runtime";
import { FormsStore } from "../../src/store.ts";

const dataDirectory =
	process.env.RYU_DIR ?? process.env.RYU_FORMS_TEST_DATA_DIR;
const slug = process.argv[2];
if (!(dataDirectory && slug)) {
	throw new Error("Pass RYU_FORMS_TEST_DATA_DIR and a published form slug.");
}

// Open the database the sidecar uses: its plugin-data dir under the same RYU_DIR.
const store = new FormsStore(
	join(
		resolvePluginDataDir(
			{ ...process.env, RYU_DIR: dataDirectory },
			"@ryu/forms"
		),
		"forms.sqlite"
	)
);
try {
	const form = store.getBySlug(slug);
	if (!form?.published || form.fields.length === 0) {
		throw new Error(
			`Cannot seed responses for unpublished form ${slug} in ${dataDirectory}; published=${form?.published ?? "missing"}.`
		);
	}
	const epoch = Date.parse("2026-01-01T00:00:00.000Z");
	for (let index = 0; index < 101; index += 1) {
		const answers = Object.fromEntries(
			form.fields.map((field, fieldIndex) => [
				field.id,
				field.type === "email"
					? `respondent-${index + 1}@example.test`
					: fieldIndex === 0
						? `Respondent ${String(index + 1).padStart(3, "0")}`
						: `Local pagination answer ${index + 1}`,
			])
		);
		store.addSubmission(
			slug,
			{
				submissionId: `pagination-${String(index + 1).padStart(3, "0")}`,
				answers,
			},
			new Date(epoch + Math.floor(index / 25) * 60_000 + index * 1000)
		);
	}
} finally {
	store.close();
}

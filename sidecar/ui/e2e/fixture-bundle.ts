import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let bundle: string | undefined;
export function formsFixtureBundle(): string {
	if (bundle !== undefined) {
		return bundle;
	}
	const output = path.join(
		mkdtempSync(path.join(tmpdir(), "ryu-forms-codecs-")),
		"fixture.js"
	);
	execFileSync(
		"bun",
		[
			"build",
			path.resolve(import.meta.dirname, "fixture-schemas.ts"),
			"--target=browser",
			"--format=iife",
			`--outfile=${output}`,
		],
		{ stdio: "pipe" }
	);
	bundle = readFileSync(output, "utf8");
	return bundle;
}

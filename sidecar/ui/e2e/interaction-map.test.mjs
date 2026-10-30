import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";
import {
	namedAssertionIsPresent,
	reconcileLocalInteractionMap,
} from "../../../../../apps-store/companion-suite.mjs";

const e2eDirectory = import.meta.dirname;
const packageRoot = path.resolve(e2eDirectory, "..");
const mapPath = path.join(e2eDirectory, "companion-interactions.json");
const specPath = path.join(e2eDirectory, "forms-workflow.spec.ts");
const sourceFiles = [
	"src/App.tsx",
	"src/InsertBlockDialog.tsx",
	"src/QuestionEditor.tsx",
	"src/ResponsesPanel.tsx",
];
const eventAttributes = new Set([
	"onBlur",
	"onChange",
	"onCheckedChange",
	"onClick",
	"onDragStart",
	"onDrop",
	"onFocus",
	"onKeyDown",
	"onKeyUp",
	"onMouseEnter",
	"onMouseLeave",
	"onOpenChange",
	"onPointerDown",
	"onPointerUp",
	"onPress",
	"onSelect",
	"onSubmit",
	"onValueChange",
]);
const semanticTags = new Set([
	"a",
	"button",
	"details",
	"form",
	"input",
	"select",
	"summary",
	"textarea",
]);
const interactiveComponentName =
	/(?:Button|Link|Trigger|Switch|Checkbox|Radio|Select|Combobox|MenuItem|CommandItem|Tab|Picker|Toggle|Control)$/u;

function componentName(node) {
	for (let current = node.parent; current; current = current.parent) {
		if (ts.isFunctionDeclaration(current) && current.name) {
			return current.name.text;
		}
		if (
			ts.isVariableDeclaration(current) &&
			ts.isIdentifier(current.name) &&
			current.initializer &&
			(ts.isArrowFunction(current.initializer) ||
				ts.isFunctionExpression(current.initializer))
		) {
			return current.name.text;
		}
	}
	return "module";
}

function scanCurrentFormsRows() {
	const rows = [];
	for (const sourceFilePath of sourceFiles) {
		const sourcePath = path.resolve(packageRoot, sourceFilePath);
		const source = readFileSync(sourcePath, "utf8");
		const sourceFile = ts.createSourceFile(
			sourcePath,
			source,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TSX
		);
		const visit = (node) => {
			if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
				const sourceTag = node.tagName.getText(sourceFile);
				const tag = sourceTag.includes(".")
					? (sourceTag.split(".").at(-1) ?? sourceTag)
					: sourceTag;
				const events = node.attributes.properties
					.filter(
						(attribute) =>
							ts.isJsxAttribute(attribute) &&
							eventAttributes.has(attribute.name.getText())
					)
					.map((attribute) => attribute.name.getText());
				if (
					events.length > 0 ||
					semanticTags.has(tag.toLowerCase()) ||
					interactiveComponentName.test(tag)
				) {
					const position = sourceFile.getLineAndCharacterOfPosition(
						node.getStart(sourceFile)
					);
					rows.push({
						package: "forms",
						source_file: `apps-store/forms/sidecar/ui/${sourceFilePath}`,
						line: String(position.line + 1),
						component: componentName(node),
						tag,
						events: events.join(","),
					});
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(sourceFile);
	}
	return rows;
}

const censusRows = scanCurrentFormsRows();
const map = JSON.parse(readFileSync(mapPath, "utf8"));
const specSource = readFileSync(specPath, "utf8");

test("maps all 62 Forms census rows to named rendered browser assertions", () => {
	assert.equal(map.scope, "complete");
	assert.equal(censusRows.length, 62);
	assert.equal(map.expectedRows, 62);
	assert.equal(map.assertions.length, 62);
	const reconciled = reconcileLocalInteractionMap("forms", censusRows, map);
	assert.equal(reconciled.length, 62);

	const missing = reconciled
		.filter(
			({ assertion }) =>
				!namedAssertionIsPresent(
					specSource,
					assertion.testTitle,
					assertion.assertionMarker
				)
		)
		.map(
			({ assertion }) => `${assertion.testTitle}: ${assertion.assertionName}`
		);
	assert.deepEqual(
		missing,
		[],
		`Missing named browser assertions:\n${missing.join("\n")}`
	);
});

test("rejects stale, duplicate, and omitted Forms identities", () => {
	const first = map.assertions[0];
	assert.ok(first);
	assert.throws(
		() =>
			reconcileLocalInteractionMap("forms", censusRows, {
				...map,
				assertions: [first, { ...first }],
				expectedRows: 2,
				scope: "partial",
			}),
		/duplicates an interaction identity/
	);
	assert.throws(
		() =>
			reconcileLocalInteractionMap("forms", censusRows, {
				...map,
				assertions: map.assertions.slice(0, -1),
			}),
		/expected 62 rows but contains 61/
	);
	const stale = {
		...map,
		assertions: map.assertions.map((assertion, index) =>
			index === 0
				? { ...assertion, row: { ...assertion.row, line: "99999" } }
				: assertion
		),
	};
	assert.throws(
		() => reconcileLocalInteractionMap("forms", censusRows, stale),
		/does not match exactly one current central census row/
	);
});

test("keeps the complete map and exact browser selector package-local", () => {
	const packageManifest = JSON.parse(
		readFileSync(path.join(packageRoot, "package.json"), "utf8")
	);
	assert.equal(
		packageManifest.ryuCompanionInteractionMap,
		"e2e/companion-interactions.json"
	);
	assert.deepEqual(map.selector, {
		spec: "e2e/forms-workflow.spec.ts",
		config: "playwright.config.ts",
	});
});

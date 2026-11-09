import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import {
	formListItemSchema,
	formSubmissionPageSchema,
} from "../../src/contracts.ts";
import {
	createdFormResponse,
	formsRequestLog,
	installFormsHost,
} from "./forms-test-host.ts";

const evidenceDirectory = resolve(import.meta.dirname, "evidence");

test.beforeAll(async () => {
	await mkdir(evidenceDirectory, { recursive: true });
});

test.beforeEach(async ({ request }) => {
	const headers = { authorization: "Bearer forms-e2e-token" };
	const response = await request.get(
		"http://127.0.0.1:8422/api/forms/admin/forms",
		{ headers }
	);
	expect(
		response.ok(),
		"the isolated Forms service is ready for this test"
	).toBe(true);
	const forms = z.array(formListItemSchema).parse(await response.json());
	for (const form of forms) {
		const deleted = await request.delete(
			`http://127.0.0.1:8422/api/forms/admin/forms/${form.id}`,
			{ headers }
		);
		expect(deleted.ok(), `test cleanup deletes form ${form.id}`).toBe(true);
	}
});

test("builds a form, publishes it, collects a response, and exports CSV", async ({
	page,
	context,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await context.grantPermissions(["clipboard-read", "clipboard-write"], {
		origin: "http://127.0.0.1:8421",
	});
	await installFormsHost(page);

	await page.goto("http://127.0.0.1:8421/");
	await expect(page.getByTestId("forms-app")).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "No forms yet" })
	).toBeVisible();
	await page.getByRole("button", { name: "New form", exact: true }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Form name").fill("Northstar feedback");
	const slugInput = dialog.getByLabel("Form link");
	await expect(slugInput).toHaveValue(/^northstar-feedback-[a-f0-9]{6}$/);
	await slugInput.fill("northstar-feedback-e2e");
	await dialog.getByRole("combobox", { name: "Start with" }).click();
	await page.getByRole("option", { name: "Feedback form" }).click();
	await dialog.getByRole("button", { name: "Create form" }).click();
	await expect(dialog).toBeHidden();
	const createdForm = await createdFormResponse(page);
	const createCall = (await formsRequestLog(page)).find(
		(call) => call.method === "POST" && call.path === "/admin/forms"
	);
	expect(createCall?.body).toEqual({
		title: "Northstar feedback",
		slug: "northstar-feedback-e2e",
		template: "feedback",
	});

	await expect(page.getByLabel("Form title")).toHaveValue("Northstar feedback");
	await expect(page.getByLabel("Form title")).toHaveCSS("font-size", "36px");
	await expect(page.getByLabel("Question", { exact: true }).first()).toHaveCSS(
		"font-size",
		"20px"
	);
	await page
		.getByLabel("Question", { exact: true })
		.first()
		.fill("What should we improve?");
	const firstQuestion = page.getByRole("region", { name: "Question 1" });
	await firstQuestion.getByRole("button", { name: "Add option" }).click();
	await firstQuestion.getByRole("textbox", { name: "Option 4" }).fill("Other");
	await page
		.getByLabel("Description", { exact: true })
		.fill("Tell us what would make your day easier.");
	const insertLine = page.getByLabel("Insert a question", { exact: true });
	await insertLine.fill("Anything else?");
	await insertLine.press("Enter");
	await expect(page.getByLabel("Question", { exact: true }).nth(3)).toHaveValue(
		"Anything else?"
	);
	await expect(
		page.getByLabel("Question", { exact: true }).nth(3)
	).toBeFocused();
	await page.getByText("Confirmation screen", { exact: true }).click();
	await page
		.getByLabel("Title", { exact: true })
		.fill("Thanks for helping us improve");
	await page.locator("main").evaluate((main) => {
		main.scrollTop = 0;
	});
	await page.setViewportSize({ width: 1440, height: 2000 });
	await page.getByTestId("forms-page-canvas").screenshot({
		path: resolve(evidenceDirectory, "forms-editor-canvas.png"),
		animations: "disabled",
	});
	await page.screenshot({
		path: resolve(evidenceDirectory, "forms-builder.png"),
		fullPage: true,
		animations: "disabled",
	});
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByRole("status")).toContainText("Changes saved.");
	const saveCall = (await formsRequestLog(page)).find(
		(call) =>
			call.method === "PUT" && call.path === `/admin/forms/${createdForm.id}`
	);
	expect(saveCall?.body).toMatchObject({
		title: "Northstar feedback",
		description: "Tell us what would make your day easier.",
		fields: [
			{
				title: "What should we improve?",
				options: ["An idea", "A bug", "Something else", "Other"],
			},
			{ title: "Tell us more", type: "long_text" },
			{ title: "Email address", type: "email" },
			{ title: "Anything else?", type: "short_text" },
		],
	});
	await page.getByRole("button", { name: "Publish", exact: true }).click();
	await expect(page.getByRole("status")).toContainText("Form published.");
	expect(
		(await formsRequestLog(page)).some(
			(call) =>
				call.method === "POST" &&
				call.path === `/admin/forms/${createdForm.id}/publish`
		)
	).toBe(true);
	await page.getByRole("tab", { name: "Share" }).click();
	const shareInput = page.getByLabel("Public link");
	await expect(shareInput).toHaveValue(/http:\/\/127\.0\.0\.1:8421\/forms\//);
	const shareUrl = await shareInput.inputValue();
	await expect(page.getByRole("link", { name: "Open form" })).toHaveAttribute(
		"target",
		"_blank"
	);
	await page.getByRole("button", { name: "Copy link" }).click();
	await expect(page.getByRole("status")).toContainText("Form link copied.");
	await expect
		.poll(async () => page.evaluate(() => navigator.clipboard.readText()))
		.toBe(shareUrl);

	const visitorPromise = context.waitForEvent("page");
	await page.getByRole("link", { name: "Open form" }).click();
	const visitor = await visitorPromise;
	const visitorErrors: string[] = [];
	visitor.on("pageerror", (error) => visitorErrors.push(error.message));
	await expect(
		visitor.getByRole("heading", { name: "Northstar feedback" })
	).toBeVisible();
	await expect(visitor.getByLabel("What should we improve?")).toBeVisible();
	await visitor.screenshot({
		path: resolve(evidenceDirectory, "forms-respondent.png"),
		fullPage: true,
		animations: "disabled",
	});
	await visitor.getByRole("button", { name: "Submit" }).click();
	await expect(visitor.getByRole("alert")).toContainText(
		"Answer “What should we improve?” to continue."
	);
	await visitor
		.getByLabel("What should we improve?")
		.selectOption({ label: "Other" });
	await visitor
		.getByLabel("Tell us more")
		.fill("A calmer way to review incoming requests.");
	const emailInput = visitor.getByLabel("Email address");
	await emailInput.fill("not-an-email");
	await visitor.getByRole("button", { name: "Submit" }).click();
	await expect(emailInput).toHaveJSProperty("validity.valid", false);
	await emailInput.fill("sam@example.com");
	let failResponseOnce = true;
	let submissionPayload: unknown;
	await visitor.route(`${shareUrl}/submissions`, async (route) => {
		submissionPayload = route.request().postDataJSON();
		if (failResponseOnce) {
			failResponseOnce = false;
			await route.fulfill({
				status: 503,
				contentType: "application/json",
				body: JSON.stringify({
					error: { message: "Temporary local response failure." },
				}),
			});
			return;
		}
		await route.continue();
	});
	await visitor.getByRole("button", { name: "Submit" }).click();
	await expect(visitor.getByRole("alert")).toContainText(
		"Temporary local response failure."
	);
	await expect(visitor.getByLabel("Tell us more")).toHaveValue(
		"A calmer way to review incoming requests."
	);
	await visitor.getByRole("button", { name: "Submit" }).click();
	await expect(
		visitor.getByRole("heading", { name: "Thanks for helping us improve" })
	).toBeVisible();
	await visitor.screenshot({
		path: resolve(evidenceDirectory, "forms-respondent-success.png"),
		fullPage: true,
		animations: "disabled",
	});
	expect(submissionPayload).toMatchObject({
		submissionId: expect.stringMatching(/^[A-Za-z0-9_-]{8,80}$/),
		answers: {
			[createdForm.fields[0]?.id ?? ""]: "Other",
			[createdForm.fields[1]?.id ?? ""]:
				"A calmer way to review incoming requests.",
			[createdForm.fields[2]?.id ?? ""]: "sam@example.com",
		},
		website: "",
	});

	await page.getByRole("tab", { name: "Responses" }).click();
	await expect(
		page.getByRole("cell", { name: "sam@example.com" })
	).toBeVisible();
	await expect(page.getByRole("cell", { name: "Other" })).toBeVisible();
	await expect(page.getByText(/Responses: 1$/)).toBeVisible();
	await page.screenshot({
		path: resolve(evidenceDirectory, "forms-inbox.png"),
		fullPage: true,
		animations: "disabled",
	});
	const downloadPromise = page.waitForEvent("download");
	await page.getByRole("button", { name: "Export CSV" }).click();
	const download = await downloadPromise;
	const exportPath = await download.path();
	expect(exportPath).not.toBeNull();
	if (!exportPath) {
		throw new Error("CSV download did not provide a local file.");
	}
	const csv = await readFile(exportPath, "utf8");
	expect(csv).toContain("sam@example.com");
	expect(csv).toContain("What should we improve?");
	expect(csv).toContain("A calmer way to review incoming requests.");

	await page.getByRole("tab", { name: "Editor" }).click();
	await page.setViewportSize({ width: 390, height: 2600 });
	await page.locator("main").evaluate((main) => {
		main.scrollTop = 0;
	});
	await page.getByTestId("forms-page-canvas").screenshot({
		path: resolve(evidenceDirectory, "forms-mobile.png"),
		animations: "disabled",
	});
	await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
	await page.getByRole("button", { name: "Unpublish" }).click();
	await expect(page.getByRole("status")).toContainText("Form unpublished.");
	expect(
		(await formsRequestLog(page)).some(
			(call) =>
				call.method === "POST" &&
				call.path === `/admin/forms/${createdForm.id}/unpublish`
		)
	).toBe(true);
	const privateLinkResponse = await visitor.request.get(shareUrl);
	expect(privateLinkResponse.status()).toBe(404);
	await page.emulateMedia({ colorScheme: "dark" });
	await page.evaluate(() => document.documentElement.classList.add("dark"));
	await page.getByTestId("forms-page-canvas").screenshot({
		path: resolve(evidenceDirectory, "forms-dark.png"),
		animations: "disabled",
	});
	await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
	expect(errors).toEqual([]);
	expect(visitorErrors).toEqual([]);
});

test("starts from the empty-state action and inserts question blocks by click and keyboard", async ({
	page,
}) => {
	await installFormsHost(page);

	await page.goto("http://127.0.0.1:8421/");
	await page.getByRole("button", { name: "Create your first form" }).click();
	const createDialog = page.getByRole("dialog");
	await createDialog.getByLabel("Form name").fill("Blank document");
	await createDialog.getByRole("button", { name: "Create form" }).click();
	await expect(createDialog).toBeHidden();
	await expect(page.getByLabel("Form title")).toHaveValue("Blank document");
	await expect(page.getByLabel("Description", { exact: true })).toHaveAttribute(
		"placeholder",
		"Press Enter to start from scratch"
	);

	await page.setViewportSize({ width: 1440, height: 1200 });
	await page.getByTestId("forms-page-canvas").screenshot({
		path: resolve(evidenceDirectory, "forms-editor-empty.png"),
		animations: "disabled",
	});
	await page.getByRole("button", { name: "Add a question" }).click();
	let insertDialog = page.getByRole("dialog");
	await expect(
		insertDialog.getByRole("heading", { name: "Insert a question" })
	).toBeVisible();
	await insertDialog.getByLabel("Search question blocks").fill("no-such-block");
	await expect(
		insertDialog.getByText("No matching question blocks.")
	).toBeVisible();
	await insertDialog.press("Escape");
	await expect(insertDialog).toBeHidden();

	await page.getByLabel("Description", { exact: true }).press("/");
	insertDialog = page.getByRole("dialog");
	await expect(
		insertDialog.getByRole("heading", { name: "Insert a question" })
	).toBeVisible();
	await page.screenshot({
		path: resolve(evidenceDirectory, "forms-insert-menu.png"),
		animations: "disabled",
	});
	await insertDialog.getByLabel("Search question blocks").fill("short");
	const shortAnswerBlock = insertDialog.getByRole("button", {
		name: "Short answer",
	});
	await shortAnswerBlock.hover();
	await expect(shortAnswerBlock).toHaveAttribute("aria-pressed", "true");
	await shortAnswerBlock.click();
	await expect(insertDialog).toBeHidden();
	await expect(page.getByRole("region", { name: "Question 1" })).toBeVisible();
	await expect(page.getByLabel("Question", { exact: true })).toHaveValue(
		"Untitled question"
	);
	await expect(page.getByLabel("Question", { exact: true })).toBeFocused();

	// The in-workspace plus control opens the same selector; arrows and Enter insert its active result.
	const insertLine = page.getByLabel("Insert a question", { exact: true });
	await insertLine.hover();
	await page.getByRole("button", { name: "Open question blocks" }).click();
	insertDialog = page.getByRole("dialog");
	const search = insertDialog.getByLabel("Search question blocks");
	await search.fill("email");
	const emailBlock = insertDialog.getByRole("button", { name: "Email" });
	await search.press("ArrowDown");
	await expect(emailBlock).toHaveAttribute("aria-pressed", "true");
	await search.press("Enter");
	await expect(insertDialog).toBeHidden();
	const emailQuestion = page.getByRole("region", { name: "Question 2" });
	await expect(
		emailQuestion.getByRole("combobox", { name: "Answer type" })
	).toContainText("Email");

	// Plain question text is committed with Enter and appears as a new editor field.
	await insertLine.fill("Anything else?");
	await insertLine.press("Enter");
	await expect(page.getByLabel("Question", { exact: true }).nth(2)).toHaveValue(
		"Anything else?"
	);
});

test("question types, ordering, validation, and confirmation settings persist on save", async ({
	page,
}) => {
	await installFormsHost(page);
	await page.goto("http://127.0.0.1:8421/");
	await page.getByRole("button", { name: "New form", exact: true }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Form name").fill("Question type regression");
	await dialog.getByLabel("Form link").fill("question-types-e2e");
	await dialog.getByRole("combobox", { name: "Start with" }).click();
	await page.getByRole("option", { name: "Contact form" }).click();
	await dialog.getByRole("button", { name: "Create form" }).click();
	await expect(dialog).toBeHidden();
	const form = await createdFormResponse(page);
	await expect(
		page.getByRole("button", { name: "Save changes" })
	).toBeDisabled();

	const titleInput = page.getByLabel("Form title");
	await titleInput.fill("Question type regression: revised");
	await page
		.getByLabel("Description", { exact: true })
		.fill("Describe a contact preference and confirm the saved content.");
	const firstQuestion = page.getByRole("region", { name: "Question 1" });
	const answerType = firstQuestion.getByRole("combobox", {
		name: "Answer type",
	});
	await firstQuestion.hover();
	await expect(
		firstQuestion.getByLabel("Short answer", { exact: true })
	).toHaveAttribute("readonly", "");
	const chooseType = async (label: string) => {
		await answerType.click();
		await page.getByRole("option", { name: label, exact: true }).click();
		await expect(answerType).toContainText(label);
	};

	await chooseType("Long answer");
	const longPreview = firstQuestion.getByRole("textbox", {
		name: "Long answer",
	});
	await expect(longPreview).toHaveAttribute("readonly", "");
	await chooseType("Email");
	await expect(
		firstQuestion.getByLabel("Short answer", { exact: true })
	).toHaveAttribute("type", "email");
	await expect(
		firstQuestion.getByLabel("Short answer", { exact: true })
	).toHaveAttribute("readonly", "");
	await chooseType("Number");
	await expect(
		firstQuestion.getByLabel("Short answer", { exact: true })
	).toHaveAttribute("type", "number");
	await chooseType("Date");
	await expect(
		firstQuestion.getByLabel("Short answer", { exact: true })
	).toHaveAttribute("type", "date");
	await chooseType("Multiple choice");
	const required = firstQuestion.getByRole("checkbox", { name: "Required" });
	await expect(required).toBeChecked();
	await required.click();
	await expect(required).not.toBeChecked();
	await required.click();
	await expect(required).toBeChecked();
	await firstQuestion
		.getByLabel("Question", { exact: true })
		.fill("Contact method");
	await firstQuestion
		.getByLabel("Helper text")
		.fill("Choose every way you are comfortable being contacted.");
	await chooseType("Checkboxes");
	const previewCheckboxes = firstQuestion
		.getByRole("list", { name: "Answer options" })
		.locator('[data-slot="checkbox"]');
	await expect(previewCheckboxes).toHaveCount(2);
	await expect(previewCheckboxes.first()).toBeDisabled();
	await chooseType("Yes or no");
	await expect(firstQuestion.getByText("Yes", { exact: true })).toBeVisible();
	await expect(firstQuestion.getByText("No", { exact: true })).toBeVisible();
	await chooseType("Short answer");
	await expect(
		firstQuestion.getByLabel("Short answer", { exact: true })
	).toHaveAttribute("type", "text");
	await chooseType("Multiple choice");
	await firstQuestion.getByRole("button", { name: "Add option" }).click();
	await firstQuestion.getByRole("textbox", { name: "Option 3" }).fill("Other");
	await firstQuestion.getByRole("button", { name: "Remove option 1" }).click();
	await expect(
		firstQuestion.getByRole("textbox", { name: "Option 1" })
	).toHaveValue("Option 2");
	await expect(
		firstQuestion.getByRole("textbox", { name: "Option 2" })
	).toHaveValue("Other");
	await firstQuestion
		.getByRole("button", { name: "Move question down" })
		.click();
	const questionTitles = () =>
		page.locator("[data-question-title]").evaluateAll((nodes) =>
			nodes.map((node) => {
				if (!(node instanceof HTMLInputElement)) {
					throw new Error("Question title control must be a native input.");
				}
				return node.value;
			})
		);
	await expect
		.poll(questionTitles)
		.toEqual(["Email address", "Contact method", "How can we help?"]);
	await page
		.getByRole("region", { name: "Question 2" })
		.getByRole("button", { name: "Move question up" })
		.click();
	await expect
		.poll(questionTitles)
		.toEqual(["Contact method", "Email address", "How can we help?"]);
	await page
		.getByRole("region", { name: "Question 3" })
		.getByRole("button", { name: "Remove question" })
		.click();
	await expect(page.getByRole("region", { name: "Question 3" })).toHaveCount(0);
	await expect(
		page.getByRole("region", { name: "Question 2" }).getByRole("textbox", {
			name: "Short answer",
		})
	).toHaveAttribute("type", "email");

	const disclosure = page.locator("details");
	await expect(disclosure).not.toHaveAttribute("open", "");
	await disclosure.getByText("Confirmation screen", { exact: true }).click();
	await expect(disclosure).toHaveAttribute("open", "");
	await page.getByLabel("Title", { exact: true }).fill("We have your details");
	await page
		.getByLabel("Message", { exact: true })
		.fill("The selected contact preferences are saved.");
	await page
		.getByLabel("Submit button", { exact: true })
		.fill("Send preferences");
	await expect(
		page.getByRole("button", { name: "Save changes" })
	).toBeEnabled();
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByRole("status")).toContainText("Changes saved.");
	const saveCall = (await formsRequestLog(page)).find(
		(call) => call.method === "PUT" && call.path === `/admin/forms/${form.id}`
	);
	expect(saveCall?.body).toMatchObject({
		title: "Question type regression: revised",
		description: "Describe a contact preference and confirm the saved content.",
		fields: [
			{
				title: "Contact method",
				description: "Choose every way you are comfortable being contacted.",
				type: "single_choice",
				required: true,
				options: ["Option 2", "Other"],
			},
			{ title: "Email address", type: "email" },
		],
		confirmationTitle: "We have your details",
		confirmationBody: "The selected contact preferences are saved.",
		submitButtonText: "Send preferences",
	});

	await page.getByRole("button", { name: "All forms" }).click();
	await page
		.getByRole("button", { name: /Question type regression: revised/u })
		.click();
	await expect(page.getByLabel("Form title")).toHaveValue(
		"Question type regression: revised"
	);
	await expect(
		page.getByLabel("Question", { exact: true }).first()
	).toHaveValue("Contact method");
	await expect(
		page.getByRole("button", { name: "Save changes" })
	).toBeDisabled();
});

test("loads both response pages and deletes the form only after confirmation", async ({
	page,
	request,
}) => {
	await installFormsHost(page);
	await page.goto("http://127.0.0.1:8421/");
	await page.getByRole("button", { name: "New form", exact: true }).click();
	const createDialog = page.getByRole("dialog");
	await createDialog.getByLabel("Form name").fill("Pagination fixture");
	await createDialog.getByLabel("Form link").fill("pagination-fixture");
	await createDialog.getByRole("combobox", { name: "Start with" }).click();
	await page.getByRole("option", { name: "Contact form" }).click();
	await createDialog.getByRole("button", { name: "Create form" }).click();
	await expect(createDialog).toBeHidden();
	const form = await createdFormResponse(page);
	await page.getByRole("button", { name: "Publish", exact: true }).click();
	await expect(page.getByRole("status")).toContainText("Form published.");
	const publishedCall = (await formsRequestLog(page)).find(
		(call) =>
			call.method === "POST" && call.path === `/admin/forms/${form.id}/publish`
	);
	expect(publishedCall?.response).toMatchObject({ published: true });
	await page.getByRole("tab", { name: "Share" }).click();
	const shareUrl = await page.getByLabel("Public link").inputValue();
	await page.getByRole("tab", { name: "Editor" }).click();

	// Seed 101 local storage rows across valid rate-limit buckets; browser pagination still hits the real sidecar endpoint.
	const dataDirectory =
		process.env.RYU_DIR ?? process.env.RYU_FORMS_TEST_DATA_DIR;
	expect(dataDirectory).toBeTruthy();
	execFileSync("bun", ["run", "e2e/seed-responses.ts", form.slug], {
		cwd: resolve(import.meta.dirname, ".."),
		env: {
			...process.env,
			RYU_DIR: dataDirectory,
			RYU_FORMS_TEST_DATA_DIR: dataDirectory,
		},
		encoding: "utf8",
	});
	await page.getByRole("tab", { name: "Responses" }).click();
	await expect(
		page.getByText("100 responses loaded", { exact: true })
	).toBeVisible();
	await expect(
		page.getByRole("cell", { name: "Respondent 101" })
	).toBeVisible();
	await page.getByRole("button", { name: "Load older responses" }).click();
	await expect(
		page.getByText("101 responses loaded", { exact: true })
	).toBeVisible();
	await expect(
		page.getByRole("cell", { name: "Respondent 001" })
	).toBeVisible();
	const responseCalls = (await formsRequestLog(page)).filter(
		(call) =>
			call.method === "GET" &&
			call.path.startsWith(`/admin/forms/${form.id}/responses`)
	);
	expect(responseCalls).toHaveLength(2);
	const firstPage = formSubmissionPageSchema.parse(responseCalls[0]?.response);
	expect(firstPage.items).toHaveLength(100);
	expect(firstPage.nextCursor).toEqual(expect.any(String));
	expect(responseCalls[1]?.path).toBe(
		`/admin/forms/${form.id}/responses?cursor=${encodeURIComponent(firstPage.nextCursor ?? "")}`
	);

	await page.getByRole("button", { name: "All forms" }).click();
	const summaryFor = (label: string) =>
		page
			.getByRole("heading", { name: "Your forms" })
			.locator("..")
			.getByText(label, { exact: true })
			.locator("xpath=..");
	await expect(summaryFor("Forms")).toContainText("1");
	await expect(summaryFor("Published")).toContainText("1");
	await expect(summaryFor("Responses")).toContainText("101");
	await page.getByRole("button", { name: /Pagination fixture/u }).click();
	await page.getByRole("button", { name: "Delete form", exact: true }).click();
	const confirmation = page.getByRole("dialog");
	await expect(confirmation).toContainText(
		"permanently deletes the form and every response"
	);
	await confirmation.getByRole("button", { name: "Cancel" }).click();
	await expect(confirmation).toBeHidden();
	expect(
		(await formsRequestLog(page)).some(
			(call) =>
				call.method === "DELETE" && call.path === `/admin/forms/${form.id}`
		)
	).toBe(false);

	await page.getByRole("button", { name: "Delete form", exact: true }).click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Delete form", exact: true })
		.click();
	await expect(page.getByRole("status")).toContainText(
		"Form and its responses deleted."
	);
	await expect(
		page.getByRole("heading", { name: "No forms yet" })
	).toBeVisible();
	await expect(summaryFor("Forms")).toContainText("0");
	await expect(summaryFor("Published")).toContainText("0");
	await expect(summaryFor("Responses")).toContainText("0");
	const deleteCall = (await formsRequestLog(page)).find(
		(call) =>
			call.method === "DELETE" && call.path === `/admin/forms/${form.id}`
	);
	expect(deleteCall).toBeDefined();

	const headers = { authorization: "Bearer forms-e2e-token" };
	const missingDetail = await request.get(
		`http://127.0.0.1:8422/api/forms/admin/forms/${form.id}`,
		{ headers }
	);
	const missingResponses = await request.get(
		`http://127.0.0.1:8422/api/forms/admin/forms/${form.id}/responses`,
		{ headers }
	);
	const missingPublicForm = await request.get(shareUrl);
	expect(missingDetail.status()).toBe(404);
	expect(missingResponses.status()).toBe(404);
	expect(missingPublicForm.status()).toBe(404);
});

test("shows an unavailable service error instead of an empty forms list", async ({
	page,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(window, "ryu", {
			configurable: true,
			value: {
				app: {
					request: async () => {
						throw new Error("Ryu has not approved this app request.");
					},
				},
			},
		});
	});
	await page.goto("http://127.0.0.1:8421/");
	await expect(page.getByRole("alert")).toContainText("Ryu has not approved");
	await expect(
		page.getByRole("heading", { name: "Forms could not connect" })
	).toBeVisible();
	await expect(page.getByRole("heading", { name: "No forms yet" })).toHaveCount(
		0
	);
});

test("recovers through both Forms service retry actions", async ({ page }) => {
	await installFormsHost(page);
	let initialFailuresRemaining = 2;
	let failNextRetry = false;
	await page.route("**/api/forms/admin/forms", async (route) => {
		if (
			route.request().method() === "GET" &&
			(initialFailuresRemaining > 0 || failNextRetry)
		) {
			if (initialFailuresRemaining > 0) {
				initialFailuresRemaining -= 1;
			} else {
				failNextRetry = false;
			}
			await route.fulfill({
				status: 503,
				contentType: "application/json",
				body: JSON.stringify({
					error: { message: "Forms fixture temporarily unavailable." },
				}),
			});
			return;
		}
		await route.continue();
	});
	await page.goto("http://127.0.0.1:8421/");
	const alert = page.getByRole("alert");
	await expect(alert).toContainText("Forms fixture temporarily unavailable.");
	await expect(
		page.getByRole("heading", { name: "Forms could not connect" })
	).toBeVisible();
	const retryButtons = page.getByRole("button", { name: "Retry", exact: true });
	await expect(retryButtons).toHaveCount(2);
	const initialListCalls = (await formsRequestLog(page)).filter(
		(call) => call.method === "GET" && call.path === "/admin/forms"
	).length;
	initialFailuresRemaining = 0;

	// The empty-state retry remains actionable after its transient request fails.
	failNextRetry = true;
	await retryButtons.nth(1).click();
	await expect(alert).toContainText("Forms fixture temporarily unavailable.");
	await expect(
		page.getByRole("heading", { name: "Forms could not connect" })
	).toBeVisible();

	// The alert retry loads the service and replaces the unavailable state with the real empty list.
	await retryButtons.nth(0).click();
	await expect(
		page.getByRole("heading", { name: "No forms yet" })
	).toBeVisible();
	await expect(alert).toHaveCount(0);
	const listCalls = (await formsRequestLog(page)).filter(
		(call) => call.method === "GET" && call.path === "/admin/forms"
	);
	expect(listCalls).toHaveLength(initialListCalls + 2);
});

test("creates a validated template, reopens its saved row, and returns to the list", async ({
	page,
}) => {
	await installFormsHost(page);
	await page.goto("http://127.0.0.1:8421/");
	await expect(
		page.getByRole("heading", { name: "No forms yet" })
	).toBeVisible();

	// The empty-list action and Escape both update the controlled create dialog.
	await page.getByRole("button", { name: "Create your first form" }).click();
	let dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await dialog.press("Escape");
	await expect(dialog).toBeHidden();
	await page.getByRole("button", { name: "New form", exact: true }).click();
	dialog = page.getByRole("dialog");

	const nameInput = dialog.getByLabel("Form name");
	await nameInput.fill("Parity intake");
	const slugInput = dialog.getByLabel("Form link");
	await expect(slugInput).toHaveValue(/^parity-intake-[a-f0-9]{6}$/);
	await slugInput.fill("invalid slug");
	await dialog.getByRole("button", { name: "Create form" }).click();
	await expect(dialog.getByRole("alert")).toContainText(
		"Use 3–48 lowercase letters, numbers, or hyphens"
	);
	await expect(dialog).toBeVisible();
	await dialog.screenshot({
		path: resolve(evidenceDirectory, "forms-create-validation-error.png"),
		animations: "disabled",
	});
	const rejectedCreate = (await formsRequestLog(page)).find(
		(call) => call.method === "POST" && call.path === "/admin/forms"
	);
	expect(rejectedCreate?.status).toBe(400);
	expect(rejectedCreate?.response).toMatchObject({
		error: { code: "invalid_input" },
	});
	await slugInput.fill("parity-intake-v2");
	await nameInput.fill("Parity intake version two");
	await expect(slugInput).toHaveValue("parity-intake-v2");
	await dialog.getByRole("combobox", { name: "Start with" }).click();
	await page.getByRole("option", { name: "Feedback form" }).click();
	await expect(
		dialog.getByRole("combobox", { name: "Start with" })
	).toContainText("Feedback form");
	await dialog.getByRole("button", { name: "Create form" }).click();
	await expect(dialog).toBeHidden();
	const form = await createdFormResponse(page);
	expect(form.fields.map((field) => field.title)).toEqual([
		"What is this about?",
		"Tell us more",
		"Email address",
	]);
	const createCalls = (await formsRequestLog(page)).filter(
		(call) => call.method === "POST" && call.path === "/admin/forms"
	);
	expect(createCalls.map((call) => call.body)).toEqual([
		{
			title: "Parity intake",
			slug: "invalid slug",
			template: "blank",
		},
		{
			title: "Parity intake version two",
			slug: "parity-intake-v2",
			template: "feedback",
		},
	]);

	await page.getByRole("button", { name: "All forms" }).click();
	// These rendered summaries are readbacks of the persisted list data, not decorative placeholders.
	const summaryFor = (label: string) =>
		page
			.getByRole("heading", { name: "Your forms" })
			.locator("..")
			.getByText(label, { exact: true })
			.locator("xpath=..");
	await expect(summaryFor("Forms")).toContainText("1");
	await expect(summaryFor("Published")).toContainText("0");
	await expect(summaryFor("Responses")).toContainText("0");

	const listRow = page.getByRole("button", {
		name: /Parity intake version two.*parity-intake-v2/u,
	});
	await expect(listRow).toBeVisible();
	await listRow.click();
	await expect(page.getByLabel("Form title")).toHaveValue(
		"Parity intake version two"
	);
	expect(
		(await formsRequestLog(page)).some(
			(call) => call.method === "GET" && call.path === `/admin/forms/${form.id}`
		)
	).toBe(true);
	await page.getByRole("button", { name: "All forms" }).click();
	await expect(listRow).toBeVisible();
});

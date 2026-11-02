import { poweredByRyuHref } from "@ryu/sidecar-runtime/branding";
import type { FormDocument } from "./contracts.ts";
import {
	negotiateRespondentLocale,
	type RespondentLocale,
} from "./respondent-locale.ts";

const RESPONDENT_SCRIPT = String.raw`
const form = JSON.parse(document.getElementById("form-data").textContent || "{}");
const copy = JSON.parse(document.getElementById("page-copy").textContent || "{}");
const withTitle = (message, title) => message.split("{title}").join(title);
const formElement = document.getElementById("response-form");
const questions = document.getElementById("questions");
const submitButton = document.getElementById("submit-button");
const errorElement = document.getElementById("form-error");
const successElement = document.getElementById("form-success");
const controls = new Map();
document.title = withTitle(copy.pageTitle, form.title);
document.getElementById("form-title").textContent = form.title;
document.getElementById("form-description").textContent = form.description;
submitButton.textContent = form.submitButtonText;
for (const field of form.fields) {
  const section = document.createElement("section");
  section.className = "question";
  const label = document.createElement("label");
  label.className = "question-label";
  label.textContent = field.title + (field.required ? " *" : "");
  section.append(label);
  if (field.description) {
    const hint = document.createElement("p");
    hint.className = "question-hint";
    hint.textContent = field.description;
    section.append(hint);
  }
  const answerArea = document.createElement("div");
  answerArea.className = "answer-area";
  const addInput = (type, value, text) => {
    const row = document.createElement("label");
    row.className = "choice-row";
    const input = document.createElement("input");
    input.type = type;
    input.name = field.id;
    input.value = value;
    input.required = field.required && (type !== "checkbox" || field.type === "yes_no");
    const choiceText = document.createElement("span");
    choiceText.textContent = text;
    row.append(input, choiceText);
    answerArea.append(row);
  };
  if (field.type === "long_text") {
    const input = document.createElement("textarea");
    input.name = field.id;
    input.rows = 4;
    input.required = field.required;
    input.maxLength = 2000;
    input.setAttribute("aria-label", field.title);
    answerArea.append(input);
  } else if (field.type === "single_choice") {
    const select = document.createElement("select");
    select.name = field.id;
    select.required = field.required;
    select.setAttribute("aria-label", field.title);
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = copy.chooseOption;
    select.append(placeholder);
    for (const optionText of field.options) {
      const option = document.createElement("option");
      option.value = optionText;
      option.textContent = optionText;
      select.append(option);
    }
    answerArea.append(select);
  } else if (field.type === "multi_choice") {
    for (const optionText of field.options) addInput("checkbox", optionText, optionText);
  } else if (field.type === "yes_no") {
    addInput("radio", "yes", copy.yes);
    addInput("radio", "no", copy.no);
  } else {
    const input = document.createElement("input");
    input.name = field.id;
    input.required = field.required;
    input.maxLength = 2000;
    input.setAttribute("aria-label", field.title);
    if (field.type === "email") input.type = "email";
    else if (field.type === "number") input.type = "number";
    else if (field.type === "date") input.type = "date";
    else input.type = "text";
    answerArea.append(input);
  }
  section.append(answerArea);
  questions.append(section);
  controls.set(field.id, { field, section });
}
formElement.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorElement.textContent = "";
  const answers = {};
  for (const [id, record] of controls) {
    const { field, section } = record;
    const values = Array.from(section.querySelectorAll("input, textarea, select"));
    if (field.type === "multi_choice") {
      const selected = values.filter((control) => control.checked).map((control) => control.value);
      if (field.required && selected.length === 0) {
        errorElement.textContent = withTitle(copy.chooseAtLeastOne, field.title);
        section.querySelector("input")?.focus();
        return;
      }
      if (selected.length) answers[id] = selected;
    } else if (field.type === "yes_no") {
      const selected = values.find((control) => control.checked);
      if (field.required && !selected) {
        errorElement.textContent = withTitle(copy.chooseYesOrNo, field.title);
        section.querySelector("input")?.focus();
        return;
      }
      if (selected) answers[id] = selected.value;
    } else {
      const control = values[0];
      const value = control?.value ?? "";
      if (field.required && !value.trim()) {
        errorElement.textContent = withTitle(copy.answerToContinue, field.title);
        control?.focus();
        return;
      }
      if (control && !control.checkValidity()) {
        control.reportValidity();
        return;
      }
      if (value !== "") answers[id] = value;
    }
  }
  const payload = {
    submissionId: crypto.randomUUID(),
    answers,
    website: formElement.elements.namedItem("website")?.value ?? ""
  };
  submitButton.disabled = true;
  submitButton.textContent = copy.sending;
  try {
    const response = await fetch(location.pathname.replace(/\/$/, "") + "/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || copy.saveFailed);
    formElement.hidden = true;
    successElement.hidden = false;
    document.getElementById("success-title").textContent = form.confirmationTitle;
    document.getElementById("success-body").textContent = form.confirmationBody;
    successElement.focus();
  } catch (error) {
    errorElement.textContent = error instanceof Error ? error.message : copy.saveFailed;
    submitButton.disabled = false;
    submitButton.textContent = form.submitButtonText;
  }
});
`;

interface RenderRespondentPageResult {
	html: string;
	nonce: string;
}

interface RenderRespondentPageOptions {
	/** The visitor's `Accept-Language` header (negotiated per request). */
	acceptLanguage?: string | null;
	/** The page language; defaults to negotiating `acceptLanguage`. */
	locale?: RespondentLocale;
	poweredByRyu?: boolean;
}

/** JSON that is safe inside a `<script type="application/json">` element. */
function scriptJson(value: unknown): string {
	return JSON.stringify(value)
		.replaceAll("<", "\\u003c")
		.replaceAll(">", "\\u003e")
		.replaceAll("&", "\\u0026")
		.replaceAll("\u2028", "\\u2028")
		.replaceAll("\u2029", "\\u2029");
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

/** The page chrome the client script shows, in the visitor's language. */
function pageCopy(t: RespondentLocale) {
	return {
		answerToContinue: t.tl("Answer “{title}” to continue."),
		chooseAtLeastOne: t.tl("Choose at least one answer for “{title}”."),
		chooseOption: t.tl("Choose an option"),
		chooseYesOrNo: t.tl("Choose yes or no for “{title}”."),
		no: t.tl("No"),
		pageTitle: t.tl("{title} · Ryu Forms"),
		saveFailed: t.tl("Your response could not be saved."),
		sending: t.tl("Sending…"),
		yes: t.tl("Yes"),
	};
}

/**
 * New forms start with English defaults (see `store.ts`); a form that still
 * carries one shows it in the visitor's language, while author-written text
 * stays exactly as written.
 */
function localizedDefault(value: string, t: RespondentLocale): string {
	switch (value) {
		case "Submit":
			return t.tl("Submit");
		case "Thanks for your response":
			return t.tl("Thanks for your response");
		case "Your response has been saved.":
			return t.tl("Your response has been saved.");
		default:
			return value;
	}
}

/**
 * The footer link back to Ryu. Free plans always carry it; paid plans
 * (`RYU_BRANDING_REMOVABLE`) drop it.
 */
function attributionHtml(poweredByRyu: boolean, t: RespondentLocale): string {
	if (!poweredByRyu) {
		return "";
	}
	const href = poweredByRyuHref("forms").replaceAll("&", "&amp;");
	const text = escapeHtml(
		t.tl("Made with {product} · Create your own form free")
	).replace("{product}", "<strong>Ryu Forms</strong>");
	return `<p class="attribution"><a data-ryu-powered-by="forms" href="${href}" target="_blank" rel="noopener">${text}</a></p>`;
}

export function renderRespondentPage(
	form: FormDocument,
	{
		acceptLanguage = null,
		locale,
		poweredByRyu = true,
	}: RenderRespondentPageOptions = {}
): RenderRespondentPageResult {
	const t = locale ?? negotiateRespondentLocale(acceptLanguage);
	const nonce = crypto.randomUUID().replaceAll("-", "");
	const publicForm = {
		title: form.title,
		description: form.description,
		fields: form.fields,
		submitButtonText: localizedDefault(form.submitButtonText, t),
		confirmationTitle: localizedDefault(form.confirmationTitle, t),
		confirmationBody: localizedDefault(form.confirmationBody, t),
	};
	const serialized = scriptJson(publicForm);
	const html = `<!doctype html>
<html lang="${t.locale}" dir="${t.dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>Ryu Forms</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #20211f; background: #f4f4f1; font-synthesis: none; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; padding: 48px 20px; }
    main { width: min(100%, 680px); margin: 0 auto; }
    .form-card { background: #fff; border: 1px solid #e6e6e1; border-radius: 14px; padding: clamp(24px, 5vw, 44px); box-shadow: 0 2px 8px rgb(20 22 18 / 4%); }
    .form-title { margin: 0; font-family: Geist, Inter, ui-sans-serif, system-ui, sans-serif; font-size: clamp(28px, 5vw, 38px); font-weight: 620; letter-spacing: -.035em; line-height: 1.12; }
    .form-description { margin: 12px 0 30px; color: #60615c; line-height: 1.6; white-space: pre-wrap; }
    .question { margin: 24px 0; }
    .question-label { display: block; font-weight: 580; line-height: 1.4; }
    .question-hint { margin: 6px 0 10px; color: #74756e; font-size: 14px; line-height: 1.5; }
    .answer-area { display: grid; gap: 10px; margin-top: 10px; }
    input:not([type=checkbox]):not([type=radio]), textarea, select { width: 100%; min-height: 44px; border: 1px solid #d7d8d1; border-radius: 8px; padding: 10px 12px; background: #fff; color: #20211f; font: inherit; }
    textarea { resize: vertical; min-height: 108px; }
    input:focus-visible, textarea:focus-visible, select:focus-visible, button:focus-visible { outline: 3px solid #8db6a3; outline-offset: 2px; }
    .choice-row { display: flex; gap: 10px; align-items: center; min-height: 36px; color: #3e403b; }
    .choice-row input { width: 16px; height: 16px; accent-color: #345d4f; }
    .submit { width: 100%; margin-top: 12px; min-height: 46px; border: 0; border-radius: 8px; padding: 10px 18px; background: #233e34; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
    .submit:hover { background: #2d4d41; }
    .submit:disabled { cursor: wait; opacity: .72; }
    .form-error { min-height: 22px; margin: 10px 0 0; color: #a32623; font-size: 14px; }
    .success { outline: none; }
    .success h1 { margin: 0 0 10px; font-family: Geist, Inter, ui-sans-serif, system-ui, sans-serif; font-size: 28px; }
    .success p { margin: 0; color: #60615c; line-height: 1.6; white-space: pre-wrap; }
    .honeypot { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .attribution { margin-top: 16px; color: #8a8b84; text-align: center; font-size: 12px; }
    .attribution a { color: inherit; text-decoration: none; }
    .attribution a:hover { color: #233e34; text-decoration: underline; }
    @media (max-width: 540px) { body { padding: 18px 12px; } .form-card { border-radius: 10px; padding: 24px 20px; } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; } }
  </style>
</head>
<body>
  <main>
    <article class="form-card">
      <form id="response-form" novalidate>
        <h1 class="form-title" id="form-title"></h1>
        <p class="form-description" id="form-description"></p>
        <div id="questions"></div>
        <label class="honeypot" aria-hidden="true">${escapeHtml(t.tl("Leave this field empty"))}<input name="website" tabindex="-1" autocomplete="off"></label>
        <p class="form-error" id="form-error" role="alert"></p>
        <button class="submit" id="submit-button" type="submit">${escapeHtml(publicForm.submitButtonText)}</button>
      </form>
      <section class="success" id="form-success" role="status" tabindex="-1" hidden>
        <h1 id="success-title"></h1>
        <p id="success-body"></p>
      </section>
    </article>
    ${attributionHtml(poweredByRyu, t)}
  </main>
  <script id="form-data" type="application/json" nonce="${nonce}">${serialized}</script>
  <script id="page-copy" type="application/json" nonce="${nonce}">${scriptJson(pageCopy(t))}</script>
  <script nonce="${nonce}">${RESPONDENT_SCRIPT}</script>
</body>
</html>`;
	return { html, nonce };
}

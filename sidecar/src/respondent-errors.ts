/**
 * Submission errors the Forms server sends in English, in the visitor's
 * language. The respondent script prefers `codes[code]`, then `messages[text]`
 * (errors that share a generic code, such as a form that changed under the
 * visitor), and otherwise shows its own localized "could not be saved" line.
 */
import type { RespondentLocale } from "./respondent-locale.ts";

/** The respondent script's `copy.errors`: localized text by error code and by message. */
export interface RespondentErrorCopy {
	codes: Record<string, string>;
	messages: Record<string, string>;
}

export function respondentErrorCopy(t: RespondentLocale): RespondentErrorCopy {
	return {
		codes: {
			not_found: t.tl("This form is no longer available."),
			quota: t.tl("This form is no longer accepting responses."),
			rate_limited: t.tl("Too many responses. Try again in a minute."),
			too_large: t.tl("This response is too large."),
		},
		messages: {
			"This form changed. Reload it and try again.": t.tl(
				"This form changed. Reload it and try again."
			),
		},
	};
}

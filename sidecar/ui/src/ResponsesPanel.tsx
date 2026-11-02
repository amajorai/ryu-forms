import { RyuAppEmpty } from "@ryu/blocks/companion/app-ui";
import { Button } from "@ryu/blocks/companion/controls";
import { useLiteralMessages } from "@ryu/i18n/react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ryu/ui/components/table.tsx";
import { formatDateTime } from "@ryu/ui/lib/timezone.ts";
import type {
	FormDocument,
	FormSubmission,
	FormSubmissionPage,
} from "../../src/contracts.ts";

export function ResponsesPanel({
	form,
	loading,
	page,
	loadingMore,
	onLoadMore,
	onExport,
	busy,
}: {
	form: FormDocument;
	loading: boolean;
	page: FormSubmissionPage | null;
	loadingMore: boolean;
	busy: boolean;
	onLoadMore: () => void;
	onExport: () => void;
}) {
	const tl = useLiteralMessages();
	if (loading) {
		return <p role="status">{tl("Loading responses…")}</p>;
	}
	if (!page?.items.length) {
		return (
			<RyuAppEmpty
				description={tl(
					"Responses will appear here after someone submits the published form."
				)}
				title={tl("No responses yet")}
			/>
		);
	}
	return (
		<div className="grid gap-3">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-muted-foreground text-sm">
					{tl(
						"{count, plural, one {# response loaded} other {# responses loaded}}",
						{ count: page.items.length }
					)}
				</p>
				<Button disabled={busy} onClick={onExport} variant="outline">
					{tl("Export CSV")}
				</Button>
			</div>
			<Table aria-label={tl("Form responses")}>
				<TableHeader>
					<TableRow>
						<TableHead>{tl("Submitted")}</TableHead>
						{form.fields.map((field) => (
							<TableHead key={field.id}>{field.title}</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{page.items.map((response) => (
						<ResponseRow
							fields={form.fields}
							key={response.id}
							response={response}
						/>
					))}
				</TableBody>
			</Table>
			{page.nextCursor ? (
				<div className="flex justify-center">
					<Button disabled={loadingMore} onClick={onLoadMore} variant="outline">
						{loadingMore ? tl("Loading…") : tl("Load older responses")}
					</Button>
				</div>
			) : null}
		</div>
	);
}

function ResponseRow({
	fields,
	response,
}: {
	fields: FormDocument["fields"];
	response: FormSubmission;
}) {
	return (
		<TableRow>
			<TableCell presentation="monospace">
				{formatDateTime(response.submittedAt)}
			</TableCell>
			{fields.map((field) => (
				<TableCell
					className="max-w-72"
					key={field.id}
					overflow="truncate"
					title={answerText(response.answers[field.id])}
				>
					{answerText(response.answers[field.id]) || "—"}
				</TableCell>
			))}
		</TableRow>
	);
}

function answerText(value: string | string[] | undefined): string {
	return Array.isArray(value) ? value.join(", ") : (value ?? "");
}

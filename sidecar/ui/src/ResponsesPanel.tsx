import { RyuAppEmpty } from "@ryu/blocks/companion/app-ui";
import { Button } from "@ryu/blocks/companion/controls";
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
import type { Copy } from "./QuestionEditor.tsx";

export function ResponsesPanel({
	copy,
	form,
	loading,
	page,
	loadingMore,
	onLoadMore,
	onExport,
	busy,
}: {
	copy: Copy;
	form: FormDocument;
	loading: boolean;
	page: FormSubmissionPage | null;
	loadingMore: boolean;
	busy: boolean;
	onLoadMore: () => void;
	onExport: () => void;
}) {
	if (loading) {
		return (
			<p role="status">{copy("loadingResponses", "Loading responses…")}</p>
		);
	}
	if (!page?.items.length) {
		return (
			<RyuAppEmpty
				description={copy(
					"noResponsesDescription",
					"Responses will appear here after someone submits the published form."
				)}
				title={copy("noResponses", "No responses yet")}
			/>
		);
	}
	return (
		<div className="grid gap-3">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-muted-foreground text-sm">
					{page.items.length === 1
						? copy("oneResponseLoaded", "1 response loaded")
						: copy(
								"responsePageCount",
								`${page.items.length} responses loaded`
							)}
				</p>
				<Button disabled={busy} onClick={onExport} variant="outline">
					{copy("exportCsv", "Export CSV")}
				</Button>
			</div>
			<Table aria-label={copy("responsesTable", "Form responses")}>
				<TableHeader>
					<TableRow>
						<TableHead>{copy("submitted", "Submitted")}</TableHead>
						{form.fields.map((field) => (
							<TableHead key={field.id}>{field.title}</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{page.items.map((response) => (
						<ResponseRow
							copy={copy}
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
						{loadingMore
							? copy("loadingOlder", "Loading…")
							: copy("loadOlder", "Load older responses")}
					</Button>
				</div>
			) : null}
		</div>
	);
}

function ResponseRow({
	copy,
	fields,
	response,
}: {
	copy: Copy;
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
					{answerText(response.answers[field.id]) || copy("noAnswer", "—")}
				</TableCell>
			))}
		</TableRow>
	);
}

function answerText(value: string | string[] | undefined): string {
	return Array.isArray(value) ? value.join(", ") : (value ?? "");
}

import { Badge, Button } from "@ryu/blocks/companion/controls";
import { useLiteralMessages } from "@ryu/i18n/react";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@ryu/ui/components/tabs.tsx";
import { useState } from "react";
import type {
	FieldType,
	FormDocument,
	FormField,
	FormListItem,
	FormSubmissionPage,
} from "../../src/contracts.ts";
import { FormBuilderCanvas } from "./FormBuilderCanvas.tsx";
import { type Screen, type ShareLink, screenSchema } from "./form-model.ts";
import { InsertBlockDialog } from "./InsertBlockDialog.tsx";
import { ResponsesPanel } from "./ResponsesPanel.tsx";
import { SharePanel } from "./SharePanel.tsx";

export function FormWorkspace({
	busy,
	changed,
	form,
	items,
	loadingMore,
	loadingResponses,
	page,
	screen,
	share,
	shareLoading,
	onAddField,
	onChange,
	onCopyLink,
	onDelete,
	onExport,
	onLoadMore,
	onMoveField,
	onPublish,
	onRemoveField,
	onSave,
	onSelectScreen,
	onUnpublish,
	onUpdateField,
}: {
	busy: boolean;
	changed: boolean;
	form: FormDocument;
	items: FormListItem[];
	loadingMore: boolean;
	loadingResponses: boolean;
	page: FormSubmissionPage | null;
	screen: Screen;
	share: ShareLink | null;
	shareLoading: boolean;
	onAddField: (type: FieldType, title?: string) => string | undefined;
	onChange: (form: FormDocument) => void;
	onCopyLink: () => void;
	onDelete: () => void;
	onExport: () => void;
	onLoadMore: () => void;
	onMoveField: (index: number, direction: -1 | 1) => void;
	onPublish: () => void;
	onRemoveField: (index: number) => void;
	onSave: () => void;
	onSelectScreen: (screen: Screen) => void;
	onUnpublish: () => void;
	onUpdateField: (index: number, field: FormField) => void;
}) {
	const tl = useLiteralMessages();
	const [insertOpen, setInsertOpen] = useState(false);
	const [insertQuery, setInsertQuery] = useState("");
	const [insertDraft, setInsertDraft] = useState("");
	const [focusQuestionId, setFocusQuestionId] = useState<string | null>(null);
	const openInsertMenu = (query = "") => {
		setInsertQuery(query);
		setInsertDraft("");
		setInsertOpen(true);
	};
	const insertField = (type: FieldType) => {
		const fieldId = onAddField(type);
		setFocusQuestionId(fieldId ?? null);
		setInsertOpen(false);
		setInsertQuery("");
		setInsertDraft("");
	};
	const commitInsertDraft = () => {
		const title = insertDraft.trim();
		if (title) {
			const fieldId = onAddField("short_text", title);
			setFocusQuestionId(fieldId ?? null);
			setInsertDraft("");
			return;
		}
		openInsertMenu();
	};
	return (
		<div className="grid gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex min-w-0 flex-wrap items-center gap-2 text-muted-foreground text-sm">
					<Badge variant={form.published ? "secondary" : "outline"}>
						{form.published ? tl("Published") : tl("Draft")}
					</Badge>
					<span className="truncate">/forms/{form.slug}</span>
					<span aria-hidden="true">·</span>
					<span>
						{tl("Responses: {count}", {
							count:
								items.find((item) => item.id === form.id)?.responseCount ?? 0,
						})}
					</span>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						disabled={busy || !changed}
						onClick={onSave}
						variant="outline"
					>
						{tl("Save changes")}
					</Button>
					{form.published ? (
						<Button
							disabled={busy || changed}
							onClick={onUnpublish}
							variant="secondary"
						>
							{tl("Unpublish")}
						</Button>
					) : (
						<Button
							disabled={busy || form.fields.length === 0}
							onClick={onPublish}
						>
							{tl("Publish")}
						</Button>
					)}
					<Button disabled={busy} onClick={onDelete} variant="destructive">
						{tl("Delete form")}
					</Button>
				</div>
			</div>

			<Tabs
				onValueChange={(value) => onSelectScreen(screenSchema.parse(value))}
				value={screen}
			>
				<TabsList
					aria-label={tl("Form sections")}
					className="w-full justify-start overflow-x-auto"
					manageLayout={false}
					persistLayout={false}
				>
					<TabsTrigger value="builder">
						{tl("Editor")}
						{changed ? " ·" : ""}
					</TabsTrigger>
					<TabsTrigger value="responses">{tl("Responses")}</TabsTrigger>
					<TabsTrigger value="share">{tl("Share")}</TabsTrigger>
				</TabsList>
				<TabsContent className="mt-4" value="builder">
					<FormBuilderCanvas
						changed={changed}
						commitInsertDraft={commitInsertDraft}
						focusQuestionId={focusQuestionId}
						form={form}
						insertDraft={insertDraft}
						onFormChange={onChange}
						onInsertDraftChange={setInsertDraft}
						onMoveField={onMoveField}
						onOpenInsertMenu={openInsertMenu}
						onRemoveField={onRemoveField}
						onUpdateField={onUpdateField}
					/>
				</TabsContent>
				<TabsContent className="mt-4" value="responses">
					<ResponsesPanel
						busy={busy}
						form={form}
						loading={loadingResponses}
						loadingMore={loadingMore}
						onExport={onExport}
						onLoadMore={onLoadMore}
						page={page}
					/>
				</TabsContent>
				<TabsContent className="mt-4" value="share">
					<SharePanel
						form={form}
						loading={shareLoading}
						onCopy={onCopyLink}
						share={share}
					/>
				</TabsContent>
			</Tabs>
			<InsertBlockDialog
				onOpenChange={(open) => {
					setInsertOpen(open);
					if (!open) {
						setInsertQuery("");
					}
				}}
				onQueryChange={setInsertQuery}
				onSelect={insertField}
				open={insertOpen}
				query={insertQuery}
			/>
		</div>
	);
}

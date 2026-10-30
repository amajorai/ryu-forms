import {
	RyuAppEmpty,
	RyuAppMain,
	RyuAppSection,
	RyuAppToolbar,
} from "@ryu/blocks/companion/app-ui";
import {
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Textarea,
} from "@ryu/blocks/companion/controls";
import { useI18n } from "@ryu/i18n/react";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@ryu/ui/components/tabs.tsx";
import { formatDateTime } from "@ryu/ui/lib/timezone.ts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
	type FieldType,
	FORM_LIMITS,
	type FormDocument,
	type FormField,
	type FormListItem,
	type FormSubmissionPage,
	type FormTemplate,
	formExportResponseSchema,
	formTemplateSchema,
} from "../../src/contracts.ts";
import {
	buildFormCsv,
	formsApi,
	formsRequest,
	sharePathForForm,
} from "./api.ts";
import { InsertBlockDialog } from "./InsertBlockDialog.tsx";
import { type Copy, QuestionEditor } from "./QuestionEditor.tsx";
import { ResponsesPanel } from "./ResponsesPanel.tsx";

const screenSchema = z.enum(["builder", "responses", "share"]);
type Screen = z.output<typeof screenSchema>;

export function FormsApp() {
	const { formatNumber, t } = useI18n();
	const copy: Copy = useCallback(
		(key, fallback) => t(`forms.${key}`, {}, fallback),
		[t]
	);
	const [items, setItems] = useState<FormListItem[]>([]);
	const [current, setCurrent] = useState<FormDocument | null>(null);
	const [saved, setSaved] = useState<FormDocument | null>(null);
	const [screen, setScreen] = useState<Screen>("builder");
	const [loading, setLoading] = useState(true);
	const [hasLoaded, setHasLoaded] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [createOpen, setCreateOpen] = useState(false);
	const [createError, setCreateError] = useState("");
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [newTitle, setNewTitle] = useState("Untitled form");
	const [newSlug, setNewSlug] = useState("");
	const [newSlugTouched, setNewSlugTouched] = useState(false);
	const [slugSuffix, setSlugSuffix] = useState("");
	const [template, setTemplate] = useState<FormTemplate>("blank");
	const [responsePage, setResponsePage] = useState<FormSubmissionPage | null>(
		null
	);
	const [responsesLoading, setResponsesLoading] = useState(false);
	const [responsesMoreLoading, setResponsesMoreLoading] = useState(false);
	const [share, setShare] = useState<{
		path: string;
		url: string | null;
	} | null>(null);
	const [shareLoading, setShareLoading] = useState(false);

	const changed = useMemo(
		() =>
			Boolean(
				current &&
					saved &&
					JSON.stringify(editableContent(current)) !==
						JSON.stringify(editableContent(saved))
			),
		[current, saved]
	);
	const reload = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const result = await formsApi.list();
			setItems(result);
			setHasLoaded(true);
		} catch (cause) {
			setError(errorMessage(cause));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	useEffect(() => {
		const slug = current?.slug;
		if (!slug) {
			setShare(null);
			return;
		}
		let active = true;
		setShareLoading(true);
		void sharePathForForm(slug)
			.then((next) => {
				if (active) {
					setShare(next);
				}
			})
			.finally(() => {
				if (active) {
					setShareLoading(false);
				}
			});
		return () => {
			active = false;
		};
	}, [current?.slug]);

	useEffect(() => {
		if (screen !== "responses" || !current) {
			return;
		}
		let active = true;
		setResponsesLoading(true);
		setResponsePage(null);
		void Promise.all([formsApi.responses(current.id), formsApi.list()])
			.then(([page, nextItems]) => {
				if (active) {
					setResponsePage(page);
					setItems(nextItems);
				}
			})
			.catch((cause: unknown) => {
				if (active) {
					setError(errorMessage(cause));
				}
			})
			.finally(() => {
				if (active) {
					setResponsesLoading(false);
				}
			});
		return () => {
			active = false;
		};
	}, [screen, current?.id]);

	const updateCurrent = (update: (form: FormDocument) => FormDocument) => {
		setCurrent((form) => (form ? update(form) : form));
	};

	const runAction = async <T,>(
		work: () => Promise<T>
	): Promise<T | undefined> => {
		setBusy(true);
		setError("");
		setNotice("");
		try {
			return await work();
		} catch (cause) {
			setError(errorMessage(cause));
			return undefined;
		} finally {
			setBusy(false);
		}
	};

	const openForm = async (item: FormListItem) => {
		setBusy(true);
		setError("");
		setNotice("");
		try {
			const next = await formsApi.detail(item.id);
			setCurrent(next);
			setSaved(next);
			setScreen("builder");
			setResponsePage(null);
		} catch (cause) {
			setError(errorMessage(cause));
		} finally {
			setBusy(false);
		}
	};

	const saveCurrent = async (): Promise<FormDocument> => {
		if (!(current && saved)) {
			throw new Error("Open a form before saving.");
		}
		const next = await formsApi.save(current.id, {
			...editableContent(current),
			expectedRevision: saved.revision,
		});
		setCurrent(next);
		setSaved(next);
		if (next.published) {
			setNotice(
				copy(
					"savedPublished",
					"Changes saved. The published form now shows this version."
				)
			);
		} else {
			setNotice(copy("changesSaved", "Changes saved."));
		}
		await reloadItems();
		return next;
	};

	const reloadItems = async () => {
		const nextItems = await formsApi.list();
		setItems(nextItems);
	};

	const handleSave = () => runAction(saveCurrent);

	const handlePublish = () =>
		runAction(async () => {
			if (!current) {
				return;
			}
			let form = current;
			if (changed) {
				if (!saved) {
					throw new Error("Reload the form before publishing.");
				}
				form = await formsApi.save(current.id, {
					...editableContent(current),
					expectedRevision: saved.revision,
				});
				setCurrent(form);
				setSaved(form);
			}
			const published = await formsApi.setPublished(form.id, true);
			setCurrent(published);
			setSaved(published);
			setNotice(
				copy(
					"formPublished",
					"Form published. Anyone with its link can respond."
				)
			);
			await reloadItems();
		});

	const handleUnpublish = () =>
		runAction(async () => {
			if (!current) {
				return;
			}
			const next = await formsApi.setPublished(current.id, false);
			setCurrent(next);
			setSaved(next);
			setNotice(
				copy(
					"formUnpublished",
					"Form unpublished. Its public link no longer accepts responses."
				)
			);
			await reloadItems();
		});

	const openCreate = () => {
		const suffix = crypto.randomUUID().slice(0, 6);
		setCreateError("");
		setSlugSuffix(suffix);
		setNewTitle("Untitled form");
		setNewSlug(`untitled-form-${suffix}`);
		setNewSlugTouched(false);
		setTemplate("blank");
		setCreateOpen(true);
	};

	const createForm = async () => {
		setBusy(true);
		setError("");
		setNotice("");
		setCreateError("");
		try {
			const form = await formsApi.create({
				title: newTitle,
				slug: newSlug,
				template,
			});
			setItems((previous) => [toListItem(form), ...previous]);
			setCurrent(form);
			setSaved(form);
			setScreen("builder");
			setCreateOpen(false);
			setNotice("");
		} catch (cause) {
			const message = createErrorMessage(cause);
			setError(message);
			setCreateError(message);
		} finally {
			setBusy(false);
		}
	};

	const deleteCurrent = () =>
		runAction(async () => {
			if (!current) {
				return;
			}
			await formsApi.delete(current.id);
			setItems((previous) => previous.filter((form) => form.id !== current.id));
			setCurrent(null);
			setSaved(null);
			setDeleteOpen(false);
			setNotice(copy("formDeleted", "Form and its responses deleted."));
		});

	const moveField = (index: number, direction: -1 | 1) => {
		updateCurrent((form) => {
			const nextFields = [...form.fields];
			const [field] = nextFields.splice(index, 1);
			if (!field) {
				return form;
			}
			nextFields.splice(index + direction, 0, field);
			return { ...form, fields: nextFields };
		});
	};

	const loadMoreResponses = () =>
		runAction(async () => {
			if (!(current && responsePage?.nextCursor)) {
				return;
			}
			setResponsesMoreLoading(true);
			try {
				const next = await formsApi.responses(
					current.id,
					responsePage.nextCursor
				);
				setResponsePage((page) =>
					page
						? {
								items: [...page.items, ...next.items],
								nextCursor: next.nextCursor,
							}
						: next
				);
			} finally {
				setResponsesMoreLoading(false);
			}
		});

	const exportCsv = () =>
		runAction(async () => {
			if (!current) {
				return;
			}
			const exported = await formsRequest(
				formExportResponseSchema,
				`/admin/forms/${encodeURIComponent(current.id)}/export`
			);
			const csv = buildFormCsv(exported.form, exported.responses);
			const objectUrl = URL.createObjectURL(
				new Blob([csv], { type: "text/csv;charset=utf-8" })
			);
			const link = document.createElement("a");
			link.href = objectUrl;
			link.download = `${safeFilename(current.title)}-responses.csv`;
			link.click();
			URL.revokeObjectURL(objectUrl);
			setNotice(copy("csvDownloaded", "Responses exported."));
		});

	const copyShareLink = () =>
		runAction(async () => {
			if (!share) {
				throw new Error(
					copy("shareStillLoading", "The form link is still loading.")
				);
			}
			const value = share.url ?? share.path;
			if (!navigator.clipboard?.writeText) {
				setNotice(copy("copyManually", "Select the link below and copy it."));
				return;
			}
			await navigator.clipboard.writeText(value);
			setNotice(
				share.url
					? copy("linkCopied", "Form link copied.")
					: copy(
							"pathCopied",
							"Form path copied. Add your Ryu node address to share it."
						)
			);
		});

	const addField = (
		type: FieldType = "short_text",
		title?: string
	): string | undefined => {
		if (!current) {
			return undefined;
		}
		if (current.fields.length >= FORM_LIMITS.fields) {
			setError(
				copy(
					"questionLimit",
					`A form can have up to ${FORM_LIMITS.fields} questions.`
				)
			);
			return undefined;
		}
		const field: FormField = {
			id: crypto.randomUUID(),
			title:
				title?.trim().slice(0, FORM_LIMITS.fieldTitle) ||
				copy("untitledQuestion", "Untitled question"),
			description: "",
			type,
			required: false,
			options:
				type === "single_choice" || type === "multi_choice"
					? ["Option 1", "Option 2"]
					: [],
		};
		updateCurrent((form) => ({ ...form, fields: [...form.fields, field] }));
		return field.id;
	};

	const slugFromTitle = (value: string) => {
		const normalized = value
			.normalize("NFKD")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40)
			.replace(/-+$/g, "");
		return `${normalized || "form"}-${slugSuffix}`;
	};

	const formTitleChange = (value: string) => {
		setNewTitle(value);
		if (!newSlugTouched) {
			setNewSlug(slugFromTitle(value));
		}
	};

	const activeForm = current;
	return (
		<div className="flex h-full min-h-0 flex-col" data-testid="forms-app">
			<RyuAppToolbar
				actions={
					activeForm ? (
						<Button
							onClick={() => {
								setCurrent(null);
								setSaved(null);
								setScreen("builder");
							}}
							variant="ghost"
						>
							{copy("allForms", "All forms")}
						</Button>
					) : (
						<Button disabled={loading} onClick={openCreate}>
							{copy("newForm", "New form")}
						</Button>
					)
				}
				title={copy("title", "Forms")}
			/>
			<RyuAppMain className="min-h-0 flex-1 overflow-y-auto">
				{error ? (
					<div
						className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 p-3 text-sm"
						role="alert"
					>
						<span>{error}</span>
						<Button
							disabled={busy}
							onClick={() => void reload()}
							variant="outline"
						>
							{copy("retry", "Retry")}
						</Button>
					</div>
				) : null}
				{notice ? (
					<p className="text-sm text-status-success" role="status">
						{notice}
					</p>
				) : null}
				{loading ? (
					<p role="status">{copy("connecting", "Connecting to Forms…")}</p>
				) : activeForm ? (
					<FormWorkspace
						busy={busy}
						changed={changed}
						copy={copy}
						form={activeForm}
						items={items}
						loadingMore={responsesMoreLoading}
						loadingResponses={responsesLoading}
						onAddField={addField}
						onChange={(next) => setCurrent(next)}
						onCopyLink={() => void copyShareLink()}
						onDelete={() => setDeleteOpen(true)}
						onExport={() => void exportCsv()}
						onLoadMore={() => void loadMoreResponses()}
						onMoveField={moveField}
						onPublish={() => void handlePublish()}
						onRemoveField={(index) =>
							updateCurrent((form) => ({
								...form,
								fields: form.fields.filter(
									(_, itemIndex) => itemIndex !== index
								),
							}))
						}
						onSave={() => void handleSave()}
						onSelectScreen={(next) => {
							setScreen(next);
							setNotice("");
						}}
						onUnpublish={() => void handleUnpublish()}
						onUpdateField={(index, field) =>
							updateCurrent((form) => ({
								...form,
								fields: form.fields.map((item, itemIndex) =>
									itemIndex === index ? field : item
								),
							}))
						}
						page={responsePage}
						screen={screen}
						share={share}
						shareLoading={shareLoading}
					/>
				) : hasLoaded ? (
					<FormsList
						copy={copy}
						formatNumber={formatNumber}
						items={items}
						openCreate={openCreate}
						openForm={(form) => void openForm(form)}
					/>
				) : (
					<RyuAppEmpty
						actions={
							<Button onClick={() => void reload()}>
								{copy("retry", "Retry")}
							</Button>
						}
						description={copy(
							"serviceUnavailable",
							"The Forms service is unavailable. Retry when the Ryu node is ready."
						)}
						title={copy("formsUnavailable", "Forms could not connect")}
					/>
				)}
			</RyuAppMain>

			<CreateFormDialog
				busy={busy}
				copy={copy}
				error={createError}
				onCreate={() => void createForm()}
				onOpenChange={(open) => {
					setCreateOpen(open);
					if (!open) {
						setCreateError("");
					}
				}}
				onSlugChange={(value) => {
					setCreateError("");
					setNewSlug(value);
					setNewSlugTouched(true);
				}}
				onTemplateChange={(value) => {
					setCreateError("");
					setTemplate(value);
				}}
				onTitleChange={(value) => {
					setCreateError("");
					formTitleChange(value);
				}}
				open={createOpen}
				slug={newSlug}
				template={template}
				title={newTitle}
			/>
			<Dialog onOpenChange={setDeleteOpen} open={deleteOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{copy("deleteFormTitle", "Delete form?")}</DialogTitle>
						<DialogDescription>
							{copy(
								"deleteFormDescription",
								"This permanently deletes the form and every response stored with it on this Ryu node."
							)}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							disabled={busy}
							onClick={() => setDeleteOpen(false)}
							variant="outline"
						>
							{copy("cancel", "Cancel")}
						</Button>
						<Button
							disabled={busy}
							onClick={() => void deleteCurrent()}
							variant="destructive"
						>
							{copy("deleteForm", "Delete form")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function CreateFormDialog({
	copy: dialogCopy,
	error: createError,
	open,
	slug,
	template: selectedTemplate,
	title,
	busy: dialogBusy,
	onOpenChange,
	onSlugChange,
	onTemplateChange,
	onTitleChange,
	onCreate,
}: {
	copy: Copy;
	error: string;
	open: boolean;
	slug: string;
	template: FormTemplate;
	title: string;
	busy: boolean;
	onOpenChange: (open: boolean) => void;
	onSlugChange: (value: string) => void;
	onTemplateChange: (template: FormTemplate) => void;
	onTitleChange: (value: string) => void;
	onCreate: () => void;
}) {
	const selectedTemplateLabel =
		selectedTemplate === "contact"
			? dialogCopy("contactTemplate", "Contact form")
			: selectedTemplate === "feedback"
				? dialogCopy("feedbackTemplate", "Feedback form")
				: dialogCopy("blankTemplate", "Blank form");

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{dialogCopy("newForm", "New form")}</DialogTitle>
					<DialogDescription>
						{dialogCopy(
							"createDescription",
							"Start with a blank form or use a short template."
						)}
					</DialogDescription>
				</DialogHeader>
				{createError ? (
					<p className="text-destructive text-sm" role="alert">
						{createError}
					</p>
				) : null}
				<div className="grid gap-4">
					<div className="grid gap-1.5">
						<Label htmlFor="new-form-title">
							{dialogCopy("formName", "Form name")}
						</Label>
						<Input
							id="new-form-title"
							maxLength={160}
							onChange={(event) => onTitleChange(event.target.value)}
							value={title}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="new-form-slug">
							{dialogCopy("formLink", "Form link")}
						</Label>
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground text-sm">/forms/</span>
							<Input
								autoCapitalize="none"
								autoCorrect="off"
								id="new-form-slug"
								maxLength={48}
								onChange={(event) => onSlugChange(event.target.value)}
								value={slug}
							/>
						</div>
					</div>
					<div className="grid gap-1.5">
						<Label>{dialogCopy("startWith", "Start with")}</Label>
						<Select
							onValueChange={(value) =>
								value && onTemplateChange(formTemplateSchema.parse(value))
							}
							value={selectedTemplate}
						>
							<SelectTrigger aria-label={dialogCopy("startWith", "Start with")}>
								<SelectValue>{selectedTemplateLabel}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="blank">
									{dialogCopy("blankTemplate", "Blank form")}
								</SelectItem>
								<SelectItem value="contact">
									{dialogCopy("contactTemplate", "Contact form")}
								</SelectItem>
								<SelectItem value="feedback">
									{dialogCopy("feedbackTemplate", "Feedback form")}
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
				<DialogFooter>
					<Button
						disabled={dialogBusy || !title.trim() || !slug.trim()}
						onClick={onCreate}
					>
						{dialogCopy("createForm", "Create form")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function FormsList({
	copy,
	items,
	formatNumber,
	openForm,
	openCreate,
}: {
	copy: Copy;
	items: FormListItem[];
	formatNumber: (value: number) => string;
	openForm: (form: FormListItem) => void;
	openCreate: () => void;
}) {
	const totalResponses = items.reduce(
		(sum, form) => sum + form.responseCount,
		0
	);
	const published = items.filter((form) => form.published).length;
	return (
		<div className="grid gap-6">
			<RyuAppSection title={copy("yourForms", "Your forms")}>
				<div className="grid gap-3 sm:grid-cols-3">
					<Summary
						label={copy("formsCount", "Forms")}
						value={formatNumber(items.length)}
					/>
					<Summary
						label={copy("publishedCount", "Published")}
						value={formatNumber(published)}
					/>
					<Summary
						label={copy("responseCount", "Responses")}
						value={formatNumber(totalResponses)}
					/>
				</div>
			</RyuAppSection>
			<RyuAppSection title={copy("allForms", "All forms")}>
				{items.length ? (
					<div className="grid overflow-hidden rounded-lg border border-border">
						{items.map((form) => (
							<button
								className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-border border-b bg-background p-4 text-start last:border-b-0 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
								key={form.id}
								onClick={() => openForm(form)}
								type="button"
							>
								<span className="min-w-0 flex-1">
									<span className="block truncate font-medium">
										{form.title}
									</span>
									<span className="mt-1 block truncate text-muted-foreground text-xs">
										/forms/{form.slug} · {formatDateTime(form.updatedAt)}
									</span>
								</span>
								<span className="flex items-center gap-3">
									<Badge variant={form.published ? "secondary" : "outline"}>
										{form.published
											? copy("published", "Published")
											: copy("draft", "Draft")}
									</Badge>
									<span className="text-muted-foreground text-sm">
										{formatNumber(form.responseCount)}{" "}
										{copy("responses", "responses")}
									</span>
								</span>
							</button>
						))}
					</div>
				) : (
					<RyuAppEmpty
						actions={
							<Button onClick={openCreate}>
								{copy("createFirstForm", "Create your first form")}
							</Button>
						}
						description={copy(
							"emptyFormsDescription",
							"Create an intake, contact, or feedback form, then share its link."
						)}
						title={copy("emptyForms", "No forms yet")}
					/>
				)}
			</RyuAppSection>
		</div>
	);
}

function Summary({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border border-border bg-card p-4">
			<p className="font-medium font-mono text-2xl tabular-nums">{value}</p>
			<p className="mt-1 text-muted-foreground text-sm">{label}</p>
		</div>
	);
}

function FormWorkspace({
	busy,
	changed,
	copy,
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
	copy: Copy;
	form: FormDocument;
	items: FormListItem[];
	loadingMore: boolean;
	loadingResponses: boolean;
	page: FormSubmissionPage | null;
	screen: Screen;
	share: { path: string; url: string | null } | null;
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
						{form.published
							? copy("published", "Published")
							: copy("draft", "Draft")}
					</Badge>
					<span className="truncate">/forms/{form.slug}</span>
					<span aria-hidden="true">·</span>
					<span>
						{copy("responseCount", "Responses")}:{" "}
						{items.find((item) => item.id === form.id)?.responseCount ?? 0}
					</span>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						disabled={busy || !changed}
						onClick={onSave}
						variant="outline"
					>
						{copy("saveChanges", "Save changes")}
					</Button>
					{form.published ? (
						<Button
							disabled={busy || changed}
							onClick={onUnpublish}
							variant="secondary"
						>
							{copy("unpublish", "Unpublish")}
						</Button>
					) : (
						<Button
							disabled={busy || form.fields.length === 0}
							onClick={onPublish}
						>
							{copy("publish", "Publish")}
						</Button>
					)}
					<Button disabled={busy} onClick={onDelete} variant="destructive">
						{copy("deleteForm", "Delete form")}
					</Button>
				</div>
			</div>

			<Tabs
				onValueChange={(value) => onSelectScreen(screenSchema.parse(value))}
				value={screen}
			>
				<TabsList
					aria-label={copy("formSections", "Form sections")}
					className="w-full justify-start overflow-x-auto"
					manageLayout={false}
					persistLayout={false}
				>
					<TabsTrigger value="builder">
						{copy("editor", "Editor")}
						{changed ? " ·" : ""}
					</TabsTrigger>
					<TabsTrigger value="responses">
						{copy("responsesTab", "Responses")}
					</TabsTrigger>
					<TabsTrigger value="share">{copy("share", "Share")}</TabsTrigger>
				</TabsList>
				<TabsContent className="mt-4" value="builder">
					<div
						className="mx-auto w-full max-w-3xl px-2 pb-12 sm:px-6"
						data-testid="forms-page-canvas"
					>
						<header className="mb-4">
							<Label className="sr-only" htmlFor="form-title">
								{copy("formTitle", "Form title")}
							</Label>
							<Input
								className="h-auto border-0 bg-transparent px-0 py-1 font-heading font-medium text-3xl tracking-tight shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-1 sm:text-4xl"
								data-form-title=""
								id="form-title"
								maxLength={160}
								onChange={(event) =>
									onChange({ ...form, title: event.target.value })
								}
								size="lg"
								value={form.title}
							/>
							<Label className="sr-only" htmlFor="form-description">
								{copy("formDescription", "Description")}
							</Label>
							<Textarea
								className="mt-2 min-h-8 resize-none border-0 bg-transparent px-0 py-1 text-base leading-relaxed shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-1"
								data-form-description=""
								id="form-description"
								maxLength={1000}
								onChange={(event) =>
									onChange({ ...form, description: event.target.value })
								}
								onKeyDown={(event) => {
									if (
										(event.key === "/" || event.key === "Enter") &&
										!event.currentTarget.value.trim()
									) {
										event.preventDefault();
										openInsertMenu();
									}
								}}
								placeholder={
									form.fields.length === 0
										? copy(
												"pressEnterToStart",
												"Press Enter to start from scratch"
											)
										: copy("addFormDescription", "Add a description…")
								}
								rows={1}
								value={form.description}
							/>
						</header>
						<div className="grid gap-1">
							{form.fields.map((field, index) => (
								<QuestionEditor
									autoFocusTitle={field.id === focusQuestionId}
									copy={copy}
									count={form.fields.length}
									field={field}
									index={index}
									key={field.id}
									onChange={(next) => onUpdateField(index, next)}
									onMove={(direction) => onMoveField(index, direction)}
									onRemove={() => onRemoveField(index)}
								/>
							))}
						</div>
						{form.fields.length > 0 ? (
							<div className="group/insert mt-2 flex items-center gap-2">
								<Label className="sr-only" htmlFor="insert-question-block">
									{copy("insertQuestion", "Insert a question")}
								</Label>
								<Input
									aria-label={copy("insertQuestion", "Insert a question")}
									className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 py-2 text-muted-foreground shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-1"
									data-block-insert=""
									disabled={form.fields.length >= FORM_LIMITS.fields}
									id="insert-question-block"
									onChange={(event) => {
										const value = event.target.value;
										if (value.startsWith("/")) {
											openInsertMenu(value.slice(1));
											return;
										}
										setInsertDraft(value);
									}}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											event.preventDefault();
											commitInsertDraft();
										}
									}}
									placeholder={copy(
										"typeQuestionOrSlash",
										"Type a question or / to insert a block"
									)}
									value={insertDraft}
								/>
								<Button
									aria-label={copy(
										"openQuestionBlocks",
										"Open question blocks"
									)}
									className="size-10 shrink-0 p-0"
									disabled={form.fields.length >= FORM_LIMITS.fields}
									onClick={() => openInsertMenu()}
									size="icon"
									variant="ghost"
								>
									+
								</Button>
							</div>
						) : (
							<div className="mt-1">
								<Button
									className="-ms-2 w-fit justify-start text-muted-foreground"
									onClick={() => openInsertMenu()}
									variant="ghost"
								>
									<span
										aria-hidden="true"
										className="me-2 text-base leading-none"
									>
										+
									</span>
									{copy("addFirstQuestion", "Add a question")}
								</Button>
								<p className="ms-1 mt-1 text-muted-foreground text-xs">
									{copy(
										"slashToAddQuestion",
										"Type / to choose a question block"
									)}
								</p>
							</div>
						)}
						{changed ? (
							<p className="mt-3 text-muted-foreground text-xs">
								{copy("unsavedChanges", "Unsaved changes")}
							</p>
						) : null}
						{form.fields.length > 0 ? (
							<>
								<div className="mt-8 flex justify-center">
									<div className="w-full max-w-lg">
										<div
											aria-disabled="true"
											className="rounded-md bg-primary px-4 py-2.5 text-center font-medium text-primary-foreground text-sm opacity-90"
										>
											{form.submitButtonText}
										</div>
									</div>
								</div>
								<details className="mt-10 border-border/70 border-t pt-4">
									<summary className="cursor-pointer font-medium text-sm marker:text-muted-foreground">
										{copy("confirmationScreen", "Confirmation screen")}
									</summary>
									<div className="mt-4 grid gap-4">
										<div className="grid gap-1.5">
											<Label htmlFor="confirmation-title">
												{copy("confirmationTitle", "Title")}
											</Label>
											<Input
												id="confirmation-title"
												maxLength={160}
												onChange={(event) =>
													onChange({
														...form,
														confirmationTitle: event.target.value,
													})
												}
												value={form.confirmationTitle}
											/>
										</div>
										<div className="grid gap-1.5">
											<Label htmlFor="confirmation-body">
												{copy("confirmationBody", "Message")}
											</Label>
											<Textarea
												id="confirmation-body"
												maxLength={500}
												onChange={(event) =>
													onChange({
														...form,
														confirmationBody: event.target.value,
													})
												}
												rows={2}
												value={form.confirmationBody}
											/>
										</div>
										<div className="grid gap-1.5">
											<Label htmlFor="submit-button-text">
												{copy("submitButton", "Submit button")}
											</Label>
											<Input
												id="submit-button-text"
												maxLength={40}
												onChange={(event) =>
													onChange({
														...form,
														submitButtonText: event.target.value,
													})
												}
												value={form.submitButtonText}
											/>
										</div>
									</div>
								</details>
							</>
						) : null}
					</div>
				</TabsContent>
				<TabsContent className="mt-4" value="responses">
					<ResponsesPanel
						busy={busy}
						copy={copy}
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
						copy={copy}
						form={form}
						loading={shareLoading}
						onCopy={onCopyLink}
						share={share}
					/>
				</TabsContent>
			</Tabs>
			<InsertBlockDialog
				copy={copy}
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

function SharePanel({
	copy,
	form,
	loading,
	onCopy,
	share,
}: {
	copy: Copy;
	form: FormDocument;
	loading: boolean;
	onCopy: () => void;
	share: { path: string; url: string | null } | null;
}) {
	return (
		<div className="mx-auto grid w-full max-w-2xl gap-4 rounded-lg border border-border bg-card p-4 sm:p-6">
			<div>
				<h3 className="font-heading font-semibold text-lg">
					{copy("shareForm", "Share this form")}
				</h3>
				<p className="mt-1 text-muted-foreground text-sm">
					{form.published
						? copy(
								"sharePublishedDescription",
								"Anyone with the link can respond. Responses are stored on this Ryu node."
							)
						: copy(
								"shareDraftDescription",
								"Publish the form before sharing. Draft links are not available to respondents."
							)}
				</p>
			</div>
			{form.published ? (
				<div className="grid gap-2">
					<Label htmlFor="form-share-link">
						{copy("publicLink", "Public link")}
					</Label>
					<div className="flex flex-wrap gap-2">
						<Input
							id="form-share-link"
							readOnly
							value={
								loading
									? copy("loadingLink", "Loading link…")
									: (share?.url ?? share?.path ?? "")
							}
						/>
						<Button disabled={loading || !share} onClick={onCopy}>
							{copy("copyLink", "Copy link")}
						</Button>
					</div>
					{share?.url ? (
						<a
							className="w-fit text-primary text-sm underline underline-offset-4"
							href={share.url}
							rel="noopener"
							target="_blank"
						>
							{copy("openForm", "Open form")}
						</a>
					) : (
						<p className="text-muted-foreground text-sm">
							{copy(
								"noReachableOrigin",
								"No reachable web address is configured for this node. Copy the path and combine it with your Ryu node URL."
							)}
						</p>
					)}
				</div>
			) : (
				<div className="rounded-md bg-muted p-3 text-muted-foreground text-sm">
					{copy(
						"publishToShare",
						"Publish this form to create its public link."
					)}
				</div>
			)}
		</div>
	);
}

function editableContent(form: FormDocument) {
	return {
		title: form.title,
		description: form.description,
		fields: form.fields.map((field) => ({
			...field,
			options: field.options.map((option) => option.trim()).filter(Boolean),
		})),
		submitButtonText: form.submitButtonText,
		confirmationTitle: form.confirmationTitle,
		confirmationBody: form.confirmationBody,
	};
}

function toListItem(form: FormDocument): FormListItem {
	return {
		id: form.id,
		slug: form.slug,
		title: form.title,
		description: form.description,
		submitButtonText: form.submitButtonText,
		confirmationTitle: form.confirmationTitle,
		published: form.published,
		publishedAt: form.publishedAt,
		createdAt: form.createdAt,
		updatedAt: form.updatedAt,
		revision: form.revision,
		responseCount: 0,
	};
}

function errorMessage(cause: unknown): string {
	return cause instanceof Error ? cause.message : "The Forms operation failed.";
}

function createErrorMessage(cause: unknown): string {
	const message = errorMessage(cause);
	if (message.includes("must match pattern")) {
		return "Use 3–48 lowercase letters, numbers, or hyphens. Start and end with a letter or number.";
	}
	return message;
}

function safeFilename(value: string): string {
	return (
		value
			.normalize("NFKD")
			.replace(/[^a-zA-Z0-9_-]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 80) || "form"
	);
}

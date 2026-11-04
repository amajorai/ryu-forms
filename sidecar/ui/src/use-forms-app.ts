import { useLiteralMessages } from "@ryu/i18n/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	type FieldType,
	FORM_LIMITS,
	type FormDocument,
	type FormField,
	type FormListItem,
	type FormSubmissionPage,
	type FormTemplate,
	formExportResponseSchema,
} from "../../src/contracts.ts";
import { buildFormCsv, formsApi, formsRequest } from "./api.ts";
import {
	createErrorMessage,
	editableContent,
	errorMessage,
	type Screen,
	safeFilename,
	slugFromTitle,
	toListItem,
} from "./form-model.ts";
import { useShareLink } from "./use-share-link.ts";

/** The Forms Companion's state and actions; `FormsApp` only renders them. */
export function useFormsApp() {
	const tl = useLiteralMessages();
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
	const [newTitle, setNewTitle] = useState(() => tl("Untitled form"));
	const [newSlug, setNewSlug] = useState("");
	const [newSlugTouched, setNewSlugTouched] = useState(false);
	const [slugSuffix, setSlugSuffix] = useState("");
	const [template, setTemplate] = useState<FormTemplate>("blank");
	const [responsePage, setResponsePage] = useState<FormSubmissionPage | null>(
		null
	);
	const [responsesLoading, setResponsesLoading] = useState(false);
	const [responsesMoreLoading, setResponsesMoreLoading] = useState(false);
	const { share, shareLoading } = useShareLink(current?.slug);

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
			setError(errorMessage(cause, tl));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

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
					setError(errorMessage(cause, tl));
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

	const runAction = async <T>(
		work: () => Promise<T>
	): Promise<T | undefined> => {
		setBusy(true);
		setError("");
		setNotice("");
		try {
			return await work();
		} catch (cause) {
			setError(errorMessage(cause, tl));
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
			setError(errorMessage(cause, tl));
		} finally {
			setBusy(false);
		}
	};

	const saveCurrent = async (): Promise<FormDocument> => {
		if (!(current && saved)) {
			throw new Error(tl("Open a form before saving."));
		}
		const next = await formsApi.save(current.id, {
			...editableContent(current),
			expectedRevision: saved.revision,
		});
		setCurrent(next);
		setSaved(next);
		if (next.published) {
			setNotice(
				tl("Changes saved. The published form now shows this version.")
			);
		} else {
			setNotice(tl("Changes saved."));
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
					throw new Error(tl("Reload the form before publishing."));
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
			setNotice(tl("Form published. Anyone with its link can respond."));
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
				tl("Form unpublished. Its public link no longer accepts responses.")
			);
			await reloadItems();
		});

	const openCreate = () => {
		const suffix = crypto.randomUUID().slice(0, 6);
		setCreateError("");
		setSlugSuffix(suffix);
		setNewTitle(tl("Untitled form"));
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
			const message = createErrorMessage(cause, tl);
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
			setNotice(tl("Form and its responses deleted."));
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
			const csv = buildFormCsv(
				exported.form,
				exported.responses,
				tl("Submitted at")
			);
			const objectUrl = URL.createObjectURL(
				new Blob([csv], { type: "text/csv;charset=utf-8" })
			);
			const link = document.createElement("a");
			link.href = objectUrl;
			link.download = `${safeFilename(current.title)}-responses.csv`;
			link.click();
			URL.revokeObjectURL(objectUrl);
			setNotice(tl("Responses exported."));
		});

	const copyShareLink = () =>
		runAction(async () => {
			if (!share) {
				throw new Error(tl("The form link is still loading."));
			}
			const value = share.url ?? share.path;
			if (!navigator.clipboard?.writeText) {
				setNotice(tl("Select the link below and copy it."));
				return;
			}
			await navigator.clipboard.writeText(value);
			setNotice(
				share.url
					? tl("Form link copied.")
					: tl("Form path copied. Add your Ryu node address to share it.")
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
				tl("A form can have up to {count} questions.", {
					count: FORM_LIMITS.fields,
				})
			);
			return undefined;
		}
		const field: FormField = {
			id: crypto.randomUUID(),
			title:
				title?.trim().slice(0, FORM_LIMITS.fieldTitle) ||
				tl("Untitled question"),
			description: "",
			type,
			required: false,
			options:
				type === "single_choice" || type === "multi_choice"
					? [
							tl("Option {number}", { number: 1 }),
							tl("Option {number}", { number: 2 }),
						]
					: [],
		};
		updateCurrent((form) => ({ ...form, fields: [...form.fields, field] }));
		return field.id;
	};

	const formTitleChange = (value: string) => {
		setNewTitle(value);
		if (!newSlugTouched) {
			setNewSlug(slugFromTitle(value, slugSuffix));
		}
	};

	return {
		busy,
		changed,
		current,
		error,
		hasLoaded,
		items,
		loading,
		notice,
		responsePage,
		responsesLoading,
		responsesMoreLoading,
		screen,
		share,
		shareLoading,
		create: {
			error: createError,
			open: createOpen,
			slug: newSlug,
			template,
			title: newTitle,
			openDialog: openCreate,
			submit: () => void createForm(),
			onOpenChange: (open: boolean) => {
				setCreateOpen(open);
				if (!open) {
					setCreateError("");
				}
			},
			onSlugChange: (value: string) => {
				setCreateError("");
				setNewSlug(value);
				setNewSlugTouched(true);
			},
			onTemplateChange: (value: FormTemplate) => {
				setCreateError("");
				setTemplate(value);
			},
			onTitleChange: (value: string) => {
				setCreateError("");
				formTitleChange(value);
			},
		},
		deleteDialog: {
			open: deleteOpen,
			setOpen: setDeleteOpen,
			confirm: () => void deleteCurrent(),
		},
		addField,
		closeForm: () => {
			setCurrent(null);
			setSaved(null);
			setScreen("builder");
		},
		copyShareLink: () => void copyShareLink(),
		exportCsv: () => void exportCsv(),
		loadMoreResponses: () => void loadMoreResponses(),
		moveField,
		openForm: (form: FormListItem) => void openForm(form),
		publish: () => void handlePublish(),
		reload: () => void reload(),
		removeField: (index: number) =>
			updateCurrent((form) => ({
				...form,
				fields: form.fields.filter((_, itemIndex) => itemIndex !== index),
			})),
		save: () => void handleSave(),
		selectScreen: (next: Screen) => {
			setScreen(next);
			setNotice("");
		},
		setCurrent,
		unpublish: () => void handleUnpublish(),
		updateField: (index: number, field: FormField) =>
			updateCurrent((form) => ({
				...form,
				fields: form.fields.map((item, itemIndex) =>
					itemIndex === index ? field : item
				),
			})),
	};
}

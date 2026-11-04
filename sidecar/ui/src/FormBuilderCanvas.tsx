import { Button, Input, Label, Textarea } from "@ryu/blocks/companion/controls";
import { useLiteralMessages } from "@ryu/i18n/react";
import {
	FORM_LIMITS,
	type FormDocument,
	type FormField,
} from "../../src/contracts.ts";
import { QuestionEditor } from "./QuestionEditor.tsx";

/** The page-like builder: title, questions, the insert row and the confirmation screen. */
export function FormBuilderCanvas({
	changed,
	commitInsertDraft,
	focusQuestionId,
	form,
	insertDraft,
	onFormChange: onChange,
	onInsertDraftChange: setInsertDraft,
	onMoveField,
	onOpenInsertMenu: openInsertMenu,
	onRemoveField,
	onUpdateField,
}: {
	changed: boolean;
	commitInsertDraft: () => void;
	focusQuestionId: string | null;
	form: FormDocument;
	insertDraft: string;
	onFormChange: (form: FormDocument) => void;
	onInsertDraftChange: (value: string) => void;
	onMoveField: (index: number, direction: -1 | 1) => void;
	onOpenInsertMenu: (query?: string) => void;
	onRemoveField: (index: number) => void;
	onUpdateField: (index: number, field: FormField) => void;
}) {
	const tl = useLiteralMessages();
	return (
		<div
			className="mx-auto w-full max-w-3xl px-2 pb-12 sm:px-6"
			data-testid="forms-page-canvas"
		>
			<header className="mb-4">
				<Label className="sr-only" htmlFor="form-title">
					{tl("Form title")}
				</Label>
				<Input
					className="h-auto border-0 bg-transparent px-0 py-1 font-heading font-medium text-3xl tracking-tight shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-1 sm:text-4xl"
					data-form-title=""
					id="form-title"
					maxLength={160}
					onChange={(event) => onChange({ ...form, title: event.target.value })}
					size="lg"
					value={form.title}
				/>
				<Label className="sr-only" htmlFor="form-description">
					{tl("Description")}
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
							? tl("Press Enter to start from scratch")
							: tl("Add a description…")
					}
					rows={1}
					value={form.description}
				/>
			</header>
			<div className="grid gap-1">
				{form.fields.map((field, index) => (
					<QuestionEditor
						autoFocusTitle={field.id === focusQuestionId}
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
						{tl("Insert a question")}
					</Label>
					<Input
						aria-label={tl("Insert a question")}
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
						placeholder={tl("Type a question or / to insert a block")}
						value={insertDraft}
					/>
					<Button
						aria-label={tl("Open question blocks")}
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
						<span aria-hidden="true" className="me-2 text-base leading-none">
							+
						</span>
						{tl("Add a question")}
					</Button>
					<p className="ms-1 mt-1 text-muted-foreground text-xs">
						{tl("Type / to choose a question block")}
					</p>
				</div>
			)}
			{changed ? (
				<p className="mt-3 text-muted-foreground text-xs">
					{tl("Unsaved changes")}
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
							{tl("Confirmation screen")}
						</summary>
						<div className="mt-4 grid gap-4">
							<div className="grid gap-1.5">
								<Label htmlFor="confirmation-title">{tl("Title")}</Label>
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
								<Label htmlFor="confirmation-body">{tl("Message")}</Label>
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
									{tl("Submit button")}
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
	);
}

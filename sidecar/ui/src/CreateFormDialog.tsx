import {
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
} from "@ryu/blocks/companion/controls";
import { useLiteralMessages } from "@ryu/i18n/react";
import { type FormTemplate, formTemplateSchema } from "../../src/contracts.ts";

export function CreateFormDialog({
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
	const tl = useLiteralMessages();
	const selectedTemplateLabel =
		selectedTemplate === "contact"
			? tl("Contact form")
			: selectedTemplate === "feedback"
				? tl("Feedback form")
				: tl("Blank form");

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{tl("New form")}</DialogTitle>
					<DialogDescription>
						{tl("Start with a blank form or use a short template.")}
					</DialogDescription>
				</DialogHeader>
				{createError ? (
					<p className="text-destructive text-sm" role="alert">
						{createError}
					</p>
				) : null}
				<div className="grid gap-4">
					<div className="grid gap-1.5">
						<Label htmlFor="new-form-title">{tl("Form name")}</Label>
						<Input
							id="new-form-title"
							maxLength={160}
							onChange={(event) => onTitleChange(event.target.value)}
							value={title}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="new-form-slug">{tl("Form link")}</Label>
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
						<Label>{tl("Start with")}</Label>
						<Select
							onValueChange={(value) =>
								value && onTemplateChange(formTemplateSchema.parse(value))
							}
							value={selectedTemplate}
						>
							<SelectTrigger aria-label={tl("Start with")}>
								<SelectValue>{selectedTemplateLabel}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="blank">{tl("Blank form")}</SelectItem>
								<SelectItem value="contact">{tl("Contact form")}</SelectItem>
								<SelectItem value="feedback">{tl("Feedback form")}</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
				<DialogFooter>
					<Button
						disabled={dialogBusy || !title.trim() || !slug.trim()}
						onClick={onCreate}
					>
						{tl("Create form")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

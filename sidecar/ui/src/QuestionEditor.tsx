import { RyuAppActions } from "@ryu/blocks/companion/app-ui";
import {
	Badge,
	Button,
	Checkbox,
	Input,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Textarea,
} from "@ryu/blocks/companion/controls";
import { type LiteralMessage, useLiteralMessages } from "@ryu/i18n/react";
import { useEffect, useRef } from "react";
import {
	type FieldType,
	FORM_LIMITS,
	type FormField,
	fieldTypeSchema,
} from "../../src/contracts.ts";

export const FIELD_TYPES: readonly FieldType[] = [
	"short_text",
	"long_text",
	"email",
	"number",
	"date",
	"single_choice",
	"multi_choice",
	"yes_no",
];

/** The answer-type name, as one whole literal per type so each translates. */
export function fieldTypeLabel(tl: LiteralMessage, type: FieldType): string {
	switch (type) {
		case "short_text":
			return tl("Short answer");
		case "long_text":
			return tl("Long answer");
		case "email":
			return tl("Email");
		case "number":
			return tl("Number");
		case "date":
			return tl("Date");
		case "single_choice":
			return tl("Multiple choice");
		case "multi_choice":
			return tl("Checkboxes");
		case "yes_no":
			return tl("Yes or no");
		default:
			return type;
	}
}

export function QuestionEditor({
	autoFocusTitle = false,
	field,
	index,
	count,
	onChange,
	onMove,
	onRemove,
}: {
	autoFocusTitle?: boolean;
	field: FormField;
	index: number;
	count: number;
	onChange: (field: FormField) => void;
	onMove: (direction: -1 | 1) => void;
	onRemove: () => void;
}) {
	const tl = useLiteralMessages();
	const titleRef = useRef<HTMLInputElement>(null);
	const isChoice =
		field.type === "single_choice" || field.type === "multi_choice";
	useEffect(() => {
		if (autoFocusTitle) {
			titleRef.current?.focus();
		}
	}, [autoFocusTitle]);
	const changeType = (type: FieldType) => {
		const choice = type === "single_choice" || type === "multi_choice";
		onChange({
			...field,
			type,
			options: choice
				? field.options.length >= 2
					? field.options
					: [
							tl("Option {number}", { number: 1 }),
							tl("Option {number}", { number: 2 }),
						]
				: [],
		});
	};
	const updateOption = (optionIndex: number, value: string) => {
		onChange({
			...field,
			options: field.options.map((option, currentIndex) =>
				currentIndex === optionIndex ? value : option
			),
		});
	};
	const addOption = () => {
		if (!isChoice || field.options.length >= FORM_LIMITS.options) {
			return;
		}
		onChange({ ...field, options: [...field.options, ""] });
	};
	const removeOption = (optionIndex: number) => {
		if (field.options.length <= 2) {
			return;
		}
		onChange({
			...field,
			options: field.options.filter(
				(_, currentIndex) => currentIndex !== optionIndex
			),
		});
	};
	const questionLabel = tl("Question {number}", { number: index + 1 });

	return (
		<section
			aria-label={questionLabel}
			className="group/question relative rounded-lg px-3 py-4 transition-colors focus-within:bg-muted/10 hover:bg-muted/20 sm:py-5"
		>
			<div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 md:pointer-events-none md:absolute md:end-2 md:top-1 md:z-10 md:mb-0 md:translate-y-1 md:opacity-0 md:transition-opacity md:group-hover/question:pointer-events-auto md:group-hover/question:opacity-100 md:group-focus-within/question:pointer-events-auto md:group-focus-within/question:opacity-100">
				<p className="px-1 font-mono text-muted-foreground text-xs">
					{questionLabel}
				</p>
				<RyuAppActions className="flex-wrap gap-1.5 md:rounded-lg md:border md:border-border/70 md:bg-background/95 md:p-1 md:shadow-sm">
					<Select
						onValueChange={(value) =>
							value && changeType(fieldTypeSchema.parse(value))
						}
						value={field.type}
					>
						<SelectTrigger
							aria-label={tl("Answer type")}
							className="h-8 min-w-36 border-transparent bg-muted/50 text-xs shadow-none hover:bg-muted"
						>
							<SelectValue>{fieldTypeLabel(tl, field.type)}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{FIELD_TYPES.map((item) => (
								<SelectItem key={item} value={item}>
									{fieldTypeLabel(tl, item)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Label className="flex h-8 items-center gap-2 rounded-md px-2 text-muted-foreground text-xs">
						<Checkbox
							aria-label={tl("Required")}
							checked={field.required}
							onCheckedChange={(checked) =>
								onChange({ ...field, required: checked === true })
							}
						/>
						{tl("Required")}
					</Label>
					<RyuAppActions className="shrink-0 flex-nowrap gap-1">
						<Button
							aria-label={tl("Move question up")}
							className="size-8 p-0 text-muted-foreground"
							disabled={index === 0}
							onClick={() => onMove(-1)}
							size="sm"
							variant="ghost"
						>
							↑
						</Button>
						<Button
							aria-label={tl("Move question down")}
							className="size-8 p-0 text-muted-foreground"
							disabled={index === count - 1}
							onClick={() => onMove(1)}
							size="sm"
							variant="ghost"
						>
							↓
						</Button>
						<Button
							aria-label={tl("Remove question")}
							className="h-8 px-2 text-muted-foreground"
							onClick={onRemove}
							size="sm"
							variant="ghost"
						>
							{tl("Remove")}
						</Button>
					</RyuAppActions>
				</RyuAppActions>
			</div>

			<div className="grid gap-1 md:pt-8">
				<Label className="sr-only" htmlFor={`question-title-${field.id}`}>
					{tl("Question")}
				</Label>
				<Input
					className="h-auto border-0 bg-transparent px-0 py-1 font-heading font-medium text-lg shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-1 sm:text-xl"
					data-question-title=""
					id={`question-title-${field.id}`}
					maxLength={FORM_LIMITS.fieldTitle}
					onChange={(event) =>
						onChange({ ...field, title: event.target.value })
					}
					placeholder={tl("Untitled question")}
					ref={titleRef}
					size="lg"
					value={field.title}
				/>
				<Label className="sr-only" htmlFor={`question-description-${field.id}`}>
					{tl("Helper text")}
				</Label>
				<Textarea
					className="min-h-0 resize-none border-0 bg-transparent px-0 py-1 text-base text-muted-foreground leading-relaxed placeholder:text-muted-foreground/65 focus-visible:ring-1"
					data-question-description=""
					id={`question-description-${field.id}`}
					maxLength={FORM_LIMITS.fieldDescription}
					onChange={(event) =>
						onChange({ ...field, description: event.target.value })
					}
					placeholder={tl("Add helper text…")}
					rows={1}
					value={field.description}
				/>
			</div>

			<div className="mt-2 grid gap-1">
				{field.type === "long_text" ? (
					<Textarea
						aria-label={tl("Long answer")}
						className="min-h-20"
						placeholder={tl("Long answer")}
						readOnly
					/>
				) : field.type === "single_choice" || field.type === "multi_choice" ? (
					<div
						aria-label={tl("Answer options")}
						className="grid gap-0.5"
						role="list"
					>
						{field.options.map((option, optionIndex) => (
							<div
								className="group/option flex min-w-0 items-center gap-2"
								key={`${field.id}-option-${optionIndex}`}
								role="listitem"
							>
								{field.type === "multi_choice" ? (
									<Checkbox
										aria-hidden="true"
										className="pointer-events-none disabled:opacity-100"
										disabled
									/>
								) : (
									<span
										aria-hidden="true"
										className="size-4 shrink-0 rounded-full border border-input"
									/>
								)}
								<Label
									className="sr-only"
									htmlFor={`question-option-${field.id}-${optionIndex}`}
								>
									{tl("Option {number}", { number: optionIndex + 1 })}
								</Label>
								<Input
									aria-label={tl("Option {number}", {
										number: optionIndex + 1,
									})}
									className="h-9 min-w-0 border-0 bg-transparent px-1 shadow-none focus-visible:ring-1"
									data-question-option=""
									id={`question-option-${field.id}-${optionIndex}`}
									maxLength={FORM_LIMITS.optionLength}
									onChange={(event) =>
										updateOption(optionIndex, event.target.value)
									}
									placeholder={tl("Option")}
									value={option}
								/>
								{field.options.length > 2 ? (
									<Button
										aria-label={tl("Remove option {number}", {
											number: optionIndex + 1,
										})}
										className="size-8 shrink-0 p-0 text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover/option:opacity-100"
										onClick={() => removeOption(optionIndex)}
										size="sm"
										variant="ghost"
									>
										×
									</Button>
								) : null}
							</div>
						))}
						{field.options.length < FORM_LIMITS.options ? (
							<Button
								className="w-fit justify-start text-muted-foreground"
								onClick={addOption}
								size="sm"
								variant="ghost"
							>
								<span
									aria-hidden="true"
									className="me-1 text-base leading-none"
								>
									+
								</span>
								{tl("Add option")}
							</Button>
						) : null}
					</div>
				) : field.type === "yes_no" ? (
					<div className="flex flex-wrap gap-2">
						<Badge variant="outline">{tl("Yes")}</Badge>
						<Badge variant="outline">{tl("No")}</Badge>
					</div>
				) : (
					<Input
						aria-label={tl("Short answer")}
						className="disabled:opacity-100"
						placeholder={
							field.type === "email"
								? "name@example.com"
								: field.type === "number"
									? tl("Number")
									: field.type === "date"
										? tl("Pick a date")
										: tl("Short answer")
						}
						readOnly
						type={
							field.type === "email" ||
							field.type === "number" ||
							field.type === "date"
								? field.type
								: "text"
						}
					/>
				)}
			</div>
		</section>
	);
}

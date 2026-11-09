import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Input,
} from "@ryu/blocks/companion/controls";
import { useLiteralMessages } from "@ryu/i18n/react";
import { useState } from "react";
import type { FieldType } from "../../src/contracts.ts";
import { FIELD_TYPES, fieldTypeLabel } from "./QuestionEditor.tsx";

export function InsertBlockDialog({
	open,
	query,
	onOpenChange,
	onQueryChange,
	onSelect,
}: {
	open: boolean;
	query: string;
	onOpenChange: (open: boolean) => void;
	onQueryChange: (query: string) => void;
	onSelect: (type: FieldType) => void;
}) {
	const [activeType, setActiveType] = useState<FieldType | null>(null);
	const tl = useLiteralMessages();
	const fieldTypes = FIELD_TYPES.map((id) => ({
		id,
		label: fieldTypeLabel(tl, id),
	}));
	const search = query.trim().toLowerCase();
	const matches = search
		? fieldTypes.filter(
				(field) =>
					field.label.toLowerCase().includes(search) ||
					field.id.replaceAll("_", " ").includes(search)
			)
		: fieldTypes;
	const activeLabel =
		fieldTypes.find((field) => field.id === activeType)?.label ?? null;

	const close = (nextOpen: boolean) => {
		onOpenChange(nextOpen);
		if (!nextOpen) {
			setActiveType(null);
		}
	};

	return (
		<Dialog onOpenChange={close} open={open}>
			<DialogContent className="flex h-[min(80vh,42rem)] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
				<DialogHeader className="sr-only">
					<DialogTitle>{tl("Insert a question")}</DialogTitle>
					<DialogDescription>
						{tl("Choose a question block or search by name.")}
					</DialogDescription>
				</DialogHeader>
				<div className="border-border border-b px-3 py-2">
					<Input
						aria-label={tl("Search question blocks")}
						autoFocus
						className="border-0 bg-transparent shadow-none focus-visible:ring-1"
						onChange={(event) => onQueryChange(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "ArrowDown" && matches.length) {
								event.preventDefault();
								setActiveType((current) => {
									const index = matches.findIndex(
										(field) => field.id === current
									);
									return matches[(index + 1) % matches.length]?.id ?? null;
								});
							}
							if (event.key === "ArrowUp" && matches.length) {
								event.preventDefault();
								setActiveType((current) => {
									const index = matches.findIndex(
										(field) => field.id === current
									);
									return (
										matches[(index - 1 + matches.length) % matches.length]
											?.id ?? null
									);
								});
							}
							if (event.key === "Enter" && activeType) {
								event.preventDefault();
								onSelect(activeType);
								close(false);
							}
						}}
						placeholder={tl("Find a question block")}
						value={query}
					/>
				</div>
				<div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[minmax(14rem,0.34fr)_minmax(0,0.66fr)]">
					<div className="min-h-0 overflow-y-auto border-border sm:border-e">
						<p className="px-4 pt-3 pb-1 font-medium text-muted-foreground text-xs">
							{tl("Questions")}
						</p>
						{matches.length ? (
							<div className="grid gap-0.5 px-2 pb-2">
								{matches.map((field) => (
									<Button
										aria-pressed={activeType === field.id}
										className="w-full justify-start gap-3 border-0 bg-transparent px-2 shadow-none hover:bg-muted"
										key={field.id}
										onClick={() => onSelect(field.id)}
										onFocus={() => setActiveType(field.id)}
										onMouseEnter={() => setActiveType(field.id)}
										variant={activeType === field.id ? "secondary" : "ghost"}
									>
										<span
											aria-hidden="true"
											className="grid size-7 shrink-0 place-items-center rounded-md border border-border text-muted-foreground text-xs"
										>
											{field.id === "email"
												? "@"
												: field.id === "number"
													? "#"
													: "↵"}
										</span>
										<span className="min-w-0 flex-1 text-start">
											{field.label}
										</span>
									</Button>
								))}
							</div>
						) : (
							<p className="px-4 py-8 text-center text-muted-foreground text-sm">
								{tl("No matching question blocks.")}
							</p>
						)}
					</div>
					<div className="hidden min-w-0 flex-col items-center justify-center border-border p-8 text-center sm:flex">
						<span
							aria-hidden="true"
							className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"
						>
							+
						</span>
						<p className="mt-4 font-medium">
							{activeLabel ?? tl("Insert anything")}
						</p>
						<p className="mt-2 max-w-xs text-muted-foreground text-sm">
							{tl(
								"Choose a question block, or use the arrow keys and press Enter."
							)}
						</p>
					</div>
				</div>
				<div className="border-border border-t px-4 py-2 text-muted-foreground text-xs">
					{tl("↑ ↓ to navigate · Enter to insert · Esc to close")}
				</div>
			</DialogContent>
		</Dialog>
	);
}

import { RyuAppEmpty, RyuAppSection } from "@ryu/blocks/companion/app-ui";
import { Badge, Button } from "@ryu/blocks/companion/controls";
import { useLiteralMessages } from "@ryu/i18n/react";
import { formatDateTime } from "@ryu/ui/lib/timezone.ts";
import type { FormListItem } from "../../src/contracts.ts";

export function FormsList({
	items,
	formatNumber,
	openForm,
	openCreate,
}: {
	items: FormListItem[];
	formatNumber: (value: number) => string;
	openForm: (form: FormListItem) => void;
	openCreate: () => void;
}) {
	const tl = useLiteralMessages();
	const totalResponses = items.reduce(
		(sum, form) => sum + form.responseCount,
		0
	);
	const published = items.filter((form) => form.published).length;
	return (
		<div className="grid gap-6">
			<RyuAppSection title={tl("Your forms")}>
				<div className="grid gap-3 sm:grid-cols-3">
					<Summary label={tl("Forms")} value={formatNumber(items.length)} />
					<Summary label={tl("Published")} value={formatNumber(published)} />
					<Summary
						label={tl("Responses")}
						value={formatNumber(totalResponses)}
					/>
				</div>
			</RyuAppSection>
			<RyuAppSection title={tl("All forms")}>
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
										{form.published ? tl("Published") : tl("Draft")}
									</Badge>
									<span className="text-muted-foreground text-sm">
										{tl(
											"{count, plural, one {# response} other {# responses}}",
											{ count: form.responseCount }
										)}
									</span>
								</span>
							</button>
						))}
					</div>
				) : (
					<RyuAppEmpty
						actions={
							<Button onClick={openCreate}>
								{tl("Create your first form")}
							</Button>
						}
						description={tl(
							"Create an intake, contact, or feedback form, then share its link."
						)}
						title={tl("No forms yet")}
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

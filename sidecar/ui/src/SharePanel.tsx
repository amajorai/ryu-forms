import { Button, Input, Label } from "@ryu/blocks/companion/controls";
import { useLiteralMessages } from "@ryu/i18n/react";
import type { FormDocument } from "../../src/contracts.ts";
import type { ShareLink } from "./form-model.ts";

export function SharePanel({
	form,
	loading,
	onCopy,
	share,
}: {
	form: FormDocument;
	loading: boolean;
	onCopy: () => void;
	share: ShareLink | null;
}) {
	const tl = useLiteralMessages();
	return (
		<div className="mx-auto grid w-full max-w-2xl gap-4 rounded-lg border border-border bg-card p-4 sm:p-6">
			<div>
				<h3 className="font-heading font-semibold text-lg">
					{tl("Share this form")}
				</h3>
				<p className="mt-1 text-muted-foreground text-sm">
					{form.published
						? tl(
								"Anyone with the link can respond. Responses are stored on this Ryu node."
							)
						: tl(
								"Publish the form before sharing. Draft links are not available to respondents."
							)}
				</p>
			</div>
			{form.published ? (
				<div className="grid gap-2">
					<Label htmlFor="form-share-link">{tl("Public link")}</Label>
					<div className="flex flex-wrap gap-2">
						<Input
							id="form-share-link"
							readOnly
							value={
								loading
									? tl("Loading link…")
									: (share?.url ?? share?.path ?? "")
							}
						/>
						<Button disabled={loading || !share} onClick={onCopy}>
							{tl("Copy link")}
						</Button>
					</div>
					{share?.url ? (
						<a
							className="w-fit text-primary text-sm underline underline-offset-4"
							href={share.url}
							rel="noopener"
							target="_blank"
						>
							{tl("Open form")}
						</a>
					) : (
						<p className="text-muted-foreground text-sm">
							{tl(
								"No reachable web address is configured for this node. Copy the path and combine it with your Ryu node URL."
							)}
						</p>
					)}
				</div>
			) : (
				<div className="rounded-md bg-muted p-3 text-muted-foreground text-sm">
					{tl("Publish this form to create its public link.")}
				</div>
			)}
		</div>
	);
}

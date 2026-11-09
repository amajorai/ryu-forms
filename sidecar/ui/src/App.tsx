import {
	RyuAppEmpty,
	RyuAppMain,
	RyuAppToolbar,
} from "@ryu/blocks/companion/app-ui";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ryu/blocks/companion/controls";
import { useI18n, useLiteralMessages } from "@ryu/i18n/react";
import { CreateFormDialog } from "./CreateFormDialog.tsx";
import { FormsList } from "./FormsList.tsx";
import { FormWorkspace } from "./FormWorkspace.tsx";
import { useFormsApp } from "./use-forms-app.ts";

export function FormsApp() {
	const { formatNumber } = useI18n();
	const tl = useLiteralMessages();
	const app = useFormsApp();
	const { busy, create, deleteDialog } = app;
	const activeForm = app.current;
	return (
		<div className="flex h-full min-h-0 flex-col" data-testid="forms-app">
			<RyuAppToolbar
				actions={
					activeForm ? (
						<Button onClick={app.closeForm} variant="ghost">
							{tl("All forms")}
						</Button>
					) : (
						<Button disabled={app.loading} onClick={create.openDialog}>
							{tl("New form")}
						</Button>
					)
				}
				title={tl("Forms")}
			/>
			<RyuAppMain className="min-h-0 flex-1 overflow-y-auto">
				{app.error ? (
					<div
						className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 p-3 text-sm"
						role="alert"
					>
						<span>{app.error}</span>
						<Button disabled={busy} onClick={app.reload} variant="outline">
							{tl("Retry")}
						</Button>
					</div>
				) : null}
				{app.notice ? (
					<p className="text-sm text-status-success" role="status">
						{app.notice}
					</p>
				) : null}
				{app.loading ? (
					<p role="status">{tl("Connecting to Forms…")}</p>
				) : activeForm ? (
					<FormWorkspace
						busy={busy}
						changed={app.changed}
						form={activeForm}
						items={app.items}
						loadingMore={app.responsesMoreLoading}
						loadingResponses={app.responsesLoading}
						onAddField={app.addField}
						onChange={(next) => app.setCurrent(next)}
						onCopyLink={app.copyShareLink}
						onDelete={() => deleteDialog.setOpen(true)}
						onExport={app.exportCsv}
						onLoadMore={app.loadMoreResponses}
						onMoveField={app.moveField}
						onPublish={app.publish}
						onRemoveField={app.removeField}
						onSave={app.save}
						onSelectScreen={app.selectScreen}
						onUnpublish={app.unpublish}
						onUpdateField={app.updateField}
						page={app.responsePage}
						screen={app.screen}
						share={app.share}
						shareLoading={app.shareLoading}
					/>
				) : app.hasLoaded ? (
					<FormsList
						formatNumber={formatNumber}
						items={app.items}
						openCreate={create.openDialog}
						openForm={app.openForm}
					/>
				) : (
					<RyuAppEmpty
						actions={<Button onClick={app.reload}>{tl("Retry")}</Button>}
						description={tl(
							"The Forms service is unavailable. Retry when the Ryu node is ready."
						)}
						title={tl("Forms could not connect")}
					/>
				)}
			</RyuAppMain>

			<CreateFormDialog
				busy={busy}
				error={create.error}
				onCreate={create.submit}
				onOpenChange={create.onOpenChange}
				onSlugChange={create.onSlugChange}
				onTemplateChange={create.onTemplateChange}
				onTitleChange={create.onTitleChange}
				open={create.open}
				slug={create.slug}
				template={create.template}
				title={create.title}
			/>
			<Dialog onOpenChange={deleteDialog.setOpen} open={deleteDialog.open}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{tl("Delete form?")}</DialogTitle>
						<DialogDescription>
							{tl(
								"This permanently deletes the form and every response stored with it on this Ryu node."
							)}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							disabled={busy}
							onClick={() => deleteDialog.setOpen(false)}
							variant="outline"
						>
							{tl("Cancel")}
						</Button>
						<Button
							disabled={busy}
							onClick={deleteDialog.confirm}
							variant="destructive"
						>
							{tl("Delete form")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

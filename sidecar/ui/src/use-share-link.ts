import { useEffect, useState } from "react";
import { sharePathForForm } from "./api.ts";
import type { ShareLink } from "./form-model.ts";

/** The open form's public link, resolved against the node's share origins. */
export function useShareLink(slug: string | undefined): {
	share: ShareLink | null;
	shareLoading: boolean;
} {
	const [share, setShare] = useState<ShareLink | null>(null);
	const [shareLoading, setShareLoading] = useState(false);
	useEffect(() => {
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
	}, [slug]);
	return { share, shareLoading };
}

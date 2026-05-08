// Widget management for bg extension

import type { ExtensionContext, RunningCommand } from "./types.js";
import { WIDGET_ID } from "./config.js";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { runningForCwd } from "./utils.js";

/**
 * Update the widget showing running commands
 */
export function updateWidget(
	ctx: ExtensionContext | undefined,
	running: RunningCommand[],
	widgetInstalled: boolean,
	onSetWidget: (id: string, widget: any) => void,
	onRequestRender?: () => void,
): boolean {
	if (!ctx?.hasUI) return widgetInstalled;
	const here = runningForCwd(ctx.cwd, running);
	if (here.length === 0) {
		if (widgetInstalled) {
			onSetWidget(WIDGET_ID, undefined);
			return false;
		}
		return widgetInstalled;
	}
	if (!widgetInstalled) {
		onSetWidget(
			WIDGET_ID,
			(_tui: any, theme: any) => ({
				render(width: number): string[] {
					const count = here.length;
					const noun = count === 1 ? "command" : "commands";
					return [
						truncateToWidth(
							`${theme.fg("success", "●")} ${theme.fg("success", String(count))} ${theme.fg("success", `bg ${noun} running`)} ${theme.fg("dim", "(↑ or /bg)")}`,
							width,
							"…",
						),
					];
				},
				invalidate() {},
			}),
			{ placement: "aboveEditor" },
		);
		return true;
	}
	onRequestRender?.();
	return widgetInstalled;
}

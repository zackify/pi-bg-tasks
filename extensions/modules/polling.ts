// Polling for bg extension

import type { ExtensionAPI, ExtensionContext, RunningCommand } from "./types.js";
import { POLL_MS } from "./config.js";
import { listRunningCommands } from "./tmux.js";
import {
	getRefreshInFlight,
	setRefreshInFlight,
	setRunning,
	setPollTimer,
	getPollTimer,
	setLatestCtx,
} from "./state.js";

/**
 * Refresh the running commands list
 */
export async function refreshRunning(
	pi: ExtensionAPI,
	ctx: ExtensionContext | undefined,
	updateWidget: (ctx: ExtensionContext | undefined) => void,
): Promise<void> {
	if (!ctx || getRefreshInFlight()) return;
	setRefreshInFlight(true);
	try {
		const commands = await listRunningCommands(pi);
		setRunning(commands);
		updateWidget(ctx);
	} finally {
		setRefreshInFlight(false);
	}
}

/**
 * Start the polling timer
 */
export function startPoller(pi: ExtensionAPI, ctx: ExtensionContext, updateWidget: (ctx: ExtensionContext | undefined) => void): void {
	const existing = getPollTimer();
	if (existing) return;
	const timer = setInterval(() => {
		const latestCtx = ctx;
		void refreshRunning(pi, latestCtx, updateWidget);
	}, POLL_MS);
	timer.unref?.();
	setPollTimer(timer);
}

/**
 * Stop the polling timer
 */
export function stopPoller(): void {
	const timer = getPollTimer();
	if (timer) clearInterval(timer);
	setPollTimer(undefined);
}

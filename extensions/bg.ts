// Main entry point for bg extension
// Manages tmux background commands with a TUI interface

import { spawnSync } from "node:child_process";
import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext, RunningCommand, MenuItem } from "./modules/types.js";
import { WIDGET_ID, POLL_MS, META_DIR, SESSION_PREFIX } from "./modules/config.js";
import { stopPoller, refreshRunning } from "./modules/polling.js";
import { listRunningCommands, killSessionSync } from "./modules/tmux.js";
import { getRecentCommands } from "./modules/cache.js";
import { startBackgroundCommand, killRunningCommand as killCommand } from "./modules/commands.js";
import { updateWidget } from "./modules/widget.js";
import { showBgMenu, attachToCommand } from "./modules/menu.js";
import { showLogs } from "./modules/logs.js";
import { runningForCwd } from "./modules/utils.js";
import {
	getLatestCtx,
	setLatestCtx,
	getRunning,
	setRunning,
	getWidgetInstalled,
	setWidgetInstalled,
	getLogViewerOpen,
	setLogViewerOpen,
	getPollTimer,
	setPollTimer,
	getProcessHooksInstalled,
	setProcessHooksInstalled,
} from "./modules/state.js";

// Re-export types for public API
export type { Cache, CwdCache, RunningCommand, MenuItem } from "./modules/types.js";

export default function bgExtension(pi: ExtensionAPI) {
	installProcessHooks();

	pi.events.on("bg:editorUpEmpty", (out: unknown) => {
		const payload = out as { handled?: boolean };
		const ctx = getLatestCtx();
		if (!ctx?.hasUI || getLogViewerOpen()) return;
		const here = runningForCwd(ctx.cwd, getRunning());
		if (here.length === 0) return;
		payload.handled = true;
		void (async () => {
			setLogViewerOpen(true);
			try {
				await showLogs(pi, ctx, here[0]!, killCommand, attachToCommand);
			} finally {
				setLogViewerOpen(false);
				await refreshRunning(pi, ctx, () => updateWidgetDirect(ctx));
			}
		})();
	});

	pi.registerCommand("bg", {
		description: "Start and manage tmux background commands in the current directory",
		handler: async (args, ctx) => {
			setLatestCtx(ctx);
			if (!tmuxAvailable()) {
				ctx.ui.notify("tmux is not installed. Install tmux to use /bg.", "error");
				return;
			}

			const directCommand = args.trim();
			if (directCommand) {
				await startBackgroundCommand(pi, ctx, directCommand, () => updateWidgetDirect(ctx));
				return;
			}

			while (true) {
				const selected = await showBgMenu(
					pi,
					ctx,
					() => getRecentCommands(ctx.cwd),
					async () => {
						const commands = await listRunningCommands(pi);
						setRunning(commands);
						return commands;
					},
					(cwd: string) => runningForCwd(cwd, getRunning()),
					() => updateWidgetDirect(ctx),
					(command: RunningCommand) => killCommand(pi, ctx, command, () => updateWidgetDirect(ctx)),
					attachToCommand,
				);
				if (!selected) break;
				if (selected.type === "new" || selected.type === "recent") {
					const prefill = selected.type === "recent" ? selected.command : "";
					ctx.ui.setEditorText(`/bg ${prefill}`);
					break;
				}
				if (selected.type === "running") {
					await showLogs(pi, ctx, selected.running, killCommand, attachToCommand);
					await refreshRunning(pi, ctx, () => updateWidgetDirect(ctx));
					continue;
				}
			}
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		setLatestCtx(ctx);
		if (!ctx.hasUI) return;
		await refreshRunning(pi, ctx, () => updateWidgetDirect(ctx));
		startPollerDirect(pi);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		stopPoller();
		await killAllRunningCommands(pi);
		uninstallProcessHooks();
		if (ctx.hasUI) {
			ctx.ui.setWidget(WIDGET_ID, undefined);
			setWidgetInstalled(false);
		}
	});
}

// Check if tmux is available
function tmuxAvailable(): boolean {
	const result = spawnSync("tmux", ["-V"], { stdio: "ignore" });
	return result.status === 0;
}

// Sync kill all running commands (used for process hooks)
function killAllRunningCommandsSync(): void {
	if (!tmuxAvailable()) return;
	const result = spawnSync("tmux", ["list-sessions", "-F", "#S"], { encoding: "utf8", timeout: 3000 });
	if (result.status !== 0 || !result.stdout) return;
	for (const line of result.stdout.split(/\r?\n/)) {
		const session = line.trim();
		if (session.startsWith(SESSION_PREFIX)) {
			killSessionSync(session);
		}
	}
}

// Install process hooks
function installProcessHooks(): void {
	if (getProcessHooksInstalled()) return;
	setProcessHooksInstalled(true);
	process.on("exit", killAllRunningCommandsSync);
	process.on("SIGINT", killAllRunningCommandsSync);
	process.on("SIGTERM", killAllRunningCommandsSync);
	process.on("SIGHUP", killAllRunningCommandsSync);
}

// Uninstall process hooks
function uninstallProcessHooks(): void {
	if (!getProcessHooksInstalled()) return;
	setProcessHooksInstalled(false);
	process.off("exit", killAllRunningCommandsSync);
	process.off("SIGINT", killAllRunningCommandsSync);
	process.off("SIGTERM", killAllRunningCommandsSync);
	process.off("SIGHUP", killAllRunningCommandsSync);
}

// Direct widget update helper
function updateWidgetDirect(ctx: ExtensionContext | undefined): void {
	setWidgetInstalled(updateWidget(ctx, getRunning(), getWidgetInstalled(), ctx?.ui.setWidget.bind(ctx.ui), () => ctx?.ui.requestRender?.()));
}

// Direct poller helper
function startPollerDirect(pi: ExtensionAPI): void {
	const existing = getPollTimer();
	if (existing) return;
	const timer = setInterval(() => {
		const latestCtx = getLatestCtx();
		void refreshRunning(pi, latestCtx, () => updateWidgetDirect(latestCtx));
	}, POLL_MS);
	timer.unref?.();
	setPollTimer(timer);
}

// Async kill all running commands
async function killAllRunningCommands(pi: ExtensionAPI): Promise<void> {
	const commands = await listRunningCommands(pi);
	for (const command of commands) {
		await pi.exec("tmux", ["kill-session", "-t", command.session], { timeout: 5000 }).catch(() => undefined);
	}
}

// Log viewer for bg extension

import type { ExtensionAPI, ExtensionContext, RunningCommand } from "./types.js";
import { truncateToWidth, Key, matchesKey, Text } from "@mariozechner/pi-tui";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { exec, killRunningCommand as killTmuxCommand } from "./tmux.js";
import { attachToCommand } from "./menu.js";
import { LOG_POLL_MS, MAX_LOG_LINES, DEFAULT_LOG_LINES, DISPLAY_LOG_LINES } from "./config.js";

/**
 * Read the last N lines of a log file
 */
export async function readLogs(pi: ExtensionAPI, command: RunningCommand, lines = DEFAULT_LOG_LINES): Promise<string> {
	const result = await exec(pi, "tail", [`-n`, String(Math.max(1, Math.min(lines, MAX_LOG_LINES))), command.logFile], 5000);
	if (result.code !== 0) return result.stderr.trim() || "No log output yet.";
	return result.stdout.trimEnd() || "No log output yet.";
}

/**
 * Show the log viewer for a command
 */
export async function showLogs(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	command: RunningCommand,
	killCommand: (command: RunningCommand) => Promise<boolean>,
	attachCommand: (command: RunningCommand) => Promise<void>,
): Promise<void> {
	let output = await readLogs(pi, command);
	let busy = false;
	let pollTimer: NodeJS.Timeout | undefined;
	let currentTui: any = undefined;

	const startLogPoller = () => {
		if (pollTimer) return;
		pollTimer = setInterval(async () => {
			output = await readLogs(pi, command);
			currentTui?.requestRender();
		}, LOG_POLL_MS);
		pollTimer.unref?.();
	};

	const stopLogPoller = () => {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = undefined;
		}
	};

	await ctx.ui.custom<void>((tui, theme, _kb, done) => {
		currentTui = tui;
		startLogPoller();
		return {
			render(width: number): string[] {
				const lines: string[] = [];
				lines.push(...new DynamicBorder((s: string) => theme.fg("accent", s)).render(width));
				lines.push(
					...new Text(
						`${theme.fg("success", "●")} ${theme.fg("accent", theme.bold(command.command))} ${theme.fg("muted", command.session)}`,
						1,
						0,
					).render(width),
				);
				const logLines = output.split(/\r?\n/).slice(-DISPLAY_LOG_LINES);
				for (const line of logLines) lines.push(truncateToWidth(line || " ", width, "…"));
				lines.push(...new Text(theme.fg("dim", busy ? "working…" : "auto-refreshing • k kill • a attach • esc back"), 1, 0).render(width));
				lines.push(...new DynamicBorder((s: string) => theme.fg("accent", s)).render(width));
				return lines;
			},
			invalidate() {},
			handleInput(data: string) {
				if (busy) return;
				if (matchesKey(data, Key.up) || matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c") || data === "q") {
					stopLogPoller();
					done();
				}
				else if (data === "k") {
					busy = true;
					stopLogPoller();
					void killCommand(command).finally(() => {
						busy = false;
						done();
					});
				} else if (data === "a") {
					stopLogPoller();
					done();
					void attachCommand(command);
				}
				tui.requestRender();
			},
		};
	});
}

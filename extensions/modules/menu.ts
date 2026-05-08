// Menu for bg extension

import { spawnSync } from "node:child_process";
import type {
	ExtensionAPI,
	ExtensionContext,
	RunningCommand,
	MenuItem,
} from "./types.js";
import { truncateToWidth, Key, matchesKey, Text } from "@earendil-works/pi-tui";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { truncateMiddle } from "./utils.js";
import {
	MENU_TRUNCATE_WIDTH,
	RUNNING_TRUNCATE_WIDTH,
	DISPLAY_LOG_LINES,
} from "./config.js";
import { exec } from "./tmux.js";
import { readLogs } from "./logs.js";

/**
 * Build menu items from recents and running commands
 */
export function buildMenuItems(recents: string[], runningCommands: RunningCommand[]): MenuItem[] {
	const items: MenuItem[] = [];
	if (runningCommands.length > 0) {
		items.push({ type: "separator", label: "running" });
		for (const cmd of runningCommands) items.push({ type: "running", running: cmd });
	}
	items.push({ type: "new", label: "New command…" });
	if (recents.length > 0) items.push({ type: "separator", label: "recent" });
	for (const command of recents) items.push({ type: "recent", command });
	return items;
}

/**
 * Attach to a running command's tmux session
 */
export async function attachToCommand(ctx: ExtensionContext, command: RunningCommand): Promise<void> {
	if (!ctx.hasUI) return;
	await ctx.ui.custom<void>((tui, _theme, _kb, done) => {
		tui.stop();
		process.stdout.write("\x1b[2J\x1b[H");
		spawnSync("tmux", ["attach", "-t", command.session], { stdio: "inherit" });
		tui.start();
		tui.requestRender(true);
		done();
		return { render: () => [], invalidate: () => {} };
	});
}

/**
 * Show the background commands menu
 */
export async function showBgMenu(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	getRecents: () => string[],
	listRunning: () => Promise<RunningCommand[]>,
	runningForCwdFn: (cwd: string) => RunningCommand[],
	updateWidget: () => void,
	killCommand: (command: RunningCommand) => Promise<boolean>,
	attachCommand: (command: RunningCommand) => Promise<void>,
): Promise<MenuItem | null> {
	let recents = getRecents();
	let runningCommands = await listRunning();
	updateWidget();
	let here = runningForCwdFn(ctx.cwd);
	let items = buildMenuItems(recents, here);
	let selected = 0;
	let busy = false;

	return ctx.ui.custom<MenuItem | null>((tui, theme, _kb, done) => ({
		render(width: number): string[] {
			const lines: string[] = [];
			lines.push(...new DynamicBorder((s: string) => theme.fg("accent", s)).render(width));
			lines.push(
				...new Text(theme.fg("accent", theme.bold(`Background commands — ${ctx.cwd}`)), 1, 0).render(width),
			);
			if (items.length === 1 && items[0]?.type === "new") {
				lines.push(truncateToWidth(`  ${theme.fg("dim", "No recent or running background commands")}`, width, "…"));
			}
			for (let i = 0; i < items.length; i++) {
				const item = items[i]!;
				const isSelected = i === selected;
				const prefix = isSelected ? theme.fg("accent", "› ") : "  ";
				if (item.type === "separator") {
					const count = item.label === "running" ? here.length : recents.length;
					lines.push(truncateToWidth(`  ${theme.fg("dim", `── ${item.label} (${count}) ──`)}`, width, "…"));
				} else if (item.type === "new") {
					lines.push(truncateToWidth(`${prefix}${isSelected ? theme.fg("accent", item.label) : item.label}`, width, "…"));
				} else if (item.type === "recent") {
					const text = truncateMiddle(item.command, MENU_TRUNCATE_WIDTH);
					lines.push(truncateToWidth(`${prefix}${isSelected ? theme.fg("accent", text) : text}`, width, "…"));
				} else {
					const cmd = truncateMiddle(item.running.command, RUNNING_TRUNCATE_WIDTH);
					const label = `${theme.fg("success", "●")} ${cmd} ${theme.fg("muted", item.running.session)}`;
					lines.push(truncateToWidth(`${prefix}${isSelected ? theme.fg("accent", label) : label}`, width, "…"));
				}
			}
			const help = busy
				? "working…"
				: "↑↓ navigate • enter start/show logs • k kill running • a attach • esc close";
			lines.push(...new Text(theme.fg("dim", help), 1, 0).render(width));
			lines.push(...new DynamicBorder((s: string) => theme.fg("accent", s)).render(width));
			return lines;
		},
		invalidate() {},
		handleInput(data: string) {
			if (busy) return;
			if (matchesKey(data, Key.up)) done(null);
			else if (matchesKey(data, Key.down)) {
				const selectable = items.flatMap((item, index) => (item.type === "separator" ? [] : [index]));
				const current = Math.max(0, selectable.indexOf(selected));
				const next = Math.max(0, Math.min(selectable.length - 1, current + 1));
				selected = selectable[next]!;
			}
			else if (matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c")) done(null);
			else if (matchesKey(data, Key.enter)) done(items[selected] ?? null);
			else if (data === "k" && items[selected]?.type === "running") {
				busy = true;
				const command = (items[selected] as { type: "running"; running: RunningCommand }).running;
				void killCommand(command)
					.then(async () => {
						recents = getRecents();
						runningCommands = await listRunning();
						here = runningForCwdFn(ctx.cwd);
						items = buildMenuItems(recents, here);
						selected = Math.min(selected, items.length - 1);
					})
					.finally(() => {
						busy = false;
						tui.requestRender();
					});
			} else if (data === "a" && items[selected]?.type === "running") {
				const command = (items[selected] as { type: "running"; running: RunningCommand }).running;
				done(null);
				void attachCommand(command);
			}
			tui.requestRender();
		},
	}));
}

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CACHE_PATH = path.join(os.homedir(), ".pi", "agent", "bg-cache.json");
const META_DIR = path.join(os.homedir(), ".pi", "agent", "bg-meta");
const LOG_DIR = path.join(os.homedir(), ".pi", "agent", "bg-logs");
const WIDGET_ID = "pi-bg-running";
const POLL_MS = 5000;
const RECENT_LIMIT = 10;

type Cache = {
	cwds?: Record<string, CwdCache>;
};

type CwdCache = {
	recentBackgroundCommands?: string[];
};

type RunningCommand = {
	session: string;
	command: string;
	cwd: string;
	logFile: string;
	startedAt: number;
};

type MenuItem =
	| { type: "new"; label: string }
	| { type: "recent"; command: string }
	| { type: "running"; running: RunningCommand }
	| { type: "separator"; label: string };

let latestCtx: ExtensionContext | undefined;
let latestPi: ExtensionAPI | undefined;
let running: RunningCommand[] = [];
let pollTimer: NodeJS.Timeout | undefined;
let refreshInFlight = false;
let processHooksInstalled = false;
let widgetInstalled = false;
let logViewerOpen = false;

function runningForCwd(cwd: string): RunningCommand[] {
	const normalized = path.resolve(cwd);
	return running.filter((cmd) => {
		if (!cmd.cwd) return false;
		try {
			return path.resolve(cmd.cwd) === normalized;
		} catch {
			return cmd.cwd === cwd;
		}
	});
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function truncateMiddle(value: string, max = 80): string {
	if (value.length <= max) return value;
	const half = Math.floor((max - 1) / 2);
	return `${value.slice(0, half)}…${value.slice(value.length - half)}`;
}

function loadCache(): Cache {
	try {
		return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) as Cache;
	} catch {
		return { cwds: {} };
	}
}

function saveCache(cache: Cache): void {
	fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
	fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, "\t")}\n`, "utf8");
}

function cwdKey(cwd: string): string {
	try {
		return path.resolve(cwd);
	} catch {
		return cwd;
	}
}

function getRecentCommands(cwd: string): string[] {
	const cache = loadCache();
	const key = cwdKey(cwd);
	const recents = cache.cwds?.[key]?.recentBackgroundCommands ?? [];
	const filtered = recents.filter(
		(cmd): cmd is string => typeof cmd === "string" && !!cmd.trim(),
	);
	// If no recents for this cwd, show all recents
	if (filtered.length === 0) {
		const all = Object.values(cache.cwds ?? {}).flatMap(
			(c) => c.recentBackgroundCommands ?? [],
		);
		return [...new Set(all)].filter((cmd): cmd is string => typeof cmd === "string" && !!cmd.trim());
	}
	return filtered;
}

function rememberCommand(cwd: string, command: string): void {
	const trimmed = command.trim();
	if (!trimmed) return;
	const cache = loadCache();
	const key = cwdKey(cwd);
	cache.cwds ??= {};
	cache.cwds[key] ??= { recentBackgroundCommands: [] };
	const entry = cache.cwds[key];
	const existing = (entry.recentBackgroundCommands ?? []).filter((cmd) => cmd !== trimmed);
	entry.recentBackgroundCommands = [trimmed, ...existing].slice(0, RECENT_LIMIT);
	saveCache(cache);
}

function tmuxAvailable(): boolean {
	const result = spawnSync("tmux", ["-V"], { stdio: "ignore" });
	return result.status === 0;
}

async function exec(pi: ExtensionAPI, command: string, args: string[], timeout = 8000) {
	return pi.exec(command, args, { timeout });
}

async function listRunningCommands(pi: ExtensionAPI): Promise<RunningCommand[]> {
	if (!tmuxAvailable()) return [];
	const result = await exec(pi, "tmux", ["list-sessions", "-F", "#S"], 5000);
	if (result.code !== 0) return [];
	const sessions = result.stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.startsWith("pi-bg-"));

	const commands: RunningCommand[] = [];
	for (const session of sessions) {
		const metaFile = path.join(META_DIR, `${session}.json`);
		try {
			const parsed = JSON.parse(fs.readFileSync(metaFile, "utf8")) as Partial<RunningCommand>;
			commands.push({
				session,
				command: parsed.command || session,
				cwd: parsed.cwd || "",
				logFile: parsed.logFile || path.join(LOG_DIR, `${session}.log`),
				startedAt: parsed.startedAt ?? 0,
			});
		} catch {
			commands.push({
				session,
				command: session,
				cwd: "",
				logFile: path.join(LOG_DIR, `${session}.log`),
				startedAt: 0,
			});
		}
	}
	return commands.sort((a, b) => b.startedAt - a.startedAt);
}

async function refreshRunning(pi: ExtensionAPI, ctx = latestCtx): Promise<void> {
	if (!ctx || refreshInFlight) return;
	refreshInFlight = true;
	try {
		running = await listRunningCommands(pi);
		updateWidget(ctx);
	} finally {
		refreshInFlight = false;
	}
}

function updateWidget(ctx: ExtensionContext | undefined): void {
	if (!ctx?.hasUI) return;
	latestCtx = ctx;
	const here = runningForCwd(ctx.cwd);
	if (here.length === 0) {
		if (widgetInstalled) {
			ctx.ui.setWidget(WIDGET_ID, undefined);
			widgetInstalled = false;
		}
		return;
	}
	if (!widgetInstalled) {
		ctx.ui.setWidget(
			WIDGET_ID,
			(_tui: any, theme: any) => ({
				render(width: number): string[] {
					const count = latestCtx ? runningForCwd(latestCtx.cwd).length : 0;
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
		widgetInstalled = true;
	}
	(ctx.ui as { requestRender?: () => void }).requestRender?.();
}

function startPoller(pi: ExtensionAPI): void {
	if (pollTimer) return;
	pollTimer = setInterval(() => void refreshRunning(pi), POLL_MS);
	pollTimer.unref?.();
}

function stopPoller(): void {
	if (pollTimer) clearInterval(pollTimer);
	pollTimer = undefined;
}

function killSessionSync(session: string): void {
	spawnSync("tmux", ["kill-session", "-t", session], { stdio: "ignore", timeout: 3000 });
}

function killAllRunningCommandsSync(): void {
	if (!tmuxAvailable()) return;
	const result = spawnSync("tmux", ["list-sessions", "-F", "#S"], { encoding: "utf8", timeout: 3000 });
	if (result.status !== 0 || !result.stdout) return;
	for (const line of result.stdout.split(/\r?\n/)) {
		const session = line.trim();
		if (session.startsWith("pi-bg-")) killSessionSync(session);
	}
}

async function killAllRunningCommands(pi: ExtensionAPI, ctx?: ExtensionContext): Promise<void> {
	const commands = await listRunningCommands(pi);
	for (const command of commands) {
		await exec(pi, "tmux", ["kill-session", "-t", command.session], 5000).catch(() => undefined);
	}
	running = [];
	if (ctx?.hasUI) updateWidget(ctx);
}

function installProcessHooks(): void {
	if (processHooksInstalled) return;
	processHooksInstalled = true;
	process.on("exit", killAllRunningCommandsSync);
	process.on("SIGINT", killAllRunningCommandsSync);
	process.on("SIGTERM", killAllRunningCommandsSync);
	process.on("SIGHUP", killAllRunningCommandsSync);
}

function uninstallProcessHooks(): void {
	if (!processHooksInstalled) return;
	processHooksInstalled = false;
	process.off("exit", killAllRunningCommandsSync);
	process.off("SIGINT", killAllRunningCommandsSync);
	process.off("SIGTERM", killAllRunningCommandsSync);
	process.off("SIGHUP", killAllRunningCommandsSync);
}

function makeSessionId(cwd: string, command: string): string {
	const hash = crypto
		.createHash("sha1")
		.update(`${cwd}|${command}|${Date.now()}|${Math.random()}`)
		.digest("hex")
		.slice(0, 8);
	return `pi-bg-${hash}`;
}

type StartResult = { ok: true; command: RunningCommand } | { ok: false; error: string };

async function startBackgroundCommandCore(
	pi: ExtensionAPI,
	cwd: string,
	command: string,
): Promise<StartResult> {
	const trimmed = command.trim();
	if (!trimmed) return { ok: false, error: "Background command cannot be empty." };
	if (!tmuxAvailable()) return { ok: false, error: "tmux is not installed. Install tmux to use background tasks." };

	fs.mkdirSync(META_DIR, { recursive: true });
	fs.mkdirSync(LOG_DIR, { recursive: true });

	const session = makeSessionId(cwd, trimmed);
	const logFile = path.join(LOG_DIR, `${session}.log`);
	const metadata: RunningCommand = {
		session,
		command: trimmed,
		cwd,
		logFile,
		startedAt: Date.now(),
	};
	fs.writeFileSync(path.join(META_DIR, `${session}.json`), JSON.stringify(metadata, null, "\t"), "utf8");

	const runScript = `cd ${shellQuote(cwd)} && exec bash -lc ${shellQuote(`${trimmed} 2>&1 | tee -a ${shellQuote(logFile)}`)}`;
	const result = await exec(pi, "tmux", ["new-session", "-d", "-s", session, "-c", cwd, "bash", "-lc", runScript], 10000);
	if (result.code !== 0) {
		try {
			fs.unlinkSync(path.join(META_DIR, `${session}.json`));
		} catch {}
		return { ok: false, error: (result.stderr || result.stdout || `Failed to start ${trimmed}`).trim() };
	}

	rememberCommand(cwd, trimmed);
	return { ok: true, command: metadata };
}

async function startBackgroundCommand(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	command: string,
): Promise<RunningCommand | undefined> {
	const result = await startBackgroundCommandCore(pi, ctx.cwd, command);
	if (!result.ok) {
		if (ctx.hasUI) ctx.ui.notify(result.error, "error");
		return undefined;
	}
	if (ctx.hasUI) {
		ctx.ui.notify(
			`Started: ${result.command.command}\nSession: ${result.command.session}\nLogs: ${result.command.logFile}`,
			"info",
		);
	}
	await refreshRunning(pi, ctx);
	return result.command;
}

async function stopBackgroundCommandsByName(
	pi: ExtensionAPI,
	cwd: string,
	command: string,
): Promise<{ killed: RunningCommand[]; running: RunningCommand[] }> {
	const trimmed = command.trim();
	const all = await listRunningCommands(pi);
	const normalizedCwd = (() => {
		try {
			return path.resolve(cwd);
		} catch {
			return cwd;
		}
	})();
	const matches = all.filter((c) => {
		if (c.command.trim() !== trimmed) return false;
		if (!c.cwd) return true;
		try {
			return path.resolve(c.cwd) === normalizedCwd;
		} catch {
			return c.cwd === cwd;
		}
	});
	const killed: RunningCommand[] = [];
	for (const match of matches) {
		const result = await exec(pi, "tmux", ["kill-session", "-t", match.session], 5000);
		if (result.code === 0 || /can't find session/i.test(result.stderr)) {
			try {
				fs.unlinkSync(path.join(META_DIR, `${match.session}.json`));
			} catch {}
			killed.push(match);
		}
	}
	return { killed, running: all };
}

async function readLogs(pi: ExtensionAPI, command: RunningCommand, lines = 80): Promise<string> {
	const result = await exec(pi, "tail", [`-n`, String(Math.max(1, Math.min(lines, 500))), command.logFile], 5000);
	if (result.code !== 0) return result.stderr.trim() || "No log output yet.";
	return result.stdout.trimEnd() || "No log output yet.";
}

async function killRunningCommand(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	command: RunningCommand,
): Promise<boolean> {
	const result = await exec(pi, "tmux", ["kill-session", "-t", command.session], 5000);
	if (result.code !== 0 && !/can't find session/i.test(result.stderr)) {
		ctx.ui.notify(`Could not kill ${command.session}: ${(result.stderr || result.stdout).trim()}`, "error");
		return false;
	}
	try {
		fs.unlinkSync(path.join(META_DIR, `${command.session}.json`));
	} catch {}
	ctx.ui.notify(`Killed ${command.session}`, "info");
	await refreshRunning(pi, ctx);
	return true;
}

async function attachToCommand(ctx: ExtensionContext, command: RunningCommand): Promise<void> {
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

function selectableItems(items: MenuItem[]): number[] {
	return items.flatMap((item, index) => (item.type === "separator" ? [] : [index]));
}

function moveSelection(items: MenuItem[], selected: number, delta: number): number {
	const selectable = selectableItems(items);
	if (selectable.length === 0) return 0;
	const current = Math.max(0, selectable.indexOf(selected));
	const next = Math.max(0, Math.min(selectable.length - 1, current + delta));
	return selectable[next]!;
}

function buildMenuItems(recents: string[], runningCommands: RunningCommand[]): MenuItem[] {
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

async function showBgMenu(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<MenuItem | null> {
	let recents = getRecentCommands(ctx.cwd);
	running = await listRunningCommands(pi);
	updateWidget(ctx);
	let here = runningForCwd(ctx.cwd);
	let items = buildMenuItems(recents, here);
	let selected = moveSelection(items, 0, 0);
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
					const text = truncateMiddle(item.command, 120);
					lines.push(truncateToWidth(`${prefix}${isSelected ? theme.fg("accent", text) : text}`, width, "…"));
				} else {
					const cmd = truncateMiddle(item.running.command, 80);
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
			if (matchesKey(data, Key.up)) selected = moveSelection(items, selected, -1);
			else if (matchesKey(data, Key.down)) selected = moveSelection(items, selected, 1);
			else if (matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c")) done(null);
			else if (matchesKey(data, Key.enter)) done(items[selected] ?? null);
			else if (data === "k" && items[selected]?.type === "running") {
				busy = true;
				const command = (items[selected] as { type: "running"; running: RunningCommand }).running;
				void killRunningCommand(pi, ctx, command)
					.then(async () => {
						recents = getRecentCommands(ctx.cwd);
						running = await listRunningCommands(pi);
						here = runningForCwd(ctx.cwd);
						items = buildMenuItems(recents, here);
						selected = moveSelection(items, Math.min(selected, items.length - 1), 0);
					})
					.finally(() => {
						busy = false;
						tui.requestRender();
					});
			} else if (data === "a" && items[selected]?.type === "running") {
				const command = (items[selected] as { type: "running"; running: RunningCommand }).running;
				done(null);
				void attachToCommand(ctx, command);
			}
			tui.requestRender();
		},
	}));
}

async function showLogs(pi: ExtensionAPI, ctx: ExtensionContext, command: RunningCommand): Promise<void> {
	let output = await readLogs(pi, command);
	let busy = false;
	let pollTimer: NodeJS.Timeout | undefined;
	let currentTui: any = undefined;

	const startPoller = () => {
		if (pollTimer) return;
		pollTimer = setInterval(async () => {
			output = await readLogs(pi, command);
			currentTui?.requestRender();
		}, 1000);
		pollTimer.unref?.();
	};

	const stopPoller = () => {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = undefined;
		}
	};

	await ctx.ui.custom<void>((tui, theme, _kb, done) => {
		currentTui = tui;
		startPoller();
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
				const logLines = output.split(/\r?\n/).slice(-40);
				for (const line of logLines) lines.push(truncateToWidth(line || " ", width, "…"));
				lines.push(...new Text(theme.fg("dim", busy ? "working…" : "auto-refreshing • ↑/esc back • k kill • a attach"), 1, 0).render(width));
				lines.push(...new DynamicBorder((s: string) => theme.fg("accent", s)).render(width));
				return lines;
			},
			invalidate() {},
			handleInput(data: string) {
				if (busy) return;
				if (matchesKey(data, Key.up) || matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c") || data === "q") {
					stopPoller();
					done();
				}
				else if (data === "k") {
					busy = true;
					stopPoller();
					void killRunningCommand(pi, ctx, command).finally(() => {
						busy = false;
						done();
					});
				} else if (data === "a") {
					stopPoller();
					done();
					void attachToCommand(ctx, command);
				}
				tui.requestRender();
			},
		};
	});
}

export default function bgExtension(pi: ExtensionAPI) {
	latestPi = pi;
	installProcessHooks();

	pi.registerTool({
		name: "start_bg_task",
		label: "Start Background Task",
		description:
			"Start a shell command in a detached tmux background session from the current working directory. Equivalent to running `/bg <command>`. Output is logged to a file you can read later. Use this for dev servers, watchers, or any long-running process you want to keep running while the agent continues working. Stop it with stop_bg_task by passing the exact same command string.",
		promptSnippet:
			"Launch a shell command in a detached tmux background session (use stop_bg_task with the same command to kill it).",
		parameters: Type.Object({
			command: Type.String({
				description:
					"Shell command to run in the background, e.g. 'npm run dev'. Runs via `bash -lc` in the current working directory.",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await startBackgroundCommandCore(pi, ctx.cwd, params.command);
			if (!result.ok) {
				return {
					isError: true,
					content: [{ type: "text" as const, text: `Failed to start background task: ${result.error}` }],
					details: { command: params.command, error: result.error },
				};
			}
			if (ctx.hasUI) {
				await refreshRunning(pi, ctx).catch(() => undefined);
			}
			const { command: started } = result;
			return {
				content: [
					{
						type: "text" as const,
						text: `Started background task.\nCommand: ${started.command}\nSession: ${started.session}\nLogs: ${started.logFile}\nStop with: stop_bg_task command=${JSON.stringify(started.command)}`,
					},
				],
				details: {
					command: started.command,
					session: started.session,
					logFile: started.logFile,
					cwd: started.cwd,
					startedAt: started.startedAt,
				},
			};
		},
	});

	pi.registerTool({
		name: "bg_task_status",
		label: "Background Task Status",
		description:
			"Check whether a background task started via start_bg_task is still actively running, and optionally peek at the tail of its log output. Pass a `command` string to check a specific task, or omit it to list every background task running in the current working directory. Useful for confirming a dev server has booted, polling whether a long build finished, or fetching recent log lines to diagnose a failure without leaving the agent loop.",
		promptSnippet:
			"Check if a background task is still running and optionally read recent log lines.",
		parameters: Type.Object({
			command: Type.Optional(
				Type.String({
					description:
						"Optional exact command string used with start_bg_task. If omitted, returns the status of every background task in the current working directory.",
				}),
			),
			logLines: Type.Optional(
				Type.Number({
					description:
						"How many trailing log lines to include per running task (default 40, max 500). Set to 0 to skip log output.",
					minimum: 0,
					maximum: 500,
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!tmuxAvailable()) {
				return {
					isError: true,
					content: [{ type: "text" as const, text: "tmux is not installed; no background tasks can be running." }],
					details: { tmux: false },
				};
			}

			const all = await listRunningCommands(pi);
			const hereRunning = all.filter((c) => {
				if (!c.cwd) return false;
				try {
					return path.resolve(c.cwd) === path.resolve(ctx.cwd);
				} catch {
					return c.cwd === ctx.cwd;
				}
			});
			const lineCount = params.logLines ?? 40;
			const now = Date.now();

			const summarize = async (cmd: RunningCommand) => {
				const uptimeMs = cmd.startedAt ? now - cmd.startedAt : 0;
				const logs = lineCount > 0 ? await readLogs(pi, cmd, lineCount) : "";
				return {
					command: cmd.command,
					session: cmd.session,
					cwd: cmd.cwd,
					logFile: cmd.logFile,
					startedAt: cmd.startedAt,
					uptimeMs,
					logs,
				};
			};

			const formatUptime = (ms: number): string => {
				if (!ms || ms < 0) return "unknown";
				const sec = Math.floor(ms / 1000);
				if (sec < 60) return `${sec}s`;
				const min = Math.floor(sec / 60);
				if (min < 60) return `${min}m ${sec % 60}s`;
				const hr = Math.floor(min / 60);
				return `${hr}h ${min % 60}m`;
			};

			if (params.command !== undefined) {
				const trimmed = params.command.trim();
				const match = hereRunning.find((c) => c.command.trim() === trimmed);
				if (!match) {
					const listing = hereRunning.length
						? `Currently running in this cwd:\n${hereRunning.map((c) => `- ${c.command} (session ${c.session})`).join("\n")}`
						: "No background tasks are currently running in this cwd.";
					return {
						content: [
							{
								type: "text" as const,
								text: `Background task ${JSON.stringify(trimmed)} is NOT running in ${ctx.cwd}.\n${listing}`,
							},
						],
						details: {
							command: trimmed,
							running: false,
							candidates: hereRunning.map((c) => ({ command: c.command, session: c.session })),
						},
					};
				}
				const info = await summarize(match);
				const logSection = info.logs ? `\nLast ${lineCount} log line${lineCount === 1 ? "" : "s"}:\n${info.logs}` : "";
				return {
					content: [
						{
							type: "text" as const,
							text: `Background task is RUNNING.\nCommand: ${info.command}\nSession: ${info.session}\nUptime: ${formatUptime(info.uptimeMs)}\nLogs: ${info.logFile}${logSection}`,
						},
					],
					details: { running: true, ...info },
				};
			}

			if (hereRunning.length === 0) {
				return {
					content: [
						{
							type: "text" as const,
							text: `No background tasks are currently running in ${ctx.cwd}.`,
						},
					],
					details: { running: false, tasks: [] },
				};
			}

			const summaries = await Promise.all(hereRunning.map(summarize));
			const text = summaries
				.map((info) => {
					const logSection = info.logs ? `\n  logs:\n${info.logs.split("\n").map((l) => `    ${l}`).join("\n")}` : "";
					return `- ${info.command}\n  session: ${info.session}\n  uptime: ${formatUptime(info.uptimeMs)}\n  logFile: ${info.logFile}${logSection}`;
				})
				.join("\n");
			return {
				content: [
					{
						type: "text" as const,
						text: `${hereRunning.length} background task${hereRunning.length === 1 ? "" : "s"} running in ${ctx.cwd}:\n${text}`,
					},
				],
				details: { running: true, tasks: summaries },
			};
		},
	});

	pi.registerTool({
		name: "stop_bg_task",
		label: "Stop Background Task",
		description:
			"Stop a background task previously started with start_bg_task. Pass the exact same command string used to start it. Matches running tasks in the current working directory and kills them. If nothing matches, the response lists what is currently running so you can retry with the right string.",
		promptSnippet: "Stop a background task by passing the exact command string used to start it.",
		parameters: Type.Object({
			command: Type.String({
				description: "The exact command string used with start_bg_task to launch the task you want to kill.",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { killed, running: allRunning } = await stopBackgroundCommandsByName(pi, ctx.cwd, params.command);
			if (ctx.hasUI) {
				await refreshRunning(pi, ctx).catch(() => undefined);
			}
			if (killed.length === 0) {
				const hereRunning = allRunning.filter((c) => {
					try {
						return path.resolve(c.cwd) === path.resolve(ctx.cwd);
					} catch {
						return c.cwd === ctx.cwd;
					}
				});
				const listing = hereRunning.length
					? `Currently running in this cwd:\n${hereRunning.map((c) => `- ${c.command} (session ${c.session})`).join("\n")}`
					: "No background tasks are currently running in this cwd.";
				return {
					isError: true,
					content: [
						{
							type: "text" as const,
							text: `No running background task matched command ${JSON.stringify(params.command)} in ${ctx.cwd}.\n${listing}`,
						},
					],
					details: {
						command: params.command,
						killed: 0,
						candidates: hereRunning.map((c) => ({ command: c.command, session: c.session, cwd: c.cwd })),
					},
				};
			}
			return {
				content: [
					{
						type: "text" as const,
						text: `Killed ${killed.length} background task${killed.length === 1 ? "" : "s"}:\n${killed.map((c) => `- ${c.command} (session ${c.session})`).join("\n")}`,
					},
				],
				details: {
					command: params.command,
					killed: killed.length,
					sessions: killed.map((c) => c.session),
				},
			};
		},
	});

	pi.events.on("bg:editorUpEmpty", (data: unknown) => {
		const out = data as { handled: boolean };
		const ctx = latestCtx;
		if (!ctx?.hasUI || logViewerOpen) return;
		const here = runningForCwd(ctx.cwd);
		if (here.length === 0) return;
		out.handled = true;
		void (async () => {
			logViewerOpen = true;
			try {
				await showLogs(pi, ctx, here[0]!);
			} finally {
				logViewerOpen = false;
				await refreshRunning(pi, ctx);
			}
		})();
	});

	pi.registerCommand("bg", {
		description: "Start and manage tmux background commands in the current directory",
		handler: async (args, ctx) => {
			latestCtx = ctx;
			if (!tmuxAvailable()) {
				ctx.ui.notify("tmux is not installed. Install tmux to use /bg.", "error");
				return;
			}

			const directCommand = args.trim();
			if (directCommand) {
				await startBackgroundCommand(pi, ctx, directCommand);
				return;
			}

			while (true) {
				const selected = await showBgMenu(pi, ctx);
				if (!selected) break;
				if (selected.type === "new" || selected.type === "recent") {
					const prefill = selected.type === "recent" ? selected.command : "";
					ctx.ui.setEditorText(`/bg ${prefill}`);
					break;
				}
				if (selected.type === "running") {
					await showLogs(pi, ctx, selected.running);
					await refreshRunning(pi, ctx);
					continue;
				}
			}
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		latestCtx = ctx;
		if (!ctx.hasUI) return;
		await refreshRunning(pi, ctx);
		startPoller(pi);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		stopPoller();
		await killAllRunningCommands(pi, ctx);
		uninstallProcessHooks();
		if (ctx.hasUI) {
			ctx.ui.setWidget(WIDGET_ID, undefined);
			widgetInstalled = false;
		}
	});
}

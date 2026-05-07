// Command handlers for bg extension

import fs from "node:fs";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext, RunningCommand } from "./types.js";
import { META_DIR, LOG_DIR } from "./config.js";
import { exec, tmuxAvailable, makeSessionId, listRunningCommands } from "./tmux.js";
import { rememberCommand } from "./cache.js";
import { shellQuote } from "./utils.js";
import { killAllRunningCommands } from "./tmux.js";
import { refreshRunning } from "./polling.js";

/**
 * Start a background command
 */
export async function startBackgroundCommand(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	command: string,
	updateWidget: () => void,
): Promise<RunningCommand | undefined> {
	const trimmed = command.trim();
	if (!trimmed) {
		ctx.ui.notify("Background command cannot be empty.", "error");
		return undefined;
	}
	if (!tmuxAvailable()) {
		ctx.ui.notify("tmux is not installed. Install tmux to use /bg.", "error");
		return undefined;
	}

	fs.mkdirSync(META_DIR, { recursive: true });
	fs.mkdirSync(LOG_DIR, { recursive: true });

	const session = makeSessionId(ctx.cwd, trimmed);
	const logFile = path.join(LOG_DIR, `${session}.log`);
	const metadata: RunningCommand = {
		session,
		command: trimmed,
		cwd: ctx.cwd,
		logFile,
		startedAt: Date.now(),
	};
	fs.writeFileSync(path.join(META_DIR, `${session}.json`), JSON.stringify(metadata, null, "\t"), "utf8");

	const runScript = `cd ${shellQuote(ctx.cwd)} && exec bash -lc ${shellQuote(`${trimmed} 2>&1 | tee -a ${shellQuote(logFile)}`)}`;
	const result = await exec(pi, "tmux", ["new-session", "-d", "-s", session, "-c", ctx.cwd, "bash", "-lc", runScript], 10000);
	if (result.code !== 0) {
		try {
			fs.unlinkSync(path.join(META_DIR, `${session}.json`));
		} catch {}
		ctx.ui.notify((result.stderr || result.stdout || `Failed to start ${trimmed}`).trim(), "error");
		return undefined;
	}

	rememberCommand(ctx.cwd, trimmed);
	ctx.ui.notify(`Started: ${trimmed}\nSession: ${session}\nLogs: ${logFile}`, "info");
	await refreshRunning(pi, ctx, updateWidget);
	return metadata;
}

/**
 * Kill a running command
 */
export async function killRunningCommand(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	command: RunningCommand,
	updateWidget: () => void,
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
	await refreshRunning(pi, ctx, updateWidget);
	return true;
}

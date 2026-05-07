// tmux interaction for bg extension

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { RunningCommand, ExecResult, ExtensionAPI } from "./types.js";
import { META_DIR, LOG_DIR, SESSION_PREFIX } from "./config.js";

/**
 * Check if tmux is available
 */
export function tmuxAvailable(): boolean {
	const result = spawnSync("tmux", ["-V"], { stdio: "ignore" });
	return result.status === 0;
}

/**
 * Execute a command via the pi API
 */
export async function exec(pi: ExtensionAPI, command: string, args: string[], timeout = 8000): Promise<ExecResult> {
	return pi.exec(command, args, { timeout });
}

/**
 * List running background commands
 */
export async function listRunningCommands(pi: ExtensionAPI): Promise<RunningCommand[]> {
	if (!tmuxAvailable()) return [];
	const result = await exec(pi, "tmux", ["list-sessions", "-F", "#S"], 5000);
	if (result.code !== 0) return [];
	const sessions = result.stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.startsWith(SESSION_PREFIX));

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

/**
 * Kill a tmux session synchronously
 */
export function killSessionSync(session: string): void {
	spawnSync("tmux", ["kill-session", "-t", session], { stdio: "ignore", timeout: 3000 });
}

/**
 * Kill all running commands synchronously
 */
export function killAllRunningCommandsSync(): void {
	if (!tmuxAvailable()) return;
	const result = spawnSync("tmux", ["list-sessions", "-F", "#S"], { encoding: "utf8", timeout: 3000 });
	if (result.status !== 0 || !result.stdout) return;
	for (const line of result.stdout.split(/\r?\n/)) {
		const session = line.trim();
		if (session.startsWith(SESSION_PREFIX)) killSessionSync(session);
	}
}

/**
 * Kill all running commands asynchronously
 */
export async function killAllRunningCommands(pi: ExtensionAPI): Promise<void> {
	const commands = await listRunningCommands(pi);
	for (const command of commands) {
		await exec(pi, "tmux", ["kill-session", "-t", command.session], 5000).catch(() => undefined);
	}
}

/**
 * Generate a unique session ID
 */
export function makeSessionId(cwd: string, command: string): string {
	const hash = crypto
		.createHash("sha1")
		.update(`${cwd}|${command}|${Date.now()}|${Math.random()}`)
		.digest("hex")
		.slice(0, 8);
	return `${SESSION_PREFIX}${hash}`;
}

/**
 * Kill a running command
 */
export async function killRunningCommand(
	pi: ExtensionAPI,
	command: RunningCommand,
): Promise<boolean> {
	const result = await exec(pi, "tmux", ["kill-session", "-t", command.session], 5000);
	if (result.code !== 0 && !/can't find session/i.test(result.stderr)) {
		return false;
	}
	try {
		fs.unlinkSync(path.join(META_DIR, `${command.session}.json`));
	} catch {}
	return true;
}

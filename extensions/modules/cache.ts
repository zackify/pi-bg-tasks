// Cache management for bg extension

import fs from "node:fs";
import path from "node:path";
import { CACHE_PATH, RECENT_LIMIT } from "./config.js";
import type { Cache } from "./types.js";

/**
 * Load the cache from disk
 */
export function loadCache(): Cache {
	try {
		return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) as Cache;
	} catch {
		return { cwds: {} };
	}
}

/**
 * Save the cache to disk
 */
export function saveCache(cache: Cache): void {
	fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
	fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, "\t")}\n`, "utf8");
}

/**
 * Normalize a cwd path to a cache key
 */
export function cwdKey(cwd: string): string {
	try {
		return path.resolve(cwd);
	} catch {
		return cwd;
	}
}

/**
 * Get recent commands for a given cwd
 */
export function getRecentCommands(cwd: string): string[] {
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

/**
 * Remember a command for the given cwd
 */
export function rememberCommand(cwd: string, command: string): void {
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

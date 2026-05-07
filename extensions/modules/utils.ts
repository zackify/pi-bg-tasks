// Utility functions for bg extension

import path from "node:path";

/**
 * Quote a value for shell usage
 */
export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Truncate a string in the middle
 */
export function truncateMiddle(value: string, max = 80): string {
	if (value.length <= max) return value;
	const half = Math.floor((max - 1) / 2);
	return `${value.slice(0, half)}…${value.slice(value.length - half)}`;
}

/**
 * Get running commands filtered by cwd
 */
export function runningForCwd(cwd: string, running: { cwd: string }[]): { cwd: string }[] {
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

/**
 * Filter selectable items (exclude separators)
 */
export function selectableItems(items: { type: string }[]): number[] {
	return items.flatMap((item, index) => (item.type === "separator" ? [] : [index]));
}

/**
 * Move selection by delta
 */
export function moveSelection(items: { type: string }[], selected: number, delta: number): number {
	const selectable = selectableItems(items);
	if (selectable.length === 0) return 0;
	const current = Math.max(0, selectable.indexOf(selected));
	const next = Math.max(0, Math.min(selectable.length - 1, current + delta));
	return selectable[next]!;
}

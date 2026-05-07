import path from "node:path";

// Re-export utility functions so they can be tested independently
// These are the same implementations as in bg.ts

export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function truncateMiddle(value: string, max = 80): string {
	if (value.length <= max) return value;
	const half = Math.floor((max - 1) / 2);
	return `${value.slice(0, half)}…${value.slice(value.length - half)}`;
}

// Simple truncate function (for widget/menu use - replaces pi-tui's truncateToWidth which isn't available in all builds)
export function truncateToWidth(value: string, maxWidth: number, ellipsis = "…"): string {
	if (value.length <= maxWidth) return value;
	return value.slice(0, maxWidth - ellipsis.length) + ellipsis;
}

export type RunningCommand = {
	session: string;
	command: string;
	cwd: string;
	logFile: string;
	startedAt: number;
};

export type MenuItem =
	| { type: "new"; label: string }
	| { type: "recent"; command: string }
	| { type: "running"; running: RunningCommand }
	| { type: "separator"; label: string };

export function runningForCwd(cwd: string, running: RunningCommand[]): RunningCommand[] {
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

export function selectableItems(items: MenuItem[]): number[] {
	return items.flatMap((item, index) => (item.type === "separator" ? [] : [index]));
}

export function moveSelection(items: MenuItem[], selected: number, delta: number): number {
	const selectable = selectableItems(items);
	if (selectable.length === 0) return 0;
	const current = Math.max(0, selectable.indexOf(selected));
	const next = Math.max(0, Math.min(selectable.length - 1, current + delta));
	return selectable[next]!;
}

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
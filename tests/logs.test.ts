import { describe, it, expect, beforeEach, mock } from "bun:test";

// Track intervals for cleanup
const intervals: NodeJS.Timeout[] = [];
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;

globalThis.setInterval = ((fn: any, ms?: number) => {
	const t = originalSetInterval(fn, ms) as NodeJS.Timeout;
	intervals.push(t);
	return t;
}) as typeof setInterval;

globalThis.clearInterval = ((t: NodeJS.Timeout) => {
	originalClearInterval(t);
	const idx = intervals.indexOf(t);
	if (idx > -1) intervals.splice(idx, 1);
}) as typeof clearInterval;

const mockExec = mock(async () => ({ code: 0, stdout: "", stderr: "" }));

mock.module("@mariozechner/pi-tui", () => ({
	Key: { up: "up", down: "down", enter: "enter", escape: "escape" },
	matchesKey: mock((d: string, k: any) => d === k),
	truncateToWidth: mock((s: string) => s),
	Text: class {
		constructor(text: string, x: number, y: number) {
			this.text = text;
		}
		text: string = "";
		render() {
			return [this.text];
		}
	},
}));

mock.module("@mariozechner/pi-coding-agent", () => ({
	DynamicBorder: class {
		constructor(color?: (s: string) => string) {
			this.colorFn = color;
		}
		colorFn: (s: string) => string = (s) => s;
		render() {
			return [this.colorFn("─".repeat(40))];
		}
	},
}));

import { readLogs, showLogs } from "../extensions/modules/logs.ts";

describe("logs module", () => {
	beforeEach(() => {
		intervals.forEach((t) => originalClearInterval(t));
		intervals.length = 0;
		mockExec.mockReset().mockImplementation(async () => ({ code: 0, stdout: "log line 1\nlog line 2", stderr: "" }));
	});

	describe("readLogs", () => {
		it("should read log file with tail command", async () => {
			const command = { session: "test", command: "cmd", cwd: "/test", logFile: "/log/test.log", startedAt: 1 };
			await readLogs({ exec: mockExec } as any, command);
			expect(mockExec).toHaveBeenCalled();
		});

		it("should return stderr on error", async () => {
			mockExec.mockImplementation(async () => ({ code: 1, stdout: "", stderr: "No such file" }));
			const command = { session: "test", command: "cmd", cwd: "/test", logFile: "/log/test.log", startedAt: 1 };
			const result = await readLogs({ exec: mockExec } as any, command);
			expect(result).toBe("No such file");
		});

		it("should return default message when no output", async () => {
			mockExec.mockImplementation(async () => ({ code: 0, stdout: "", stderr: "" }));
			const command = { session: "test", command: "cmd", cwd: "/test", logFile: "/log/test.log", startedAt: 1 };
			const result = await readLogs({ exec: mockExec } as any, command);
			expect(result).toBe("No log output yet.");
		});

		it("should respect custom line count", async () => {
			const command = { session: "test", command: "cmd", cwd: "/test", logFile: "/log/test.log", startedAt: 1 };
			await readLogs({ exec: mockExec } as any, command, 50);
			expect(mockExec).toHaveBeenCalledWith("tail", expect.arrayContaining(["-n", "50"]), { timeout: 5000 });
		});
	});

	describe("showLogs", () => {
		it("should create log viewer UI", async () => {
			let component: any;
			const custom = mock(async <T>(fn: (tui: any, theme: any, kb: any, done: (r: T) => void) => any) => {
				component = fn(
					{ requestRender: mock(() => {}), stop: mock(() => {}), start: mock(() => {}) },
					{ fg: (c: string, t: string) => t, bold: (t: string) => t, dim: (t: string) => t },
					{},
					mock(() => {}),
				);
				return component;
			});

			const ctx = {
				cwd: "/test",
				hasUI: true,
				ui: { custom },
			} as any;

			const command = { session: "test", command: "npm test", cwd: "/test", logFile: "/log/test.log", startedAt: 1 };

			await showLogs({ exec: mockExec } as any, ctx, command, mock(async () => true), mock(async () => {}));

			expect(custom).toHaveBeenCalled();
			expect(component).toBeDefined();
			expect(typeof component.render).toBe("function");
			expect(typeof component.handleInput).toBe("function");
		});

		it("should render log lines", async () => {
			let component: any;
			const custom = mock(async <T>(fn: (tui: any, theme: any, kb: any, done: (r: T) => void) => any) => {
				component = fn(
					{ requestRender: mock(() => {}), stop: mock(() => {}), start: mock(() => {}) },
					{ fg: (c: string, t: string) => t, bold: (t: string) => t, dim: (t: string) => t },
					{},
					mock(() => {}),
				);
				return component;
			});

			const ctx = {
				cwd: "/test",
				hasUI: true,
				ui: { custom },
			} as any;

			const command = { session: "test", command: "npm test", cwd: "/test", logFile: "/log/test.log", startedAt: 1 };

			await showLogs({ exec: mockExec } as any, ctx, command, mock(async () => true), mock(async () => {}));

			const lines = component.render(80);
			expect(lines.length).toBeGreaterThan(0);
		});

		it("should handle k to kill command", async () => {
			let component: any;
			const custom = mock(async <T>(fn: (tui: any, theme: any, kb: any, done: (r: T) => void) => any) => {
				component = fn(
					{ requestRender: mock(() => {}), stop: mock(() => {}), start: mock(() => {}) },
					{ fg: (c: string, t: string) => t, bold: (t: string) => t, dim: (t: string) => t },
					{},
					mock(() => {}),
				);
				return component;
			});

			const ctx = {
				cwd: "/test",
				hasUI: true,
				ui: { custom },
			} as any;

			const command = { session: "test", command: "npm test", cwd: "/test", logFile: "/log/test.log", startedAt: 1 };
			const killCommand = mock(async () => true);

			await showLogs({ exec: mockExec } as any, ctx, command, killCommand, mock(async () => {}));

			component.handleInput("k");
			expect(killCommand).toHaveBeenCalled();
		});

		it("should handle a to attach", async () => {
			let component: any;
			const custom = mock(async <T>(fn: (tui: any, theme: any, kb: any, done: (r: T) => void) => any) => {
				component = fn(
					{ requestRender: mock(() => {}), stop: mock(() => {}), start: mock(() => {}) },
					{ fg: (c: string, t: string) => t, bold: (t: string) => t, dim: (t: string) => t },
					{},
					mock(() => {}),
				);
				return component;
			});

			const ctx = {
				cwd: "/test",
				hasUI: true,
				ui: { custom },
			} as any;

			const command = { session: "test", command: "npm test", cwd: "/test", logFile: "/log/test.log", startedAt: 1 };
			const attachCommand = mock(async () => {});

			await showLogs({ exec: mockExec } as any, ctx, command, mock(async () => true), attachCommand);

			component.handleInput("a");
			expect(attachCommand).toHaveBeenCalled();
		});

		it("should start polling for log updates", async () => {
			let component: any;
			const custom = mock(async <T>(fn: (tui: any, theme: any, kb: any, done: (r: T) => void) => any) => {
				component = fn(
					{ requestRender: mock(() => {}), stop: mock(() => {}), start: mock(() => {}) },
					{ fg: (c: string, t: string) => t, bold: (t: string) => t, dim: (t: string) => t },
					{},
					mock(() => {}),
				);
				return component;
			});

			const ctx = {
				cwd: "/test",
				hasUI: true,
				ui: { custom },
			} as any;

			const command = { session: "test", command: "npm test", cwd: "/test", logFile: "/log/test.log", startedAt: 1 };

			await showLogs({ exec: mockExec } as any, ctx, command, mock(async () => true), mock(async () => {}));

			// An interval should have been created for polling
			expect(intervals.length).toBe(1);
		});
	});
});

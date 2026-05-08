import { describe, it, expect, beforeEach, mock } from "bun:test";

const mockExec = mock(async () => ({ code: 0, stdout: "", stderr: "" }));

mock.module("@earendil-works/pi-tui", () => ({
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

mock.module("@earendil-works/pi-coding-agent", () => ({
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

import { startBackgroundCommand, killRunningCommand } from "../extensions/modules/commands.ts";

describe("commands module", () => {
	beforeEach(() => {
		mockExec.mockReset().mockImplementation(async () => ({ code: 0, stdout: "", stderr: "" }));
	});

	describe("startBackgroundCommand", () => {
		it("should be defined", () => {
			expect(typeof startBackgroundCommand).toBe("function");
		});

		it("should reject empty command", async () => {
			const notify = mock(() => {});
			const ctx = {
				cwd: "/test",
				hasUI: true,
				ui: { notify },
			} as any;

			const result = await startBackgroundCommand({} as any, ctx, "", () => {});

			expect(result).toBeUndefined();
			expect(notify).toHaveBeenCalledWith("Background command cannot be empty.", "error");
		});
	});

	describe("killRunningCommand", () => {
		it("should be defined", () => {
			expect(typeof killRunningCommand).toBe("function");
		});

		it("should kill session on success", async () => {
			const notify = mock(() => {});
			const ctx = {
				cwd: "/test",
				hasUI: true,
				ui: { notify },
			} as any;
			const command = { session: "test", command: "cmd", cwd: "/test", logFile: "/log", startedAt: 1 };

			const result = await killRunningCommand({ exec: mockExec } as any, ctx, command, () => {});

			expect(result).toBe(true);
			expect(mockExec).toHaveBeenCalledWith("tmux", ["kill-session", "-t", "test"], { timeout: 5000 });
		});
	});
});

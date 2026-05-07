import { describe, it, expect, beforeEach, mock } from "bun:test";

const mockSpawnSync = mock(() => ({ status: 0, stdout: "", stderr: "" }));
const mockReadFileSync = mock(() => "{}");
const mockExec = mock(async () => ({ code: 0, stdout: "", stderr: "" }));

mock.module("node:child_process", () => ({
	spawnSync: mockSpawnSync,
}));

mock.module("node:fs", () => ({
	readFileSync: mockReadFileSync,
}));

mock.module("@mariozechner/pi-tui", () => ({
	DynamicBorder: class { render() { return ["─".repeat(40)]; } },
	Text: class { render() { return ["text"]; } },
	Key: { up: "up", down: "down", enter: "enter", escape: "escape" },
	matchesKey: mock((d: string, k: any) => d === k || d === "arrowup" || d === "arrowdown"),
	truncateToWidth: mock((s: string) => s),
}));

mock.module("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: {},
	ExtensionCommandContext: {},
	ExtensionContext: {},
	DynamicBorder: class { render() { return ["─".repeat(40)]; } },
}));

import { exec, listRunningCommands, killAllRunningCommands } from "../extensions/modules/tmux.ts";

describe("tmux module", () => {
	beforeEach(() => {
		mockSpawnSync.mockReset().mockImplementation(() => ({ status: 0, stdout: "", stderr: "" }));
		mockExec.mockReset().mockImplementation(async () => ({ code: 0, stdout: "", stderr: "" }));
		mockReadFileSync.mockReset().mockImplementation(() => "{}");
	});

	describe("exec", () => {
		it("should call pi.exec with correct args", async () => {
			const mockPi = { exec: mock(async () => ({ code: 0, stdout: "test", stderr: "" })) };
			await exec(mockPi as any, "tmux", ["list-sessions"], 5000);
			expect(mockPi.exec).toHaveBeenCalledWith("tmux", ["list-sessions"], { timeout: 5000 });
		});

		it("should use default timeout", async () => {
			const mockPi = { exec: mock(async () => ({ code: 0, stdout: "test", stderr: "" })) };
			await exec(mockPi as any, "tmux", ["list-sessions"]);
			expect(mockPi.exec).toHaveBeenCalledWith("tmux", ["list-sessions"], { timeout: 8000 });
		});
	});

	describe("listRunningCommands", () => {
		it("should return empty when tmux not available", async () => {
			mockSpawnSync.mockImplementation(() => ({ status: 1 }));
			const mockPi = { exec: mock(async () => ({ code: 0, stdout: "", stderr: "" })) };
			const result = await listRunningCommands(mockPi as any);
			expect(result).toEqual([]);
		});

		it("should return empty when list-sessions fails", async () => {
			mockSpawnSync.mockImplementation(() => ({ status: 0 }));
			mockExec.mockImplementation(async () => ({ code: 1, stdout: "", stderr: "error" }));
			const mockPi = { exec: mockExec } as any;
			const result = await listRunningCommands(mockPi);
			expect(result).toEqual([]);
		});

		it("should handle missing metadata file", async () => {
			mockSpawnSync.mockImplementation(() => ({ status: 0 }));
			mockExec.mockImplementation(async () => ({ code: 0, stdout: "pi-bg-no-meta", stderr: "" }));
			mockReadFileSync.mockImplementation(() => {
				throw new Error("ENOENT");
			});
			const mockPi = { exec: mockExec } as any;
			const result = await listRunningCommands(mockPi);
			expect(result.length).toBe(1);
			expect(result[0]?.session).toBe("pi-bg-no-meta");
		});

		it("should filter non pi-bg sessions", async () => {
			mockSpawnSync.mockImplementation(() => ({ status: 0 }));
			mockExec.mockImplementation(async () => ({
				code: 0,
				stdout: "other-session\npi-bg-valid\nanother-session",
				stderr: "",
			}));
			mockReadFileSync.mockImplementation((path: string) => {
				if (path.includes("valid")) {
					return JSON.stringify({ session: "pi-bg-valid", command: "test", cwd: "/t", logFile: "/l", startedAt: 1 });
				}
				return "{}";
			});
			const mockPi = { exec: mockExec } as any;
			const result = await listRunningCommands(mockPi);
			expect(result.length).toBe(1);
			expect(result[0]?.session).toBe("pi-bg-valid");
		});
	});

	describe("killAllRunningCommands", () => {
		it("should kill all running commands", async () => {
			mockSpawnSync.mockImplementation(() => ({ status: 0 }));
			mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
				if (args.includes("list-sessions")) {
					return { code: 0, stdout: "pi-bg-cmd1\npi-bg-cmd2", stderr: "" };
				}
				return { code: 0, stdout: "", stderr: "" };
			});
			const mockPi = { exec: mockExec } as any;
			await killAllRunningCommands(mockPi);
			expect(mockExec).toHaveBeenCalledWith("tmux", ["kill-session", "-t", "pi-bg-cmd1"], { timeout: 5000 });
			expect(mockExec).toHaveBeenCalledWith("tmux", ["kill-session", "-t", "pi-bg-cmd2"], { timeout: 5000 });
		});

		it("should handle exec errors gracefully", async () => {
			mockSpawnSync.mockImplementation(() => ({ status: 0 }));
			mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
				if (args.includes("list-sessions")) {
					return { code: 0, stdout: "pi-bg-cmd1", stderr: "" };
				}
				// Return error result instead of throwing
				return { code: 1, stdout: "", stderr: "Session not found" };
			});
			const mockPi = { exec: mockExec } as any;
			// Should not throw because killAllRunningCommands catches errors
			await killAllRunningCommands(mockPi);
		});
	});
});

import { describe, it, expect, beforeEach, mock } from "bun:test";

const mockSpawnSync = mock(() => ({ status: 0, stdout: "", stderr: "" }));
const mockReadFileSync = mock(() => "{}");

mock.module("node:child_process", () => ({
	spawnSync: mockSpawnSync,
}));

mock.module("node:fs", () => ({
	readFileSync: mockReadFileSync,
}));

import {
	tmuxAvailable,
	killSessionSync,
	makeSessionId,
} from "../extensions/modules/tmux.ts";

describe("tmux module", () => {
	beforeEach(() => {
		mockSpawnSync.mockReset().mockImplementation(() => ({ status: 0, stdout: "", stderr: "" }));
	});

	describe("tmuxAvailable", () => {
		it("should return true when tmux is installed", () => {
			mockSpawnSync.mockImplementation(() => ({ status: 0 }));
			expect(tmuxAvailable()).toBe(true);
		});

		it("should return false when tmux is not installed", () => {
			mockSpawnSync.mockImplementation(() => ({ status: 1 }));
			expect(tmuxAvailable()).toBe(false);
		});
	});

	describe("killSessionSync", () => {
		it("should call tmux kill-session", () => {
			killSessionSync("test-session");
			expect(mockSpawnSync).toHaveBeenCalledWith(
				"tmux",
				["kill-session", "-t", "test-session"],
				expect.objectContaining({ stdio: "ignore", timeout: 3000 }),
			);
		});
	});

	describe("makeSessionId", () => {
		it("should generate session id with pi-bg prefix", () => {
			const id = makeSessionId("/test", "npm test");
			expect(id.startsWith("pi-bg-")).toBe(true);
		});

		it("should generate unique ids", () => {
			const id1 = makeSessionId("/test", "npm test");
			const id2 = makeSessionId("/test", "npm test");
			expect(id1).not.toBe(id2);
		});

		it("should generate 8 character hash", () => {
			const id = makeSessionId("/test", "npm test");
			const hash = id.replace("pi-bg-", "");
			expect(hash.length).toBe(8);
		});
	});
});

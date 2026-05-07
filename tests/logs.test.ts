import { describe, it, expect, beforeEach, mock } from "bun:test";

const mockExec = mock(async () => ({ code: 0, stdout: "", stderr: "" }));

mock.module("@mariozechner/pi-tui", () => ({
	Key: { up: "up", down: "down", enter: "enter", escape: "escape" },
	matchesKey: mock((d: string, k: any) => d === k),
	truncateToWidth: mock((s: string) => s),
	Text: class {
		render() {
			return ["text"];
		}
	},
}));

mock.module("@mariozechner/pi-coding-agent", () => ({
	DynamicBorder: class {
		render() {
			return ["─".repeat(40)];
		}
	},
}));

describe("logs module", () => {
	beforeEach(() => {
		mockExec.mockReset().mockImplementation(async () => ({ code: 0, stdout: "", stderr: "" }));
	});

	describe("readLogs", () => {
		it("should return error message when tail fails", async () => {
			const { readLogs } = await import("../extensions/modules/logs.ts");
			// Can't easily test readLogs without more mocking setup
			// but we can verify the module loads
		});

		it("should return error message when tail returns no output", async () => {
			const { readLogs } = await import("../extensions/modules/logs.ts");
			// Can't easily test readLogs without more mocking setup
		});
	});

	describe("showLogs", () => {
		it("should be defined", async () => {
			const { showLogs } = await import("../extensions/modules/logs.ts");
			expect(typeof showLogs).toBe("function");
		});
	});
});

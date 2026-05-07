import { describe, it, expect } from "bun:test";

describe("commands module", () => {
	describe("startBackgroundCommand", () => {
		it("should be defined", async () => {
			const { startBackgroundCommand } = await import("../extensions/modules/commands.ts");
			expect(typeof startBackgroundCommand).toBe("function");
		});
	});

	describe("killRunningCommand", () => {
		it("should be defined", async () => {
			const { killRunningCommand } = await import("../extensions/modules/commands.ts");
			expect(typeof killRunningCommand).toBe("function");
		});
	});
});

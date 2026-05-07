import { describe, it, expect } from "bun:test";

describe("widget module", () => {
	describe("updateWidget", () => {
		it("should be defined", async () => {
			const { updateWidget } = await import("../extensions/modules/widget.ts");
			expect(typeof updateWidget).toBe("function");
		});

		it("should return false when no context", async () => {
			const { updateWidget } = await import("../extensions/modules/widget.ts");
			const result = updateWidget(undefined, [], false, () => {});
			expect(result).toBe(false);
		});

		it("should return false when context has no UI", async () => {
			const { updateWidget } = await import("../extensions/modules/widget.ts");
			const ctx = { cwd: "/test" } as any;
			const result = updateWidget(ctx, [], false, () => {});
			expect(result).toBe(false);
		});
	});
});

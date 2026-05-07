import { describe, it, expect } from "bun:test";
import { truncateMiddle } from "../extensions/modules/utils.ts";

describe("utils module", () => {
	describe("truncateMiddle", () => {
		it("should handle empty string", () => {
			expect(truncateMiddle("", 10)).toBe("");
		});

		it("should handle max of 1", () => {
			expect(truncateMiddle("hello", 1)).toBe("…");
		});

		it("should handle max of 2", () => {
			const result = truncateMiddle("abc", 2);
			expect(result.length).toBeLessThanOrEqual(2);
		});

		it("should handle max values", () => {
			const result = truncateMiddle("hello world", 11);
			// If the string is exactly at max, it won't be truncated
			if (result === "hello world") {
				expect(result).toBe("hello world");
			} else {
				expect(result).toContain("…");
			}
		});
	});
});

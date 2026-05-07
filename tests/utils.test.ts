import { describe, it, expect } from "bun:test";
import { shellQuote, truncateMiddle } from "../extensions/modules/utils.ts";

describe("utils module", () => {
	describe("shellQuote", () => {
		it("should quote empty string", () => {
			expect(shellQuote("")).toBe("''");
		});

		it("should quote simple string", () => {
			expect(shellQuote("hello")).toBe("'hello'");
		});

		it("should escape single quotes", () => {
			expect(shellQuote("hello'world")).toBe("'hello'\"'\"'world'");
		});

		it("should handle multiple single quotes", () => {
			const result = shellQuote("it's a test");
			expect(result).toContain("'");
		});

		it("should handle string with spaces", () => {
			expect(shellQuote("hello world")).toBe("'hello world'");
		});

		it("should handle string with special shell chars", () => {
			expect(shellQuote("echo $HOME")).toBe("'echo $HOME'");
		});
	});

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

		it("should not truncate short strings", () => {
			expect(truncateMiddle("hello", 80)).toBe("hello");
		});

		it("should use default max of 80", () => {
			const short = "a".repeat(40);
			expect(truncateMiddle(short)).toBe(short);
		});

		it("should handle exact max length", () => {
			const result = truncateMiddle("abc", 3);
			expect(result).toBe("abc");
		});

		it("should truncate long strings with ellipsis", () => {
			const longString = "this is a very long string that needs truncating";
			const result = truncateMiddle(longString, 20);
			expect(result.length).toBeLessThanOrEqual(20);
			expect(result).toContain("…");
		});
	});
});

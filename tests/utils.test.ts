import { describe, it, expect } from "bun:test";
import { shellQuote, truncateMiddle, runningForCwd, selectableItems, moveSelection } from "../extensions/modules/utils.ts";

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

		it("should handle string with only single quotes", () => {
			// Three single quotes: each needs to be escaped
			const result = shellQuote("'''");
			expect(result).not.toContain("'''"); // Should not have three consecutive quotes
			expect(result).toContain("'"); // But should still have some quotes
		});

		it("should handle string with spaces", () => {
			expect(shellQuote("hello world")).toBe("'hello world'");
		});

		it("should handle string with special shell chars", () => {
			expect(shellQuote("echo $HOME")).toBe("'echo $HOME'");
		});
	});

	describe("truncateMiddle", () => {
		it("should return string unchanged if shorter than max", () => {
			expect(truncateMiddle("hello", 80)).toBe("hello");
		});

		it("should return string unchanged if equal to max", () => {
			expect(truncateMiddle("hello", 5)).toBe("hello");
		});

		it("should truncate long string", () => {
			const result = truncateMiddle("hello world this is a long string", 15);
			expect(result.length).toBeLessThanOrEqual(15);
			expect(result).toContain("…");
		});

		it("should use default max of 80", () => {
			const short = "a".repeat(40);
			expect(truncateMiddle(short)).toBe(short);
		});

		it("should truncate at boundaries correctly", () => {
			const result = truncateMiddle("abcdefghij", 8);
			expect(result).toMatch(/^.{3}….{3}$/);
		});
	});

	describe("runningForCwd", () => {
		it("should return empty array for empty running list", () => {
			const result = runningForCwd("/test", []);
			expect(result).toEqual([]);
		});

		it("should filter commands by cwd", () => {
			const running = [
				{ cwd: "/project1" },
				{ cwd: "/project2" },
				{ cwd: "/project1" },
			];
			const result = runningForCwd("/project1", running);
			expect(result.length).toBe(2);
		});

		it("should handle empty cwd in command", () => {
			const running = [
				{ cwd: "/project" },
				{ cwd: "" },
			];
			const result = runningForCwd("/project", running);
			expect(result.length).toBe(1);
		});

		it("should resolve paths correctly", () => {
			const running = [
				{ cwd: "/project" },
			];
			const result = runningForCwd("/project", running);
			expect(result.length).toBe(1);
		});
	});

	describe("selectableItems", () => {
		it("should return empty array for empty items", () => {
			const result = selectableItems([]);
			expect(result).toEqual([]);
		});

		it("should exclude separators from selection", () => {
			const items = [
				{ type: "new" },
				{ type: "separator" },
				{ type: "recent" },
			];
			const result = selectableItems(items);
			expect(result).toEqual([0, 2]);
		});

		it("should return all indices when no separators", () => {
			const items = [
				{ type: "new" },
				{ type: "recent" },
				{ type: "running" },
			];
			const result = selectableItems(items);
			expect(result).toEqual([0, 1, 2]);
		});

		it("should handle all separators", () => {
			const items = [
				{ type: "separator" },
				{ type: "separator" },
				{ type: "separator" },
			];
			const result = selectableItems(items);
			expect(result).toEqual([]);
		});
	});

	describe("moveSelection", () => {
		it("should return 0 for empty items", () => {
			const result = moveSelection([], 0, 1);
			expect(result).toBe(0);
		});

		it("should move down", () => {
			const items = [
				{ type: "new" },
				{ type: "recent" },
				{ type: "running" },
			];
			const result = moveSelection(items, 0, 1);
			expect(result).toBe(1);
		});

		it("should move up", () => {
			const items = [
				{ type: "new" },
				{ type: "recent" },
				{ type: "running" },
			];
			const result = moveSelection(items, 2, -1);
			expect(result).toBe(1);
		});

		it("should skip separators", () => {
			const items = [
				{ type: "new" },
				{ type: "separator" },
				{ type: "recent" },
				{ type: "separator" },
				{ type: "running" },
			];
			const result = moveSelection(items, 0, 1);
			expect(result).toBe(2); // Skip separator, go to index 2
		});

		it("should clamp to first item at top boundary", () => {
			const items = [
				{ type: "new" },
				{ type: "recent" },
			];
			const result = moveSelection(items, 0, -1);
			expect(result).toBe(0);
		});

		it("should clamp to last item at bottom boundary", () => {
			const items = [
				{ type: "new" },
				{ type: "recent" },
			];
			const result = moveSelection(items, 1, 1);
			expect(result).toBe(1);
		});
	});
});

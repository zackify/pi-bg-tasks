import { describe, it, expect } from "bun:test";
import { 
  shellQuote, 
  truncateMiddle, 
  truncateToWidth, 
  runningForCwd, 
  selectableItems, 
  moveSelection, 
  buildMenuItems,
  type MenuItem,
  type RunningCommand
} from "../extensions/bg-utils.ts";

describe("bg-utils", () => {
  describe("shellQuote", () => {
    it("wraps string in single quotes", () => {
      expect(shellQuote("hello")).toBe("'hello'");
    });

    it("escapes single quotes by alternating patterns", () => {
      expect(shellQuote("don't")).toBe("'don'\"'\"'t'");
    });

    it("handles empty string", () => {
      expect(shellQuote("")).toBe("''");
    });

    it("handles string with multiple single quotes", () => {
      expect(shellQuote("it's a test")).toBe("'it'\"'\"'s a test'");
    });

    it("handles string with no single quotes", () => {
      expect(shellQuote("hello world")).toBe("'hello world'");
    });
  });

  describe("truncateMiddle", () => {
    it("returns short strings unchanged", () => {
      expect(truncateMiddle("hello")).toBe("hello");
    });

    it("returns string at max length unchanged", () => {
      expect(truncateMiddle("hello", 5)).toBe("hello");
    });

    it("truncates long strings with ellipsis", () => {
      // "hello world" (11 chars) truncated to 8 -> "hel…rld" (8 chars with ellipsis)
      expect(truncateMiddle("hello world", 8)).toBe("hel…rld");
    });

    it("uses custom max length", () => {
      // "hello world" (11 chars) truncated to 6 -> "he…ld"
      expect(truncateMiddle("hello world", 6)).toBe("he…ld");
    });

    it("handles very long strings", () => {
      const long = "a".repeat(100);
      const result = truncateMiddle(long, 20);
      // With max=20, we get floor((20-1)/2) = 9 chars on each side + 1 ellipsis = 19 chars
      expect(result.length).toBe(19);
      expect(result.includes("…")).toBe(true);
    });

    it("handles empty string", () => {
      expect(truncateMiddle("")).toBe("");
    });

    it("handles string with exactly one character over max", () => {
      // "abcd" (4 chars) truncated to 3 -> "a…d"
      expect(truncateMiddle("abcd", 3)).toBe("a…d");
    });
  });

  describe("truncateToWidth", () => {
    it("returns short strings unchanged", () => {
      expect(truncateToWidth("hello", 10)).toBe("hello");
    });

    it("returns string at max width unchanged", () => {
      expect(truncateToWidth("hello", 5)).toBe("hello");
    });

    it("truncates long strings", () => {
      expect(truncateToWidth("hello world", 8)).toBe("hello w…");
    });

    it("uses custom ellipsis", () => {
      expect(truncateToWidth("hello world", 8, "...")).toBe("hello...");
    });

    it("handles empty string", () => {
      expect(truncateToWidth("", 10)).toBe("");
    });

    it("handles zero width", () => {
      expect(truncateToWidth("hello", 0)).toBe("hell…"); // At least the ellipsis
    });
  });

  describe("runningForCwd", () => {
    it("returns empty array when no running commands", () => {
      expect(runningForCwd("/test", [])).toEqual([]);
    });

    it("filters commands by cwd", () => {
      const commands: RunningCommand[] = [
        { session: "s1", command: "cmd1", cwd: "/test", logFile: "/l1", startedAt: 1 },
        { session: "s2", command: "cmd2", cwd: "/other", logFile: "/l2", startedAt: 2 },
      ];
      const result = runningForCwd("/test", commands);
      expect(result.length).toBe(1);
      expect(result[0].session).toBe("s1");
    });

    it("filters commands with similar but different cwd paths", () => {
      const commands: RunningCommand[] = [
        { session: "s1", command: "cmd1", cwd: "/test", logFile: "/l1", startedAt: 1 },
        { session: "s2", command: "cmd2", cwd: "/testing", logFile: "/l2", startedAt: 2 },
      ];
      const result = runningForCwd("/test", commands);
      expect(result.length).toBe(1);
    });

    it("returns empty for commands with empty cwd", () => {
      const commands: RunningCommand[] = [
        { session: "s1", command: "cmd1", cwd: "", logFile: "/l1", startedAt: 1 },
      ];
      expect(runningForCwd("/test", commands)).toEqual([]);
    });

    it("handles commands with same cwd path", () => {
      const commands: RunningCommand[] = [
        { session: "s1", command: "cmd1", cwd: "/test", logFile: "/l1", startedAt: 1 },
        { session: "s2", command: "cmd2", cwd: "/test", logFile: "/l2", startedAt: 2 },
      ];
      const result = runningForCwd("/test", commands);
      expect(result.length).toBe(2);
    });
  });

  describe("selectableItems", () => {
    it("returns indices of non-separator items", () => {
      const items: MenuItem[] = [
        { type: "separator", label: "sep" },
        { type: "new", label: "New" },
        { type: "separator", label: "sep" },
        { type: "recent", command: "cmd" },
      ];
      expect(selectableItems(items)).toEqual([1, 3]);
    });

    it("returns empty array for separator-only menu", () => {
      const items: MenuItem[] = [
        { type: "separator", label: "sep1" },
        { type: "separator", label: "sep2" },
      ];
      expect(selectableItems(items)).toEqual([]);
    });

    it("returns all indices for menu without separators", () => {
      const items: MenuItem[] = [
        { type: "new", label: "New" },
        { type: "recent", command: "cmd" },
      ];
      expect(selectableItems(items)).toEqual([0, 1]);
    });

    it("handles empty menu", () => {
      expect(selectableItems([])).toEqual([]);
    });
  });

  describe("moveSelection", () => {
    it("returns 0 for empty menu", () => {
      expect(moveSelection([], 0, 1)).toBe(0);
    });

    it("moves selection down", () => {
      const items: MenuItem[] = [
        { type: "new", label: "New" },
        { type: "recent", command: "cmd1" },
        { type: "recent", command: "cmd2" },
      ];
      expect(moveSelection(items, 0, 1)).toBe(1);
    });

    it("moves selection up", () => {
      const items: MenuItem[] = [
        { type: "new", label: "New" },
        { type: "recent", command: "cmd1" },
      ];
      expect(moveSelection(items, 1, -1)).toBe(0);
    });

    it("respects separators in navigation", () => {
      const items: MenuItem[] = [
        { type: "separator", label: "sep" },
        { type: "new", label: "New" },
      ];
      expect(moveSelection(items, 1, -1)).toBe(1); // Can't go before first selectable
    });

    it("returns first item when moving up from first selectable", () => {
      const items: MenuItem[] = [
        { type: "new", label: "New" },
        { type: "separator", label: "sep" },
        { type: "recent", command: "cmd" },
      ];
      expect(moveSelection(items, 0, -1)).toBe(0); // Already at first selectable
    });

    it("handles large delta", () => {
      const items: MenuItem[] = [
        { type: "new", label: "New" },
        { type: "recent", command: "cmd1" },
        { type: "recent", command: "cmd2" },
      ];
      expect(moveSelection(items, 0, 100)).toBe(2); // Clamped to last
    });
  });

  describe("buildMenuItems", () => {
    it("builds menu with running commands first", () => {
      const running: RunningCommand[] = [
        { session: "s1", command: "cmd1", cwd: "/test", logFile: "/l", startedAt: 1 },
      ];
      const result = buildMenuItems([], running);
      expect(result[0]).toEqual({ type: "separator", label: "running" });
      expect(result[1]).toEqual({ type: "running", running: running[0] });
    });

    it("builds menu with recent commands", () => {
      const result = buildMenuItems(["npm test", "ls"], []);
      // Structure: new, separator(recent), recent(npm test), recent(ls) = 4 items
      expect(result.length).toBe(4);
      expect(result[0]).toEqual({ type: "new", label: "New command…" });
      expect(result[1]).toEqual({ type: "separator", label: "recent" });
      expect(result[2]).toEqual({ type: "recent", command: "npm test" });
      expect(result[3]).toEqual({ type: "recent", command: "ls" });
    });

    it("builds menu with both running and recent", () => {
      const running: RunningCommand[] = [
        { session: "s1", command: "npm run", cwd: "/test", logFile: "/l", startedAt: 1 },
      ];
      const result = buildMenuItems(["npm test"], running);
      expect(result.length).toBe(5);
      expect(result[0]).toEqual({ type: "separator", label: "running" });
      expect(result[2]).toEqual({ type: "new", label: "New command…" });
      expect(result[3]).toEqual({ type: "separator", label: "recent" });
    });

    it("builds minimal menu with just new command when no recents or running", () => {
      const result = buildMenuItems([], []);
      expect(result).toEqual([{ type: "new", label: "New command…" }]);
    });

    it("skips recent separator when no recent commands", () => {
      const result = buildMenuItems([], [{ session: "s1", command: "cmd", cwd: "/t", logFile: "/l", startedAt: 1 }]);
      // Should have: separator(running), running, separator(recent)?, new
      // No recent separator since no recents
      expect(result[0]).toEqual({ type: "separator", label: "running" });
      expect(result[2]).toEqual({ type: "new", label: "New command…" });
    });
  });
});
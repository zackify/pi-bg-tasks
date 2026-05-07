import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// Track intervals for cleanup
const intervals: NodeJS.Timeout[] = [];
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;

globalThis.setInterval = ((fn: any, ms?: number) => {
	const t = originalSetInterval(fn, ms) as NodeJS.Timeout;
	intervals.push(t);
	return t;
}) as typeof setInterval;

globalThis.clearInterval = ((t: NodeJS.Timeout) => {
	originalClearInterval(t);
	const idx = intervals.indexOf(t);
	if (idx > -1) intervals.splice(idx, 1);
}) as typeof clearInterval;

import * as state from "../extensions/modules/state.ts";
import { startPoller, stopPoller } from "../extensions/modules/polling.ts";

describe("polling module", () => {
	beforeEach(() => {
		state.resetState();
		intervals.forEach((t) => originalClearInterval(t));
		intervals.length = 0;
	});

	afterEach(() => {
		intervals.forEach((t) => originalClearInterval(t));
		intervals.length = 0;
	});

	describe("startPoller", () => {
		it("should be defined", () => {
			expect(typeof startPoller).toBe("function");
		});

		it("should not start if already running", () => {
			const timer = setInterval(() => {}, 1000);
			state.setPollTimer(timer);
			const mockPi = { exec: mock(async () => ({ code: 0, stdout: "", stderr: "" })) };
			startPoller(mockPi as any, {} as any, () => {});
			expect(intervals.length).toBe(1); // Only the original timer
			clearInterval(timer);
		});

		it("should create interval when not running", () => {
			const mockPi = { exec: mock(async () => ({ code: 0, stdout: "", stderr: "" })) };
			const ctx = { cwd: "/test", hasUI: true } as any;
			startPoller(mockPi as any, ctx, () => {});
			expect(intervals.length).toBe(1);
		});
	});

	describe("stopPoller", () => {
		it("should be defined", () => {
			expect(typeof stopPoller).toBe("function");
		});

		it("should clear interval when timer exists", () => {
			const timer = setInterval(() => {}, 1000);
			state.setPollTimer(timer);
			stopPoller();
			expect(state.getPollTimer()).toBeUndefined();
			expect(intervals).not.toContain(timer);
		});

		it("should do nothing when no timer exists", () => {
			state.setPollTimer(undefined);
			stopPoller(); // Should not throw
			expect(intervals.length).toBe(0);
		});
	});
});

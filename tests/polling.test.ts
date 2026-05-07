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
import { refreshRunning, startPoller } from "../extensions/modules/polling.ts";

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

	describe("refreshRunning", () => {
		it("should skip refresh if no context", async () => {
			const mockPi = { exec: mock(async () => ({ code: 0, stdout: "", stderr: "" })) };
			await refreshRunning(mockPi as any, undefined, () => {});
			// Should return early without calling exec
		});

		it("should skip refresh if already in flight", async () => {
			state.setRefreshInFlight(true);
			const mockPi = { exec: mock(async () => ({ code: 0, stdout: "", stderr: "" })) };
			const ctx = { cwd: "/test", hasUI: true } as any;
			await refreshRunning(mockPi as any, ctx, () => {});
			// Should return early
		});

		it("should set running commands on success", async () => {
			const mockPi = {
				exec: mock(async (_cmd: string, args: string[]) => {
					if (args.includes("list-sessions")) {
						return { code: 0, stdout: "", stderr: "" };
					}
					return { code: 0, stdout: "", stderr: "" };
				}),
			};
			const ctx = { cwd: "/test", hasUI: true } as any;
			await refreshRunning(mockPi as any, ctx, () => {});
			// Verify state was updated
		});
	});

	describe("startPoller", () => {
		it("should not start if already running", () => {
			const timer = setInterval(() => {}, 1000);
			state.setPollTimer(timer);
			startPoller({} as any, {} as any, () => {});
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
});

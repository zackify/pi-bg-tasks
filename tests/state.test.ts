import { describe, it, expect, beforeEach, mock } from "bun:test";
import * as state from "../extensions/modules/state.ts";

describe("state module", () => {
	beforeEach(() => {
		// Reset state before each test
		state.resetState();
	});

	describe("latestCtx", () => {
		it("should return undefined initially", () => {
			expect(state.getLatestCtx()).toBeUndefined();
		});

		it("should set and get context", () => {
			const ctx = { cwd: "/test" } as any;
			state.setLatestCtx(ctx);
			expect(state.getLatestCtx()).toBe(ctx);
		});

		it("should allow setting to undefined", () => {
			state.setLatestCtx({ cwd: "/test" } as any);
			state.setLatestCtx(undefined);
			expect(state.getLatestCtx()).toBeUndefined();
		});
	});

	describe("running", () => {
		it("should return empty array initially", () => {
			expect(state.getRunning()).toEqual([]);
		});

		it("should set and get running commands", () => {
			const commands = [
				{ session: "s1", command: "cmd1", cwd: "/test", logFile: "/log", startedAt: 1 },
			];
			state.setRunning(commands);
			expect(state.getRunning()).toEqual(commands);
		});
	});

	describe("pollTimer", () => {
		it("should return undefined initially", () => {
			expect(state.getPollTimer()).toBeUndefined();
		});

		it("should set and get timer", () => {
			const timer = setTimeout(() => {}, 1000);
			state.setPollTimer(timer);
			expect(state.getPollTimer()).toBe(timer);
			clearTimeout(timer);
		});
	});

	describe("refreshInFlight", () => {
		it("should return false initially", () => {
			expect(state.getRefreshInFlight()).toBe(false);
		});

		it("should set and get inFlight flag", () => {
			state.setRefreshInFlight(true);
			expect(state.getRefreshInFlight()).toBe(true);
			state.setRefreshInFlight(false);
			expect(state.getRefreshInFlight()).toBe(false);
		});
	});

	describe("processHooksInstalled", () => {
		it("should return false initially", () => {
			expect(state.getProcessHooksInstalled()).toBe(false);
		});

		it("should set and get installed flag", () => {
			state.setProcessHooksInstalled(true);
			expect(state.getProcessHooksInstalled()).toBe(true);
			state.setProcessHooksInstalled(false);
			expect(state.getProcessHooksInstalled()).toBe(false);
		});
	});

	describe("widgetInstalled", () => {
		it("should return false initially", () => {
			expect(state.getWidgetInstalled()).toBe(false);
		});

		it("should set and get installed flag", () => {
			state.setWidgetInstalled(true);
			expect(state.getWidgetInstalled()).toBe(true);
			state.setWidgetInstalled(false);
			expect(state.getWidgetInstalled()).toBe(false);
		});
	});

	describe("logViewerOpen", () => {
		it("should return false initially", () => {
			expect(state.getLogViewerOpen()).toBe(false);
		});

		it("should set and get open flag", () => {
			state.setLogViewerOpen(true);
			expect(state.getLogViewerOpen()).toBe(true);
			state.setLogViewerOpen(false);
			expect(state.getLogViewerOpen()).toBe(false);
		});
	});

	describe("resetState", () => {
		it("should reset all state to initial values", () => {
			// Set all state values
			state.setLatestCtx({ cwd: "/test" } as any);
			state.setRunning([{ session: "s1", command: "cmd", cwd: "/", logFile: "/l", startedAt: 1 }]);
			state.setPollTimer(setTimeout(() => {}, 1000));
			state.setRefreshInFlight(true);
			state.setProcessHooksInstalled(true);
			state.setWidgetInstalled(true);
			state.setLogViewerOpen(true);

			// Reset
			state.resetState();

			// Verify all reset
			expect(state.getLatestCtx()).toBeUndefined();
			expect(state.getRunning()).toEqual([]);
			expect(state.getPollTimer()).toBeUndefined();
			expect(state.getRefreshInFlight()).toBe(false);
			expect(state.getProcessHooksInstalled()).toBe(false);
			expect(state.getWidgetInstalled()).toBe(false);
			expect(state.getLogViewerOpen()).toBe(false);
		});
	});
});

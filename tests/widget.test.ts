import { describe, it, expect } from "bun:test";
import { updateWidget } from "../extensions/modules/widget.ts";

describe("widget module", () => {
	describe("updateWidget", () => {
		it("should return widgetInstalled false when no context", () => {
			const result = updateWidget(undefined, [], false, () => {});
			expect(result).toBe(false);
		});

		it("should return widgetInstalled false when context has no UI", () => {
			const ctx = { cwd: "/test" } as any;
			const result = updateWidget(ctx, [], false, () => {});
			expect(result).toBe(false);
		});

		it("should uninstall widget when no running commands", () => {
			const setWidget = (id: string, widget: any) => {
				expect(id).toBe("pi-bg-running");
				expect(widget).toBeUndefined();
			};
			const ctx = { cwd: "/test", hasUI: true, ui: { setWidget } } as any;
			const result = updateWidget(ctx, [], true, setWidget);
			expect(result).toBe(false);
		});

		it("should return widgetInstalled false when widget not installed and no commands", () => {
			const setWidget = () => {};
			const ctx = { cwd: "/test", hasUI: true, ui: { setWidget } } as any;
			const result = updateWidget(ctx, [], false, setWidget);
			expect(result).toBe(false);
		});

		it("should install widget when commands are running", () => {
			const setWidget = (id: string, widget: any, opts?: any) => {
				expect(id).toBe("pi-bg-running");
				expect(typeof widget).toBe("function");
				expect(opts?.placement).toBe("aboveEditor");
			};
			const ctx = {
				cwd: "/test",
				hasUI: true,
				ui: { setWidget },
			} as any;
			const running = [{ session: "s1", command: "cmd", cwd: "/test", logFile: "/l", startedAt: 1 }];
			const result = updateWidget(ctx, running, false, setWidget);
			expect(result).toBe(true);
		});

		it("should filter commands by cwd", () => {
			const setWidget = () => {};
			const ctx = {
				cwd: "/project1",
				hasUI: true,
				ui: { setWidget },
			} as any;
			const running = [
				{ session: "s1", command: "cmd", cwd: "/project1", logFile: "/l", startedAt: 1 },
				{ session: "s2", command: "cmd", cwd: "/project2", logFile: "/l", startedAt: 2 },
			];
			updateWidget(ctx, running, false, setWidget);
			// Widget is installed
		});

		it("should not reinstall widget if already installed", () => {
			let installed = false;
			const setWidget = () => {
				installed = true;
			};
			const requestRender = () => {};
			const ctx = {
				cwd: "/test",
				hasUI: true,
				ui: { setWidget, requestRender },
			} as any;
			const running = [{ session: "s1", command: "cmd", cwd: "/test", logFile: "/l", startedAt: 1 }];
			const result = updateWidget(ctx, running, true, setWidget, requestRender);
			expect(result).toBe(true);
			expect(installed).toBe(false);
		});
	});
});

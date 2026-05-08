import { describe, it, expect, beforeEach, mock } from "bun:test";

const mockExec = mock(async () => ({ code: 0, stdout: "", stderr: "" }));

mock.module("@earendil-works/pi-tui", () => ({
	Key: { up: "up", down: "down", enter: "enter", escape: "escape" },
	matchesKey: mock((d: string, k: any) => d === k),
	truncateToWidth: mock((s: string) => s),
	Text: class {
		constructor(text: string, x: number, y: number) {
			this.text = text;
		}
		text: string = "";
		render() {
			return [this.text];
		}
	},
}));

mock.module("@earendil-works/pi-coding-agent", () => ({
	DynamicBorder: class {
		constructor(color?: (s: string) => string) {
			this.colorFn = color;
		}
		colorFn: (s: string) => string = (s) => s;
		render() {
			return [this.colorFn("─".repeat(40))];
		}
	},
}));

import { showBgMenu, attachToCommand } from "../extensions/modules/menu.ts";

describe("menu module", () => {
	describe("showBgMenu", () => {
		it("should be defined", async () => {
			expect(typeof showBgMenu).toBe("function");
		});

		it("should create menu UI", async () => {
			let customResult: any;
			const custom = mock(async <T>(fn: (tui: any, theme: any, kb: any, done: (r: T) => void) => any) => {
				customResult = fn(
					{ requestRender: mock(() => {}), stop: mock(() => {}), start: mock(() => {}) },
					{ fg: (c: string, t: string) => t, bold: (t: string) => t, dim: (t: string) => t },
					{},
					mock(() => {}),
				);
				return customResult;
			});

			const ctx = {
				cwd: "/test",
				hasUI: true,
				ui: { custom },
			} as any;

			await showBgMenu(
				{ exec: mockExec } as any,
				ctx,
				() => [],
				async () => [],
				(cwd: string) => [],
				() => {},
				async () => false,
				async () => {},
			);

			expect(custom).toHaveBeenCalled();
			expect(customResult).toBeDefined();
			expect(typeof customResult.render).toBe("function");
			expect(typeof customResult.handleInput).toBe("function");
		});

		it("should render menu lines", async () => {
			let component: any;
			const custom = mock(async <T>(fn: (tui: any, theme: any, kb: any, done: (r: T) => void) => any) => {
				component = fn(
					{ requestRender: mock(() => {}), stop: mock(() => {}), start: mock(() => {}) },
					{ fg: (c: string, t: string) => t, bold: (t: string) => t, dim: (t: string) => t },
					{},
					mock(() => {}),
				);
				return component;
			});

			const ctx = {
				cwd: "/test",
				hasUI: true,
				ui: { custom },
			} as any;

			await showBgMenu(
				{ exec: mockExec } as any,
				ctx,
				() => [],
				async () => [],
				(cwd: string) => [],
				() => {},
				async () => false,
				async () => {},
			);

			const lines = component.render(80);
			expect(lines.length).toBeGreaterThan(0);
		});

		it("should include cwd in header", async () => {
			let component: any;
			const custom = mock(async <T>(fn: (tui: any, theme: any, kb: any, done: (r: T) => void) => any) => {
				component = fn(
					{ requestRender: mock(() => {}), stop: mock(() => {}), start: mock(() => {}) },
					{ fg: (c: string, t: string) => t, bold: (t: string) => t, dim: (t: string) => t },
					{},
					mock(() => {}),
				);
				return component;
			});

			const ctx = {
				cwd: "/my/project",
				hasUI: true,
				ui: { custom },
			} as any;

			await showBgMenu(
				{ exec: mockExec } as any,
				ctx,
				() => [],
				async () => [],
				(cwd: string) => [],
				() => {},
				async () => false,
				async () => {},
			);

			const lines = component.render(80);
			expect(lines.some(l => l.includes("/my/project"))).toBe(true);
		});
	});

	describe("attachToCommand", () => {
		it("should be defined", async () => {
			expect(typeof attachToCommand).toBe("function");
		});
	});
});

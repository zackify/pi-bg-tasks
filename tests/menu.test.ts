import { describe, it, expect } from "bun:test";

describe("menu module", () => {
	describe("buildMenuItems", () => {
		it("should build empty menu with only new item", async () => {
			const { buildMenuItems } = await import("../extensions/modules/menu.ts");
			const items = buildMenuItems([], []);
			expect(items.length).toBe(1);
			expect(items[0]?.type).toBe("new");
		});

		it("should add running separator when running commands exist", async () => {
			const { buildMenuItems } = await import("../extensions/modules/menu.ts");
			const running = [{ session: "s1", command: "cmd", cwd: "/test", logFile: "/l", startedAt: 1 }];
			const items = buildMenuItems([], running);
			expect(items[0]?.type).toBe("separator");
			expect(items[1]?.type).toBe("running");
		});

		it("should add recent separator when recents exist", async () => {
			const { buildMenuItems } = await import("../extensions/modules/menu.ts");
			const items = buildMenuItems(["cmd1", "cmd2"], []);
			expect(items.some((i) => i.type === "separator" && i.label === "recent")).toBe(true);
		});
	});

	describe("showBgMenu", () => {
		it("should be defined", async () => {
			const { showBgMenu } = await import("../extensions/modules/menu.ts");
			expect(typeof showBgMenu).toBe("function");
		});
	});

	describe("attachToCommand", () => {
		it("should be defined", async () => {
			const { attachToCommand } = await import("../extensions/modules/menu.ts");
			expect(typeof attachToCommand).toBe("function");
		});
	});
});

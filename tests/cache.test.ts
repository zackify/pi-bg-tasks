import { describe, it, expect } from "bun:test";

describe("cache module", () => {
	describe("cwdKey", () => {
		it("should resolve path", () => {
			const { cwdKey } = require("../extensions/modules/cache.ts");
			const key = cwdKey("/test/project");
			expect(key).toBe("/test/project");
		});
	});

	describe("loadCache", () => {
		it("should have loadCache function", () => {
			const { loadCache } = require("../extensions/modules/cache.ts");
			expect(typeof loadCache).toBe("function");
		});
	});

	describe("saveCache", () => {
		it("should have saveCache function", () => {
			const { saveCache } = require("../extensions/modules/cache.ts");
			expect(typeof saveCache).toBe("function");
		});
	});

	describe("rememberCommand", () => {
		it("should have rememberCommand function", () => {
			const { rememberCommand } = require("../extensions/modules/cache.ts");
			expect(typeof rememberCommand).toBe("function");
		});
	});
});

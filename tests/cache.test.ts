import { describe, it, expect } from "bun:test";

describe("cache module", () => {
	describe("cwdKey", () => {
		it("should resolve path", () => {
			const { cwdKey } = require("../extensions/modules/cache.ts");
			const key = cwdKey("/test/project");
			expect(key).toBe("/test/project");
		});
	});
});

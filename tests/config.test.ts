import { describe, it, expect } from "bun:test";
import * as config from "../extensions/modules/config.ts";

describe("config module", () => {
	it("should have correct CACHE_PATH", () => {
		expect(config.CACHE_PATH).toContain(".pi/agent/bg-cache.json");
	});

	it("should have correct META_DIR", () => {
		expect(config.META_DIR).toContain(".pi/agent/bg-meta");
	});

	it("should have correct LOG_DIR", () => {
		expect(config.LOG_DIR).toContain(".pi/agent/bg-logs");
	});

	it("should have correct WIDGET_ID", () => {
		expect(config.WIDGET_ID).toBe("pi-bg-running");
	});

	it("should have correct POLL_MS", () => {
		expect(config.POLL_MS).toBe(5000);
	});

	it("should have correct RECENT_LIMIT", () => {
		expect(config.RECENT_LIMIT).toBe(10);
	});

	it("should have correct SESSION_PREFIX", () => {
		expect(config.SESSION_PREFIX).toBe("pi-bg-");
	});

	it("should have correct LOG_POLL_MS", () => {
		expect(config.LOG_POLL_MS).toBe(1000);
	});

	it("should have correct MAX_LOG_LINES", () => {
		expect(config.MAX_LOG_LINES).toBe(500);
	});

	it("should have correct DEFAULT_LOG_LINES", () => {
		expect(config.DEFAULT_LOG_LINES).toBe(80);
	});

	it("should have correct DISPLAY_LOG_LINES", () => {
		expect(config.DISPLAY_LOG_LINES).toBe(40);
	});

	it("should have correct MENU_TRUNCATE_WIDTH", () => {
		expect(config.MENU_TRUNCATE_WIDTH).toBe(120);
	});

	it("should have correct RUNNING_TRUNCATE_WIDTH", () => {
		expect(config.RUNNING_TRUNCATE_WIDTH).toBe(80);
	});

	it("should have correct METADATA_INDENT", () => {
		expect(config.METADATA_INDENT).toBe("  ");
	});
});

// Configuration constants for bg extension

import os from "node:os";
import path from "node:path";

export const CACHE_PATH = path.join(os.homedir(), ".pi", "agent", "bg-cache.json");
export const META_DIR = path.join(os.homedir(), ".pi", "agent", "bg-meta");
export const LOG_DIR = path.join(os.homedir(), ".pi", "agent", "bg-logs");
export const WIDGET_ID = "pi-bg-running";
export const POLL_MS = 5000;
export const RECENT_LIMIT = 10;
export const SESSION_PREFIX = "pi-bg-";
export const LOG_POLL_MS = 1000;
export const MAX_LOG_LINES = 500;
export const DEFAULT_LOG_LINES = 80;
export const DISPLAY_LOG_LINES = 40;
export const MENU_TRUNCATE_WIDTH = 120;
export const RUNNING_TRUNCATE_WIDTH = 80;
export const METADATA_INDENT = "  ";

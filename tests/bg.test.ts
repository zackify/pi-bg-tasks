import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// --- Global test state for mock intercepts ---
const testState = {
  fs: { readFileSync: null as ((p: string) => string) | null, writeFileSync: null as ((p: string, d: string) => void) | null, mkdirSync: null as ((p: string, opts?: any) => void) | null, unlinkSync: null as ((p: string) => void) | null },
  spawn: null as ((...args: any[]) => any) | null,
  crypto: { createHash: () => ({ update: () => ({ digest: () => "abcdef12" }) }) },
};

// --- Set up mocks ---
mock.module("node:fs", () => ({
  default: {
    readFileSync: (p: string, _enc?: string) => {
      if (testState.fs.readFileSync) return testState.fs.readFileSync(p);
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
    writeFileSync: (...args: any[]) => { testState.fs.writeFileSync?.(...args); },
    mkdirSync: (...args: any[]) => { testState.fs.mkdirSync?.(...args); },
    unlinkSync: (...args: any[]) => { testState.fs.unlinkSync?.(...args); },
  },
  readFileSync: (p: string, _enc?: string) => {
    if (testState.fs.readFileSync) return testState.fs.readFileSync(p);
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  },
  writeFileSync: (...args: any[]) => { testState.fs.writeFileSync?.(...args); },
  mkdirSync: (...args: any[]) => { testState.fs.mkdirSync?.(...args); },
  unlinkSync: (...args: any[]) => { testState.fs.unlinkSync?.(...args); },
}));

mock.module("node:child_process", () => ({
  spawnSync: (...args: any[]) => {
    if (testState.spawn) return testState.spawn(...args);
    return { status: 0, stdout: "", stderr: "", pid: 0, output: [], signal: null };
  },
}));

mock.module("node:crypto", () => ({
  default: { createHash: () => testState.crypto.createHash() },
  createHash: () => testState.crypto.createHash(),
}));

mock.module("@earendil-works/pi-tui", () => ({
  Key: { up: { name: "up" }, down: { name: "down" }, escape: { name: "escape" }, enter: { name: "enter" } },
  matchesKey: (data: string, key: any) => {
    if (typeof key === "string") return data === key;
    if (key?.name === "up") return data === "\x1b[A";
    if (key?.name === "down") return data === "\x1b[B";
    if (key?.name === "escape") return data === "\x1b";
    if (key?.name === "enter") return data === "\r";
    return false;
  },
  Text: class { constructor(public text: string, ..._: any[]) {} render(_w: number) { return [this.text]; } },
  truncateToWidth: (s: string, _w: number, _e: string) => s,
  DynamicBorder: class { constructor(public fn: (s: string) => string) {} render(_w: number) { return [this.fn("─")]; } },
}));

mock.module("@earendil-works/pi-coding-agent", () => ({
  DynamicBorder: class { constructor(public fn: (s: string) => string) {} render(_w: number) { return [this.fn("─")]; } },
}));

mock.module("typebox", () => ({
  Type: {
    Object: (props: any) => ({ type: "object", properties: props }),
    String: (opts?: any) => ({ type: "string", ...opts }),
    Number: (opts?: any) => ({ type: "number", ...opts }),
    Optional: (schema: any) => ({ ...schema, optional: true }),
  },
}));

// --- Import the module under test ---
let mod: typeof import("../extensions/bg");

beforeEach(async () => {
  // Reset mock state
  testState.fs.readFileSync = null;
  testState.fs.writeFileSync = null;
  testState.fs.mkdirSync = null;
  testState.fs.unlinkSync = null;
  testState.spawn = null;
  testState.crypto = { createHash: () => ({ update: () => ({ digest: () => "abcdef12" }) }) };

  // Reset process listeners
  process.eventNames().forEach((name) => {
    if (["exit", "SIGINT", "SIGTERM", "SIGHUP"].includes(String(name))) {
      process.removeAllListeners(name);
    }
  });

  mod = await import("../extensions/bg");
});

// ==== shellQuote ====
describe("shellQuote", () => {
  test("wraps simple string in single quotes", () => {
    expect(mod.shellQuote("hello")).toBe("'hello'");
  });
  test("escapes single quotes inside string", () => {
    expect(mod.shellQuote("it's")).toBe("'it'\"'\"'s'");
  });
  test("handles empty string", () => {
    expect(mod.shellQuote("")).toBe("''");
  });
  test("handles multiple single quotes", () => {
    expect(mod.shellQuote("a'b'c")).toBe("'a'\"'\"'b'\"'\"'c'");
  });
});

// ==== truncateMiddle ====
describe("truncateMiddle", () => {
  // half = Math.floor((max - 1) / 2). For max=80: half=39. Result = 39 + 1 + 39 = 79.
  // For max=10: half=4. Result = 4 + 1 + 4 = 9.
  test("returns original when shorter than max", () => {
    expect(mod.truncateMiddle("short")).toBe("short");
  });
  test("returns original when equal to max", () => {
    const s = "a".repeat(80);
    expect(mod.truncateMiddle(s)).toBe(s);
  });
  test("truncates with ellipsis when longer than max", () => {
    const s = "a".repeat(100);
    const result = mod.truncateMiddle(s);
    expect(result.length).toBe(79);
    expect(result).toContain("…");
  });
  test("uses custom max parameter", () => {
    const s = "a".repeat(20);
    expect(mod.truncateMiddle(s, 10)).toBe("aaaa…aaaa");
  });
  test("handles very long string", () => {
    const s = "abcdefghijklmnopqrstuvwxyz".repeat(10); // 260 chars
    const result = mod.truncateMiddle(s, 20);
    expect(result.length).toBe(19);
    expect(result).toContain("…");
  });
});

// ==== cwdKey ====
describe("cwdKey", () => {
  test("resolves path", () => {
    expect(mod.cwdKey("/tmp")).toBe("/tmp");
  });
  test("resolves relative path", () => {
    expect(mod.cwdKey(".")).toBe(process.cwd());
  });
});

// ==== loadCache / saveCache ====
describe("loadCache / saveCache", () => {
  test("loadCache returns empty on missing file", () => {
    expect(mod.loadCache()).toEqual({ cwds: {} });
  });
  test("loadCache parses valid cache file", () => {
    const testCache = { cwds: { "/test": { recentBackgroundCommands: ["cmd1", "cmd2"] } } };
    testState.fs.readFileSync = () => JSON.stringify(testCache);
    expect(mod.loadCache()).toEqual(testCache);
  });
  test("loadCache returns empty on JSON parse error", () => {
    testState.fs.readFileSync = () => "{invalid}";
    expect(mod.loadCache()).toEqual({ cwds: {} });
  });
  test("saveCache writes cache and creates directory", () => {
    let written = "";
    testState.fs.mkdirSync = () => {};
    testState.fs.writeFileSync = (_p: string, d: string) => { written = d; };
    mod.saveCache({ cwds: { "/test": { recentBackgroundCommands: ["cmd1"] } } });
    expect(written).toContain("cmd1");
  });
});

// ==== getRecentCommands ====
describe("getRecentCommands", () => {
  test("returns empty when no cache exists", () => {
    expect(mod.getRecentCommands("/p")).toEqual([]);
  });
  test("returns filtered recents for cwd", () => {
    testState.fs.readFileSync = () =>
      JSON.stringify({ cwds: { "/test": { recentBackgroundCommands: ["cmd1", "", "cmd2", "  "] } } });
    expect(mod.getRecentCommands("/test")).toEqual(["cmd1", "cmd2"]);
  });
  test("falls back to all recents when cwd has none", () => {
    testState.fs.readFileSync = () =>
      JSON.stringify({ cwds: { "/other": { recentBackgroundCommands: ["g1"] }, "/test": { recentBackgroundCommands: [] } } });
    expect(mod.getRecentCommands("/test")).toEqual(["g1"]);
  });
  test("handles missing cwds", () => {
    testState.fs.readFileSync = () => JSON.stringify({});
    expect(mod.getRecentCommands("/test")).toEqual([]);
  });
  test("deduplicates across cwds", () => {
    testState.fs.readFileSync = () =>
      JSON.stringify({ cwds: { "/a": { recentBackgroundCommands: ["dup", "a1"] }, "/b": { recentBackgroundCommands: ["dup", "b1"] } } });
    const result = mod.getRecentCommands("/nonexistent");
    expect(result).toEqual(["dup", "a1", "b1"]);
  });
});

// ==== rememberCommand ====
describe("rememberCommand", () => {
  test("ignores empty command", () => {
    testState.fs.readFileSync = () => JSON.stringify({ cwds: {} });
    mod.rememberCommand("/test", "  ");
  });
  test("remembers new command", () => {
    testState.fs.readFileSync = () => JSON.stringify({ cwds: {} });
    let saved: any = null;
    testState.fs.mkdirSync = () => {};
    testState.fs.writeFileSync = (_p: string, d: string) => { saved = JSON.parse(d); };
    mod.rememberCommand("/test", "npm run dev");
    expect(saved.cwds["/test"].recentBackgroundCommands).toContain("npm run dev");
  });
  test("moves duplicate to top", () => {
    testState.fs.readFileSync = () =>
      JSON.stringify({ cwds: { "/test": { recentBackgroundCommands: ["old", "npm run dev", "other"] } } });
    let saved: any = null;
    testState.fs.mkdirSync = () => {};
    testState.fs.writeFileSync = (_p: string, d: string) => { saved = JSON.parse(d); };
    mod.rememberCommand("/test", "npm run dev");
    expect(saved.cwds["/test"].recentBackgroundCommands[0]).toBe("npm run dev");
  });
  test("limits to RECENT_LIMIT", () => {
    const many = Array.from({ length: 20 }, (_, i) => `cmd${i}`);
    testState.fs.readFileSync = () => JSON.stringify({ cwds: { "/test": { recentBackgroundCommands: many } } });
    let saved: any = null;
    testState.fs.mkdirSync = () => {};
    testState.fs.writeFileSync = (_p: string, d: string) => { saved = JSON.parse(d); };
    mod.rememberCommand("/test", "newcmd");
    expect(saved.cwds["/test"].recentBackgroundCommands.length).toBe(10);
  });
});

// ==== tmuxAvailable ====
describe("tmuxAvailable", () => {
  test("returns true when tmux -V succeeds", () => {
    testState.spawn = () => ({ status: 0 });
    expect(mod.tmuxAvailable()).toBe(true);
  });
  test("returns false when tmux -V fails", () => {
    testState.spawn = () => ({ status: 1 });
    expect(mod.tmuxAvailable()).toBe(false);
  });
});

// ==== exec ====
describe("exec", () => {
  test("calls pi.exec with correct args", async () => {
    let called: any = null;
    const mockPi = { exec: async (c: string, a: string[], o: any) => { called = { c, a, o }; return { code: 0, stdout: "ok", stderr: "" }; } };
    const result = await mod.exec(mockPi as any, "ls", ["-la"], 5000);
    expect(called.c).toBe("ls");
    expect(called.a).toEqual(["-la"]);
    expect(called.o.timeout).toBe(5000);
    expect(result.code).toBe(0);
  });
  test("uses default timeout 8000", async () => {
    let called: any = null;
    const mockPi = { exec: async (_c: string, _a: string[], o: any) => { called = o; return { code: 0, stdout: "", stderr: "" }; } };
    await mod.exec(mockPi as any, "echo", ["hi"]);
    expect(called.timeout).toBe(8000);
  });
});

// ==== makeSessionId ====
describe("makeSessionId", () => {
  test("returns pi-bg- prefixed id", () => {
    const id = mod.makeSessionId("/t", "cmd");
    expect(id).toMatch(/^pi-bg-/);
    expect(id.length).toBe("pi-bg-".length + 8);
  });
});

// ==== runningForCwd ====
describe("runningForCwd", () => {
  test("filters commands matching cwd", () => {
    mod.running.push(
      { session: "s1", command: "c1", cwd: "/test", logFile: "l1", startedAt: 100 },
      { session: "s2", command: "c2", cwd: "/other", logFile: "l2", startedAt: 200 },
    );
    expect(mod.runningForCwd("/test")).toHaveLength(1);
    expect(mod.runningForCwd("/test")[0].command).toBe("c1");
  });
  test("excludes commands with no cwd", () => {
    mod.running.length = 0;
    mod.running.push({ session: "s1", command: "c1", cwd: "", logFile: "l1", startedAt: 100 });
    expect(mod.runningForCwd("/test")).toHaveLength(0);
  });
});

// ==== selectableItems ====
describe("selectableItems", () => {
  test("filters out separators", () => {
    expect(mod.selectableItems([{ type: "new", label: "N" }, { type: "separator", label: "s" }, { type: "running", running: {} as any }])).toEqual([0, 2]);
  });
  test("all indices when no separators", () => {
    expect(mod.selectableItems([{ type: "new", label: "N" }, { type: "recent", command: "c" }])).toEqual([0, 1]);
  });
  test("empty for all separators", () => {
    expect(mod.selectableItems([{ type: "separator", label: "a" }] as any)).toEqual([]);
  });
});

// ==== moveSelection ====
describe("moveSelection", () => {
  const items: any[] = [
    { type: "new", label: "N" },
    { type: "separator", label: "s" },
    { type: "recent", command: "c" },
    { type: "running", running: {} },
  ];
  test("moves down", () => {
    expect(mod.moveSelection(items, 0, 1)).toBe(2);
  });
  test("moves up", () => {
    expect(mod.moveSelection(items, 3, -1)).toBe(2);
  });
  test("clamps to bounds", () => {
    expect(mod.moveSelection(items, 0, -1)).toBe(0);
    expect(mod.moveSelection(items, 3, 1)).toBe(3);
  });
  test("returns 0 when empty", () => {
    expect(mod.moveSelection([{ type: "separator", label: "s" }] as any, 0, 1)).toBe(0);
  });
});

// ==== buildMenuItems ====
describe("buildMenuItems", () => {
  const rc = { session: "s1", command: "c1", cwd: "/t", logFile: "l", startedAt: 0 };
  test("with running and recents", () => {
    const items = mod.buildMenuItems(["r1"], [rc]);
    expect(items[0]).toEqual({ type: "separator", label: "running" });
    expect(items[1]).toEqual({ type: "running", running: rc });
    expect(items[2]).toEqual({ type: "new", label: "New command…" });
    expect(items[3]).toEqual({ type: "separator", label: "recent" });
    expect(items[4]).toEqual({ type: "recent", command: "r1" });
  });
  test("only new when empty", () => {
    expect(mod.buildMenuItems([], [])).toEqual([{ type: "new", label: "New command…" }]);
  });
  test("with running only", () => {
    const items = mod.buildMenuItems([], [rc]);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ type: "separator", label: "running" });
    expect(items[1]).toEqual({ type: "running", running: rc });
    expect(items[2]).toEqual({ type: "new", label: "New command…" });
  });
  test("with recents only", () => {
    const items = mod.buildMenuItems(["r1"], []);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ type: "new", label: "New command…" });
    expect(items[1]).toEqual({ type: "separator", label: "recent" });
    expect(items[2]).toEqual({ type: "recent", command: "r1" });
  });
});

// ==== killSessionSync ====
describe("killSessionSync", () => {
  test("calls spawnSync with correct args", () => {
    let called: any = null;
    testState.spawn = (...args: any[]) => { called = args; return { status: 0 }; };
    mod.killSessionSync("pi-bg-test");
    expect(called[0]).toBe("tmux");
    expect(called[1]).toEqual(["kill-session", "-t", "pi-bg-test"]);
  });
});

// ==== killAllRunningCommandsSync ====
describe("killAllRunningCommandsSync", () => {
  test("returns early when tmux not available", () => {
    let callCount = 0;
    testState.spawn = (...args: any[]) => {
      callCount++;
      if (args[1]?.[0] === "-V") return { status: 1 };
      return { status: 0 };
    };
    mod.killAllRunningCommandsSync();
    expect(callCount).toBe(1);
  });
  test("kills all pi-bg- sessions", () => {
    const killed: string[] = [];
    testState.spawn = (...args: any[]) => {
      if (args[1]?.[0] === "-V") return { status: 0 };
      if (args[1]?.[0] === "list-sessions") return { status: 0, stdout: "pi-bg-s1\npi-bg-s2\nother\n" };
      if (args[1]?.[0] === "kill-session") { killed.push(args[1][2]); return { status: 0 }; }
      return { status: 0 };
    };
    mod.killAllRunningCommandsSync();
    expect(killed).toEqual(["pi-bg-s1", "pi-bg-s2"]);
  });
  test("handles list-sessions failure", () => {
    testState.spawn = (...args: any[]) => {
      if (args[1]?.[0] === "-V") return { status: 0 };
      return { status: 1, stdout: "", stderr: "error" };
    };
    mod.killAllRunningCommandsSync();
  });
  test("handles empty stdout", () => {
    testState.spawn = (...args: any[]) => {
      if (args[1]?.[0] === "-V") return { status: 0 };
      return { status: 0, stdout: "" };
    };
    mod.killAllRunningCommandsSync();
  });
});

// ==== installProcessHooks / uninstallProcessHooks ====
// These modify process listeners. We test them by calling directly.
// Module-level let is readonly from import, but the functions modify them.
describe("installProcessHooks / uninstallProcessHooks", () => {
  test("installProcessHooks registers listeners", () => {
    expect(process.listenerCount("exit")).toBe(0);
    mod.installProcessHooks();
    expect(process.listenerCount("exit")).toBe(1);
    expect(process.listenerCount("SIGINT")).toBe(1);
    expect(process.listenerCount("SIGTERM")).toBe(1);
    expect(process.listenerCount("SIGHUP")).toBe(1);
  });
  test("installProcessHooks is idempotent", () => {
    // Uninstall first to reset processHooksInstalled flag (module is cached)
    mod.uninstallProcessHooks();
    mod.installProcessHooks();
    mod.installProcessHooks();
    expect(process.listenerCount("exit")).toBe(1);
  });
  test("uninstallProcessHooks removes listeners", () => {
    process.removeAllListeners();
    mod.installProcessHooks();
    mod.uninstallProcessHooks();
    expect(process.listenerCount("exit")).toBe(0);
    expect(process.listenerCount("SIGINT")).toBe(0);
    expect(process.listenerCount("SIGTERM")).toBe(0);
    expect(process.listenerCount("SIGHUP")).toBe(0);
  });
  test("uninstallProcessHooks safe when not installed", () => {
    process.removeAllListeners();
    mod.uninstallProcessHooks();
  });
});

// ==== startPoller / stopPoller ====
describe("startPoller / stopPoller", () => {
  test("startPoller creates interval", () => {
    const mockPi = { exec: async () => ({ code: 0, stdout: "", stderr: "" }) };
    mod.startPoller(mockPi as any);
    expect(mod.pollTimer).toBeDefined();
    mod.stopPoller();
    expect(mod.pollTimer).toBeUndefined();
  });
  test("startPoller is idempotent", () => {
    const mockPi = { exec: async () => ({ code: 0, stdout: "", stderr: "" }) };
    mod.startPoller(mockPi as any);
    const timer1 = mod.pollTimer;
    mod.startPoller(mockPi as any);
    expect(mod.pollTimer).toBe(timer1);
    mod.stopPoller();
  });
  test("stopPoller safe when no timer", () => {
    mod.stopPoller();
  });
});

// ==== startBackgroundCommandCore ====
describe("startBackgroundCommandCore", () => {
  test("error for empty command", async () => {
    const r = await mod.startBackgroundCommandCore({} as any, "/t", "  ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Background command cannot be empty.");
  });
  test("error when tmux not available", async () => {
    testState.spawn = () => ({ status: 1 });
    const r = await mod.startBackgroundCommandCore({} as any, "/t", "cmd");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("tmux is not installed");
  });
  test("error when tmux new-session fails", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.mkdirSync = () => {};
    testState.fs.writeFileSync = () => {};
    testState.fs.unlinkSync = () => {};
    const r = await mod.startBackgroundCommandCore({ exec: async () => ({ code: 1, stdout: "", stderr: "fail" }) } as any, "/t", "cmd");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("fail");
  });
  test("successfully starts command", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.mkdirSync = () => {};
    testState.fs.writeFileSync = () => {};
    const r = await mod.startBackgroundCommandCore({ exec: async () => ({ code: 0, stdout: "", stderr: "" }) } as any, "/t", "npm run dev");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.command.command).toBe("npm run dev");
      expect(r.command.cwd).toBe("/t");
    }
  });
});

// ==== startBackgroundCommand ====
describe("startBackgroundCommand", () => {
  function makeCtx(hasUI: boolean, notify?: any) {
    return { cwd: "/t", hasUI, ui: { notify: notify || (() => {}), setWidget: () => {}, custom: async () => null, requestRender: () => {} } };
  }
  test("with UI, success calls notify", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.mkdirSync = () => {};
    testState.fs.writeFileSync = () => {};
    const n = mock(() => {});
    const pi = { exec: async () => ({ code: 0, stdout: "", stderr: "" }) };
    const r = await mod.startBackgroundCommand(pi as any, makeCtx(true, n) as any, "npm run dev");
    expect(r?.command).toBe("npm run dev");
  });
  test("without UI, succeeds silently", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.mkdirSync = () => {};
    testState.fs.writeFileSync = () => {};
    const pi = { exec: async () => ({ code: 0, stdout: "", stderr: "" }) };
    const r = await mod.startBackgroundCommand(pi as any, makeCtx(false) as any, "npm run dev");
    expect(r?.command).toBe("npm run dev");
  });
  test("with UI, failure notifies error", async () => {
    testState.spawn = () => ({ status: 1 });
    const n = mock(() => {});
    const r = await mod.startBackgroundCommand({} as any, makeCtx(true, n) as any, "cmd");
    expect(r).toBeUndefined();
    expect(n).toHaveBeenCalled();
  });
  test("without UI, failure returns undefined", async () => {
    testState.spawn = () => ({ status: 1 });
    const r = await mod.startBackgroundCommand({} as any, makeCtx(false) as any, "cmd");
    expect(r).toBeUndefined();
  });
});

// ==== killRunningCommand ====
describe("killRunningCommand", () => {
  function makeCtx(hasUI: boolean) {
    return { cwd: "/t", hasUI, ui: { notify: mock(() => {}), setWidget: () => {}, custom: async () => null, requestRender: () => {} } };
  }
  test("kills and cleans up meta", async () => {
    let unlinked = "";
    testState.fs.unlinkSync = (p: string) => { unlinked = p; };
    const pi = { exec: async () => ({ code: 0, stdout: "", stderr: "" }) };
    const cmd = { session: "pi-bg-test", command: "test", cwd: "/t", logFile: "l", startedAt: 0 };
    const result = await mod.killRunningCommand(pi as any, makeCtx(true) as any, cmd);
    expect(result).toBe(true);
    expect(unlinked).toContain("pi-bg-test.json");
  });
  test("can't find session is ok", async () => {
    testState.fs.unlinkSync = () => {};
    const pi = { exec: async () => ({ code: 1, stdout: "", stderr: "can't find session" }) };
    const cmd = { session: "pi-bg-test", command: "test", cwd: "/t", logFile: "l", startedAt: 0 };
    const result = await mod.killRunningCommand(pi as any, makeCtx(true) as any, cmd);
    expect(result).toBe(true);
  });
  test("reports non-can't-find error", async () => {
    const n = mock(() => {});
    testState.fs.unlinkSync = () => {};
    const pi = { exec: async () => ({ code: 1, stdout: "", stderr: "permission denied" }) };
    const cmd = { session: "pi-bg-test", command: "test", cwd: "/t", logFile: "l", startedAt: 0 };
    const result = await mod.killRunningCommand(pi as any, { ...makeCtx(true), ui: { notify: n, setWidget: () => {}, custom: async () => null, requestRender: () => {} } } as any, cmd);
    expect(result).toBe(false);
    expect(n).toHaveBeenCalled();
  });
});

// ==== stopBackgroundCommandsByName ====
describe("stopBackgroundCommandsByName", () => {
  test("finds and kills matching command", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.readFileSync = (p: string) => {
      if (p.includes("s1.json")) return JSON.stringify({ session: "pi-bg-s1", command: "npm run dev", cwd: "/test", logFile: "l1", startedAt: 100 });
      if (p.includes("s2.json")) return JSON.stringify({ session: "pi-bg-s2", command: "other", cwd: "/test", logFile: "l2", startedAt: 200 });
      throw new Error("ENOENT");
    };
    testState.fs.unlinkSync = () => {};
    const pi = { exec: async () => ({ code: 0, stdout: "pi-bg-s1\npi-bg-s2\n", stderr: "" }) } as any;
    const r = await mod.stopBackgroundCommandsByName(pi, "/test", "npm run dev");
    expect(r.killed).toHaveLength(1);
    expect(r.killed[0].command).toBe("npm run dev");
  });
  test("empty killed when no match", async () => {
    testState.spawn = () => ({ status: 0 });
    const pi = { exec: async () => ({ code: 0, stdout: "", stderr: "" }) } as any;
    const r = await mod.stopBackgroundCommandsByName(pi, "/test", "nonexistent");
    expect(r.killed).toHaveLength(0);
  });
});

// ==== readLogs ====
describe("readLogs", () => {
  const cmd = { logFile: "/l", session: "s", command: "c", cwd: "/t", startedAt: 0 };
  test("returns truncated output", async () => {
    const pi = { exec: async () => ({ code: 0, stdout: "a\nb\nc\n", stderr: "" }) } as any;
    expect(await mod.readLogs(pi, cmd, 10)).toBe("a\nb\nc");
  });
  test("no log output on empty stdout", async () => {
    const pi = { exec: async () => ({ code: 0, stdout: "  \n  ", stderr: "" }) } as any;
    expect(await mod.readLogs(pi, cmd, 10)).toBe("No log output yet.");
  });
  test("returns stderr on tail failure", async () => {
    const pi = { exec: async () => ({ code: 1, stdout: "", stderr: "No such file" }) } as any;
    expect(await mod.readLogs(pi, cmd, 10)).toBe("No such file");
  });
  test("clamps lines to valid range", async () => {
    let n = "";
    const pi = { exec: async (_c: string, args: string[]) => { n = args[1]; return { code: 0, stdout: "ok\n", stderr: "" }; } } as any;
    await mod.readLogs(pi, cmd, 0);
    expect(n).toBe("1");
    await mod.readLogs(pi, cmd, 1000);
    expect(n).toBe("500");
  });
});

// ==== listRunningCommands ====
describe("listRunningCommands", () => {
  test("empty when tmux not available", async () => {
    testState.spawn = () => ({ status: 1 });
    expect(await mod.listRunningCommands({} as any)).toEqual([]);
  });
  test("empty when exec fails", async () => {
    testState.spawn = () => ({ status: 0 });
    const pi = { exec: async () => ({ code: 1, stdout: "", stderr: "fail" }) } as any;
    expect(await mod.listRunningCommands(pi)).toEqual([]);
  });
  test("parses sessions from tmux output", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.readFileSync = (p: string) => {
      if (p.includes("s1.json")) return JSON.stringify({ session: "pi-bg-s1", command: "c1", cwd: "/t1", logFile: "/l1", startedAt: 100 });
      if (p.includes("s2.json")) return JSON.stringify({ session: "pi-bg-s2", command: "c2", cwd: "/t2", logFile: "/l2", startedAt: 200 });
      throw new Error("ENOENT");
    };
    const pi = { exec: async () => ({ code: 0, stdout: "pi-bg-s1\npi-bg-s2\nnot-bg\n", stderr: "" }) } as any;
    const result = await mod.listRunningCommands(pi);
    expect(result).toHaveLength(2);
    expect(result[0].session).toBe("pi-bg-s2"); // sorted by startedAt desc (200 > 100)
    expect(result[1].session).toBe("pi-bg-s1");
  });
  test("handles missing metadata file", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.readFileSync = () => { throw new Error("ENOENT"); };
    const pi = { exec: async () => ({ code: 0, stdout: "pi-bg-unknown\n", stderr: "" }) } as any;
    const result = await mod.listRunningCommands(pi);
    expect(result).toHaveLength(1);
    expect(result[0].session).toBe("pi-bg-unknown");
    expect(result[0].command).toBe("pi-bg-unknown");
    expect(result[0].startedAt).toBe(0);
  });
});

// ==== refreshRunning ====
describe("refreshRunning", () => {
  test("returns early when ctx undefined", async () => {
    const pi = { exec: async () => ({ code: 0, stdout: "", stderr: "" }) };
    // Pass explicit undefined ctx — the function checks !ctx and returns early
    await mod.refreshRunning(pi as any, undefined);
  });
  test("successfully refreshes", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.readFileSync = () => { throw new Error("ENOENT"); };
    const pi = { exec: async () => ({ code: 0, stdout: "", stderr: "" }) };
    await mod.refreshRunning(pi as any, { cwd: "/test", hasUI: false } as any);
  });
});

// ==== updateWidget ====
// Note: exported module-level `let` bindings are ESM-immutable (readonly) from imports.
// We can only mutate objects (e.g. running.push) but not reassign primitives like widgetInstalled.
// Tests work by relying on updateWidget's own side-effects to toggle widgetInstalled.
describe("updateWidget", () => {
  test("does nothing when ctx undefined", () => {
    mod.updateWidget(undefined);
  });
  test("does nothing when hasUI false", () => {
    mod.updateWidget({ cwd: "/test", hasUI: false } as any);
  });
  test("removes widget when no running commands in cwd", () => {
    // Ensure there are running commands first so widget gets installed
    mod.running.push({ session: "s1", command: "cmd1", cwd: "/test", logFile: "l", startedAt: 0 });
    let installed = false;
    let removed = false;
    mod.updateWidget({ cwd: "/test", hasUI: true, ui: { 
      setWidget: (id: string, w: any) => { if (w === undefined) removed = true; else if (w) installed = true; }, 
      requestRender: () => {} 
    } } as any);
    // Now clear running and call updateWidget again — should remove widget
    mod.running.length = 0;
    mod.updateWidget({ cwd: "/test", hasUI: true, ui: { 
      setWidget: (_id: string, w: any) => { if (w === undefined) removed = true; }, 
      requestRender: () => {} 
    } } as any);
  });
  test("install and render widget", () => {
    mod.running.length = 0;
    mod.running.push({ session: "s1", command: "cmd1", cwd: "/test", logFile: "l", startedAt: 0 });
    let widgetId = "";
    let widgetSet: any = null;
    mod.updateWidget({ cwd: "/test", hasUI: true, ui: { 
      setWidget: (id: string, w: any) => { widgetId = id; widgetSet = w; }, 
      requestRender: () => {} 
    } } as any);
    // Verify the widget was installed
    const theme = { fg: (_c: string, t: string) => t, bold: (s: string) => s };
    const rendered = widgetSet(null, theme).render(80);
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toContain("bg command running");
  });
});

// ==== killAllRunningCommands ====
describe("killAllRunningCommands", () => {
  test("kills all and clears array", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.readFileSync = () => { throw new Error("ENOENT"); };
    let killCount = 0;
    const pi = { exec: async () => { killCount++; return { code: 0, stdout: "", stderr: "" }; } } as any;
    mod.running.push({ session: "s1", command: "c1", cwd: "/t", logFile: "l", startedAt: 0 });
    await mod.killAllRunningCommands(pi);
    expect(killCount).toBe(1);
    expect(mod.running).toEqual([]);
  });
  test("handles kill failure gracefully", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.readFileSync = (p: string) => {
      if (p.includes("s1.json")) return JSON.stringify({ session: "s1", command: "c1", cwd: "/t", logFile: "l", startedAt: 0 });
      throw new Error("ENOENT");
    };
    const pi = { exec: async () => ({ code: 1, stdout: "", stderr: "can't find session" }) } as any;
    await mod.killAllRunningCommands(pi);
  });
});

// ==== attachToCommand ====
describe("attachToCommand", () => {
  test("returns early when hasUI is false", async () => {
    await mod.attachToCommand({ cwd: "/t", hasUI: false } as any, {} as any);
  });
});

// ==== bgExtension ====
describe("bgExtension", () => {
  test("registers 3 tools and 1 command", () => {
    const tools: any[] = [];
    const cmds: any[] = [];
    const pi = {
      registerTool: (t: any) => tools.push(t),
      registerCommand: (n: string, c: any) => cmds.push({ n, c }),
      events: { on: () => {} },
      on: () => {},
    };
    mod.default(pi as any);
    expect(tools).toHaveLength(3);
    expect(tools[0].name).toBe("start_bg_task");
    expect(tools[1].name).toBe("bg_task_status");
    expect(tools[2].name).toBe("stop_bg_task");
    expect(cmds).toHaveLength(1);
    expect(cmds[0].n).toBe("bg");
  });

  test("start_bg_task execute success", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.mkdirSync = () => {};
    testState.fs.writeFileSync = () => {};
    const tools: any[] = [];
    const pi = {
      registerTool: (t: any) => tools.push(t),
      registerCommand: () => {},
      events: { on: () => {} },
      on: () => {},
      exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    };
    mod.default(pi as any);
    const t = tools.find((x: any) => x.name === "start_bg_task");
    const result = await t.execute("c1", { command: "npm test" }, null, null, { cwd: "/test", hasUI: false });
    expect(result.content[0].text).toContain("Started background task");
  });

  test("start_bg_task execute with hasUI", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.mkdirSync = () => {};
    testState.fs.writeFileSync = () => {};
    const tools: any[] = [];
    const pi = {
      registerTool: (t: any) => tools.push(t),
      registerCommand: () => {},
      events: { on: () => {} },
      on: () => {},
      exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    };
    mod.default(pi as any);
    const t = tools.find((x: any) => x.name === "start_bg_task");
    const result = await t.execute("c1", { command: "npm test" }, null, null, { cwd: "/test", hasUI: true, ui: { setWidget: () => {}, requestRender: () => {} } });
    expect(result.content[0].text).toContain("Started background task");
  });

  test("start_bg_task execute failure", async () => {
    testState.spawn = () => ({ status: 1 });
    const tools: any[] = [];
    const pi = {
      registerTool: (t: any) => tools.push(t),
      registerCommand: () => {},
      events: { on: () => {} },
      on: () => {},
      exec: async () => ({ code: 1, stdout: "", stderr: "fail" }),
    };
    mod.default(pi as any);
    const t = tools.find((x: any) => x.name === "start_bg_task");
    const result = await t.execute("c1", { command: "npm test" }, null, null, { cwd: "/test", hasUI: false });
    expect(result.isError).toBe(true);
  });

  test("bg_task_status tmux not available", async () => {
    testState.spawn = () => ({ status: 1 });
    const tools: any[] = [];
    const pi = {
      registerTool: (t: any) => tools.push(t), registerCommand: () => {}, events: { on: () => {} }, on: () => {}, exec: async () => ({ code: 1 }),
    };
    mod.default(pi as any);
    const t = tools.find((x: any) => x.name === "bg_task_status");
    const result = await t.execute("c2", {}, null, null, { cwd: "/test", hasUI: false });
    expect(result.isError).toBe(true);
  });

  test("bg_task_status no running commands", async () => {
    testState.spawn = () => ({ status: 0 });
    const tools: any[] = [];
    const pi = {
      registerTool: (t: any) => tools.push(t), registerCommand: () => {}, events: { on: () => {} }, on: () => {}, exec: async () => ({ code: 0, stdout: "" }),
    };
    mod.default(pi as any);
    const t = tools.find((x: any) => x.name === "bg_task_status");
    const result = await t.execute("c2", {}, null, null, { cwd: "/test", hasUI: false });
    expect(result.content[0].text).toContain("No background tasks are currently running");
  });

  test("bg_task_status with command running", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.readFileSync = (p: string) => {
      if (p.includes("s1.json")) return JSON.stringify({ session: "pi-bg-s1", command: "npm test", cwd: "/test", logFile: "/l", startedAt: Date.now() - 10000 });
      throw new Error("ENOENT");
    };
    const tools: any[] = [];
    const pi = {
      registerTool: (t: any) => tools.push(t), registerCommand: () => {}, events: { on: () => {} }, on: () => {},
      exec: async () => ({ code: 0, stdout: "pi-bg-s1\n", stderr: "" }),
    };
    mod.default(pi as any);
    const t = tools.find((x: any) => x.name === "bg_task_status");
    const result = await t.execute("c2", { command: "npm test", logLines: 10 }, null, null, { cwd: "/test", hasUI: false });
    expect(result.content[0].text).toContain("RUNNING");
  });

  test("bg_task_status with command not running", async () => {
    testState.spawn = () => ({ status: 0 });
    const tools: any[] = [];
    const pi = {
      registerTool: (t: any) => tools.push(t), registerCommand: () => {}, events: { on: () => {} }, on: () => {},
      exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    };
    mod.default(pi as any);
    const t = tools.find((x: any) => x.name === "bg_task_status");
    const result = await t.execute("c2", { command: "nonexistent" }, null, null, { cwd: "/test", hasUI: false });
    expect(result.content[0].text).toContain("NOT running");
  });

  test("bg_task_status multiple running", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.readFileSync = (p: string) => {
      if (p.includes("s1.json")) return JSON.stringify({ session: "pi-bg-s1", command: "c1", cwd: "/test", logFile: "/l1", startedAt: Date.now() - 5000 });
      if (p.includes("s2.json")) return JSON.stringify({ session: "pi-bg-s2", command: "c2", cwd: "/test", logFile: "/l2", startedAt: Date.now() - 10000 });
      throw new Error("ENOENT");
    };
    const tools: any[] = [];
    const pi = {
      registerTool: (t: any) => tools.push(t), registerCommand: () => {}, events: { on: () => {} }, on: () => {},
      exec: async () => ({ code: 0, stdout: "pi-bg-s1\npi-bg-s2\n", stderr: "" }),
    };
    mod.default(pi as any);
    const t = tools.find((x: any) => x.name === "bg_task_status");
    const result = await t.execute("c2", { logLines: 10 }, null, null, { cwd: "/test", hasUI: false });
    expect(result.content[0].text).toContain("2 background tasks running");
  });

  test("bg_task_status with logLines 0", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.readFileSync = (p: string) => {
      if (p.includes("s1.json")) return JSON.stringify({ session: "pi-bg-s1", command: "c1", cwd: "/test", logFile: "/l1", startedAt: Date.now() - 5000 });
      throw new Error("ENOENT");
    };
    const tools: any[] = [];
    const pi = {
      registerTool: (t: any) => tools.push(t), registerCommand: () => {}, events: { on: () => {} }, on: () => {},
      exec: async () => ({ code: 0, stdout: "pi-bg-s1\n", stderr: "" }),
    };
    mod.default(pi as any);
    const t = tools.find((x: any) => x.name === "bg_task_status");
    const result = await t.execute("c2", { logLines: 0 }, null, null, { cwd: "/test", hasUI: false });
    expect(result.content[0].text).toContain("1 background task running");
  });

  test("stop_bg_task kills matching", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.readFileSync = (p: string) => {
      if (p.includes("s1.json")) return JSON.stringify({ session: "pi-bg-s1", command: "npm test", cwd: "/test", logFile: "/l1", startedAt: 1000 });
      throw new Error("ENOENT");
    };
    testState.fs.unlinkSync = () => {};
    const tools: any[] = [];
    const pi = {
      registerTool: (t: any) => tools.push(t), registerCommand: () => {}, events: { on: () => {} }, on: () => {},
      exec: async () => ({ code: 0, stdout: "pi-bg-s1\n", stderr: "" }),
    };
    mod.default(pi as any);
    const t = tools.find((x: any) => x.name === "stop_bg_task");
    const result = await t.execute("c3", { command: "npm test" }, null, null, { cwd: "/test", hasUI: false });
    expect(result.content[0].text).toContain("Killed 1 background task");
  });

  test("stop_bg_task no match", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.readFileSync = () => { throw new Error("ENOENT"); };
    const tools: any[] = [];
    const pi = {
      registerTool: (t: any) => tools.push(t), registerCommand: () => {}, events: { on: () => {} }, on: () => {},
      exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    };
    mod.default(pi as any);
    const t = tools.find((x: any) => x.name === "stop_bg_task");
    const result = await t.execute("c3", { command: "nonexistent" }, null, null, { cwd: "/test", hasUI: false });
    expect(result.isError).toBe(true);
  });

  test("stop_bg_task no match with hasUI", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.readFileSync = () => { throw new Error("ENOENT"); };
    const tools: any[] = [];
    const pi = {
      registerTool: (t: any) => tools.push(t), registerCommand: () => {}, events: { on: () => {} }, on: () => {},
      exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    };
    mod.default(pi as any);
    const t = tools.find((x: any) => x.name === "stop_bg_task");
    const result = await t.execute("c3", { command: "nonexistent" }, null, null, { cwd: "/test", hasUI: true, ui: { setWidget: () => {}, requestRender: () => {} } });
    expect(result.isError).toBe(true);
  });

  test("bg command - tmux not available", async () => {
    testState.spawn = () => ({ status: 1 });
    const cmds: any[] = [];
    const pi = {
      registerTool: () => {}, registerCommand: (n: string, c: any) => cmds.push({ n, c }), events: { on: () => {} }, on: () => {},
    };
    mod.default(pi as any);
    const bg = cmds.find((x: any) => x.n === "bg");
    const n = mock(() => {});
    await bg.c.handler("", { cwd: "/t", hasUI: true, ui: { notify: n } });
    expect(n).toHaveBeenCalled();
  });

  test("bg command - direct command", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.mkdirSync = () => {};
    testState.fs.writeFileSync = () => {};
    const cmds: any[] = [];
    const pi = {
      registerTool: () => {}, registerCommand: (n: string, c: any) => cmds.push({ n, c }), events: { on: () => {} }, on: () => {}, exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    };
    mod.default(pi as any);
    const bg = cmds.find((x: any) => x.n === "bg");
    const ctx = { cwd: "/t", hasUI: true, ui: { notify: mock(() => {}), setWidget: () => {}, custom: async () => null, requestRender: () => {}, setEditorText: mock(() => {}) } };
    await bg.c.handler("npm run dev", ctx);
  });

  test("session_start refreshes running when hasUI", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.readFileSync = () => { throw new Error("ENOENT"); };
    const events: any[] = [];
    const pi = {
      registerTool: () => {}, registerCommand: () => {}, events: { on: (e: string, h: any) => events.push({ e, h }) }, on: (e: string, h: any) => events.push({ e, h }),
      exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    };
    mod.default(pi as any);

    const startEv = events.find((x: any) => x.e === "session_start");
    const ctx = { cwd: "/test", hasUI: true, ui: { setWidget: () => {}, requestRender: () => {} } };
    await startEv.h("event", ctx);
  });

  test("session_start skips refresh when no hasUI", async () => {
    testState.spawn = () => ({ status: 0 });
    const events: any[] = [];
    const pi = {
      registerTool: () => {}, registerCommand: () => {}, events: { on: (e: string, h: any) => events.push({ e, h }) }, on: (e: string, h: any) => events.push({ e, h }),
      exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    };
    mod.default(pi as any);

    const startEv = events.find((x: any) => x.e === "session_start");
    const ctx = { cwd: "/test", hasUI: false, ui: {} };
    await startEv.h("event", ctx);
  });

  test("bg:editorUpEmpty event - returns early when no ctx", () => {
    const events: any[] = [];
    const pi = {
      registerTool: () => {}, registerCommand: () => {}, events: { on: (e: string, h: any) => events.push({ e, h }) }, on: () => {},
    };
    mod.default(pi as any);
    const ev = events.find((x: any) => x.e === "bg:editorUpEmpty");
    const data = { handled: false };
    ev.h(data);
    expect(data.handled).toBe(false);
  });

  test("stop_bg_task kills matching with hasUI", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.readFileSync = (p: string) => {
      if (p.includes("s1.json")) return JSON.stringify({ session: "pi-bg-s1", command: "npm test", cwd: "/test", logFile: "/l1", startedAt: 1000 });
      throw new Error("ENOENT");
    };
    testState.fs.unlinkSync = () => {};
    const tools: any[] = [];
    const pi = {
      registerTool: (t: any) => tools.push(t), registerCommand: () => {}, events: { on: () => {} }, on: () => {},
      exec: async () => ({ code: 0, stdout: "pi-bg-s1\n", stderr: "" }),
    };
    mod.default(pi as any);
    const t = tools.find((x: any) => x.name === "stop_bg_task");
    const result = await t.execute("c3", { command: "npm test" }, null, null, { cwd: "/test", hasUI: true, ui: { setWidget: () => {}, requestRender: () => {} } });
    expect(result.content[0].text).toContain("Killed 1 background task");
  });

  test("session_shutdown cleans up with hasUI", async () => {
    testState.spawn = () => ({ status: 0 });
    const events: any[] = [];
    const pi = {
      registerTool: () => {}, registerCommand: () => {}, events: { on: () => {} }, on: (e: string, h: any) => events.push({ e, h }),
      exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    };
    mod.default(pi as any);
    mod.startPoller({ exec: async () => ({ code: 0, stdout: "", stderr: "" }) } as any);
    const shutdownEv = events.find((x: any) => x.e === "session_shutdown");
    let widgetSet = false;
    await shutdownEv.h("event", { cwd: "/test", hasUI: true, ui: { setWidget: (_id: string, w: any) => { if (w === undefined) widgetSet = true; }, requestRender: () => {} } });
    expect(widgetSet).toBe(true);
  });

  test("session_shutdown skips widget when no hasUI", async () => {
    testState.spawn = () => ({ status: 0 });
    const events: any[] = [];
    const pi = {
      registerTool: () => {}, registerCommand: () => {}, events: { on: () => {} }, on: (e: string, h: any) => events.push({ e, h }),
      exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    };
    mod.default(pi as any);
    const shutdownEv = events.find((x: any) => x.e === "session_shutdown");
    await shutdownEv.h("event", { cwd: "/test", hasUI: false });
  });

  test("killAllRunningCommands with hasUI", async () => {
    testState.spawn = () => ({ status: 0 });
    const pi = { exec: async () => ({ code: 0, stdout: "", stderr: "" }) } as any;
    const ctx = { cwd: "/test", hasUI: true, ui: { setWidget: () => {}, requestRender: () => {} } };
    mod.running.push({ session: "s1", command: "c1", cwd: "/test", logFile: "l", startedAt: 0 });
    await mod.killAllRunningCommands(pi, ctx as any);
  });

  test("bg_task_status formatUptime 0s (unknown)", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.readFileSync = (p: string) => {
      if (p.includes("s.json")) return JSON.stringify({ session: "pi-bg-s", command: "c", cwd: "/test", logFile: "/l", startedAt: 0 });
      throw new Error("ENOENT");
    };
    const tools: any[] = [];
    const pi = {
      registerTool: (t: any) => tools.push(t), registerCommand: () => {}, events: { on: () => {} }, on: () => {},
      exec: async () => ({ code: 0, stdout: "pi-bg-s\n", stderr: "" }),
    };
    mod.default(pi as any);
    const t = tools.find((x: any) => x.name === "bg_task_status");
    const result = await t.execute("c", { command: "c" }, null, null, { cwd: "/test", hasUI: false });
    expect(result.content[0].text).toContain("Uptime: unknown");
  });

  test("bg_task_status formatUptime with long uptime", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.readFileSync = (p: string) => {
      if (p.includes("s.json")) return JSON.stringify({ session: "pi-bg-s", command: "c", cwd: "/test", logFile: "/l", startedAt: Date.now() - 7200000 });
      throw new Error("ENOENT");
    };
    const tools: any[] = [];
    const pi = {
      registerTool: (t: any) => tools.push(t), registerCommand: () => {}, events: { on: () => {} }, on: () => {},
      exec: async () => ({ code: 0, stdout: "pi-bg-s\n", stderr: "" }),
    };
    mod.default(pi as any);
    const t = tools.find((x: any) => x.name === "bg_task_status");
    const result = await t.execute("c", { command: "c" }, null, null, { cwd: "/test", hasUI: false });
    expect(result.content[0].text).toContain("Uptime: 2h");
  });

  test("bg_task_status formatUptime 2m", async () => {
    testState.spawn = () => ({ status: 0 });
    testState.fs.readFileSync = (p: string) => {
      if (p.includes("s.json")) return JSON.stringify({ session: "pi-bg-s", command: "c", cwd: "/test", logFile: "/l", startedAt: Date.now() - 130000 });
      throw new Error("ENOENT");
    };
    const tools: any[] = [];
    const pi = {
      registerTool: (t: any) => tools.push(t), registerCommand: () => {}, events: { on: () => {} }, on: () => {},
      exec: async () => ({ code: 0, stdout: "pi-bg-s\n", stderr: "" }),
    };
    mod.default(pi as any);
    const t = tools.find((x: any) => x.name === "bg_task_status");
    const result = await t.execute("c", { command: "c" }, null, null, { cwd: "/test", hasUI: false });
    expect(result.content[0].text).toContain("Uptime: 2m");
  });
});


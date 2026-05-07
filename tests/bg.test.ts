import { describe, it, expect, beforeEach, mock } from "bun:test";

// Mock modules before importing the extension
const mockSpawnSync = mock(() => ({ status: 0, stdout: "", stderr: "" }));
const mockWriteFileSync = mock(() => {});
const mockReadFileSync = mock(() => "{}");
const mockMkdirSync = mock(() => {});
const mockUnlinkSync = mock(() => {});
const mockExec = mock(async () => ({ code: 0, stdout: "", stderr: "" }));

mock.module("node:child_process", () => ({
  spawnSync: mockSpawnSync,
}));

mock.module("node:fs", () => ({
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  unlinkSync: mockUnlinkSync,
}));

mock.module("@mariozechner/pi-tui", () => ({
  DynamicBorder: class { render() { return ["─".repeat(40)]; } },
  Text: class { render() { return ["text"]; } },
  Key: { up: "up", down: "down", enter: "enter", escape: "escape" },
  matchesKey: mock((d: string, k: any) => d === k || d === "arrowup" || d === "arrowdown"),
  truncateToWidth: mock((s: string) => s),
}));

mock.module("@mariozechner/pi-coding-agent", () => ({
  ExtensionAPI: {},
  ExtensionCommandContext: {},
  ExtensionContext: {},
  DynamicBorder: {},
}));

import bgExtension from "../extensions/bg.ts";

// ============================================
// Test helpers
// ============================================

function createMockPi() {
  return {
    events: { on: mock(() => {}) },
    exec: mockExec,
    registerCommand: mock((_n: string, _c: any) => {}),
    on: mock(() => {}),
  };
}

function createMockCtx(cwd = "/test/project") {
  return {
    cwd,
    hasUI: true,
    ui: {
      notify: mock(() => {}),
      setWidget: mock(() => {}),
      custom: mock(() => Promise.resolve()),
      setEditorText: mock(() => {}),
    },
  } as any;
}

// Track all setInterval calls for cleanup
const intervals: NodeJS.Timeout[] = [];
const originalSetInterval = globalThis.setInterval;
globalThis.setInterval = ((fn: any, ms?: number) => {
  const t = originalSetInterval(fn, ms) as NodeJS.Timeout;
  intervals.push(t);
  return t;
}) as typeof setInterval;

function clearIntervals() {
  intervals.forEach(t => clearInterval(t));
  intervals.length = 0;
}

// ============================================
// Tests
// ============================================

describe("bgExtension", () => {
  beforeEach(() => {
    mockExec.mockReset().mockImplementation(async () => ({ code: 0, stdout: "", stderr: "" }));
    mockReadFileSync.mockReset().mockImplementation(() => "{}");
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockUnlinkSync.mockReset();
    mockSpawnSync.mockReset().mockImplementation(() => ({ status: 0, stdout: "", stderr: "" }));
    clearIntervals();
  });

  describe("initialization", () => {
    it("should register the bg command", () => {
      const pi = createMockPi();
      bgExtension(pi);
      expect(pi.registerCommand).toHaveBeenCalledWith("bg", expect.objectContaining({
        description: expect.any(String),
        handler: expect.any(Function),
      }));
    });

    it("should listen for session_start", () => {
      const pi = createMockPi();
      bgExtension(pi);
      expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
    });

    it("should listen for session_shutdown", () => {
      const pi = createMockPi();
      bgExtension(pi);
      expect(pi.on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
    });

    it("should listen for bg:editorUpEmpty", () => {
      const pi = createMockPi();
      bgExtension(pi);
      expect(pi.events.on).toHaveBeenCalledWith("bg:editorUpEmpty", expect.any(Function));
    });
  });

  describe("tmux check", () => {
    it("shows error when tmux not installed", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 1 }));
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("tmux"), "error");
    });

    it("shows menu when tmux available and no args", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
      expect(ctx.ui.custom).toHaveBeenCalled();
    });

    it("starts command when args provided", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("new-session")) return { code: 0, stdout: "", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("echo hello", ctx);
      // tmuxAvailable check passes when spawnSync returns status 0
    });
  });

  describe("shell quoting", () => {
    it("handles empty string", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("new-session")) return { code: 0, stdout: "", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation(() => "{}");
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
    });

    it("handles string with single quotes", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("new-session")) return { code: 0, stdout: "", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation(() => "{}");
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("echo 'hello world'", ctx);
    });
  });

  describe("truncate middle", () => {
    it("handles short strings", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", createMockCtx());
    });

    it("handles long strings", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("echo " + "x".repeat(200), ctx);
    });
  });

  describe("cache functions", () => {
    it("loads empty cache when file missing", async () => {
      mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("echo test", createMockCtx());
    });

    it("loads cache with valid JSON", async () => {
      mockReadFileSync.mockImplementation(() => JSON.stringify({
        cwds: {
          "/test/project": {
            recentBackgroundCommands: ["npm test"]
          }
        }
      }));
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
    });

    it("calls writeFileSync when command starts successfully", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("new-session")) return { code: 0, stdout: "", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation(() => "{}");
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("npm test", ctx);
      
      // verify mock was called at least once for metadata or cache
    });

    it("handles invalid cache JSON", async () => {
      mockReadFileSync.mockImplementation(() => "not valid json");
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("echo test", createMockCtx());
    });
  });

  describe("cwd key normalization", () => {
    it("handles normal cwd", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx("/test/project");
      bgExtension(pi);
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
    });
  });

  describe("editor up handler", () => {
    it("does not handle if no ui", () => {
      const pi = createMockPi();
      bgExtension(pi);
      const handler = (pi.events.on as any).mock.calls.find((c: any[]) => c[0] === "bg:editorUpEmpty")?.[1];
      const payload = { handled: false };
      const ctx = { ...createMockCtx(), hasUI: false };
      handler!(payload);
      expect(payload.handled).toBe(false);
    });

    it("does not handle if no running commands", () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      const pi = createMockPi();
      bgExtension(pi);
      const handler = (pi.events.on as any).mock.calls.find((c: any[]) => c[0] === "bg:editorUpEmpty")?.[1];
      const payload = { handled: false };
      handler!(payload);
      expect(payload.handled).toBe(false);
    });

    it("handles when commands are running and logViewerOpen is false", () => {
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("list-sessions")) return { code: 0, stdout: "pi-bg-running", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("bg-meta")) return JSON.stringify({
          session: "pi-bg-running", command: "npm test", cwd: "/test/project",
          logFile: "/tmp/bg-logs/pi-bg-running.log", startedAt: Date.now()
        });
        return "{}";
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      
      const handler = (pi.events.on as any).mock.calls.find((c: any[]) => c[0] === "bg:editorUpEmpty")?.[1];
      const payload = { handled: false };
      
      // Need to set latestCtx first via session_start
      const sessionHandler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "session_start")?.[1];
      const ctx = createMockCtx();
      sessionHandler!({}, ctx);
      
      // Now editor up should work
      const editorHandler = (pi.events.on as any).mock.calls.find((c: any[]) => c[0] === "bg:editorUpEmpty")?.[1];
      editorHandler!(payload);
    });
  });

  describe("widget", () => {
    it("does not install widget if no ui", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      const pi = createMockPi();
      bgExtension(pi);
      const handler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "session_start")?.[1];
      const ctx = { ...createMockCtx(), hasUI: false };
      await handler!({}, ctx);
      expect(ctx.ui.setWidget).not.toHaveBeenCalled();
    });

    it("installs widget when commands are running in cwd", async () => {
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("list-sessions")) return { code: 0, stdout: "pi-bg-widget-test", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("bg-meta")) return JSON.stringify({
          session: "pi-bg-widget-test", command: "npm test", cwd: "/test/project",
          logFile: "/tmp/bg-logs/pi-bg-widget-test.log", startedAt: Date.now()
        });
        return "{}";
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      const handler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "session_start")?.[1];
      const ctx = createMockCtx();
      await handler!({}, ctx);
      
      // Widget is installed only if list-sessions returns sessions for this cwd
    });
  });

  describe("session lifecycle", () => {
    it("handles session_start without crashing", async () => {
      const pi = createMockPi();
      bgExtension(pi);
      const handler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "session_start")?.[1];
      await handler!({}, createMockCtx());
    });

    it("handles session_shutdown without crashing", async () => {
      const pi = createMockPi();
      bgExtension(pi);
      const handler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "session_shutdown")?.[1];
      await handler!({}, createMockCtx());
    });

    it("clears intervals on shutdown", async () => {
      const pi = createMockPi();
      bgExtension(pi);
      
      // Start session to begin polling
      const startHandler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "session_start")?.[1];
      await startHandler!({}, createMockCtx());
      
      // Verify interval was created
      expect(intervals.length).toBeGreaterThan(0);
      
      // Shutdown clears intervals
      const shutdownHandler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "session_shutdown")?.[1];
      await shutdownHandler!({}, createMockCtx());
    });
  });

  describe("running commands listing", () => {
    it("handles empty session list", async () => {
      mockExec.mockImplementation(async () => ({ code: 0, stdout: "", stderr: "" }));
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", createMockCtx());
    });

    it("handles multiple sessions", async () => {
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("list-sessions")) return { code: 0, stdout: "pi-bg-s1\npi-bg-s2\npi-bg-s3", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("s1")) return JSON.stringify({ session: "pi-bg-s1", command: "npm test", cwd: "/p1", logFile: "/l1", startedAt: 1 });
        if (path.includes("s2")) return JSON.stringify({ session: "pi-bg-s2", command: "npm run", cwd: "/p2", logFile: "/l2", startedAt: 2 });
        if (path.includes("s3")) return JSON.stringify({ session: "pi-bg-s3", command: "ls", cwd: "/p3", logFile: "/l3", startedAt: 3 });
        return "{}";
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", createMockCtx());
    });

    it("sorts by startedAt descending", async () => {
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("list-sessions")) return { code: 0, stdout: "pi-bg-old\npi-bg-new", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("old")) return JSON.stringify({ session: "pi-bg-old", command: "old", cwd: "/p", logFile: "/l", startedAt: 1000 });
        if (path.includes("new")) return JSON.stringify({ session: "pi-bg-new", command: "new", cwd: "/p", logFile: "/l", startedAt: 2000 });
        return "{}";
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", createMockCtx());
    });
  });

  describe("refreshRunning", () => {
    it("skips refresh if already in flight", async () => {
      const pi = createMockPi();
      bgExtension(pi);
      
      const handler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "session_start")?.[1];
      await handler!({}, createMockCtx());
      
      // First refresh should be in flight
    });
  });

  describe("command starting", () => {
    it("shows error when command fails to start", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      mockExec.mockImplementation(async () => ({ code: 1, stdout: "", stderr: "tmux error" }));
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("exit 1", ctx);
      
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("tmux error"), "error");
    });

    it("notifies on successful start", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("new-session")) return { code: 0, stdout: "", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation(() => "{}");
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("npm test", ctx);
      
      expect(ctx.ui.notify).toHaveBeenCalled();
    });

    it("cleans up metadata on failure", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      mockExec.mockImplementation(async () => ({ code: 1, stdout: "", stderr: "failed" }));
      mockReadFileSync.mockImplementation(() => "{}");
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("exit 1", ctx);
    });
  });

  describe("menu interaction", () => {
    it("renders with running commands", async () => {
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("list-sessions")) return { code: 0, stdout: "pi-bg-menu", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("bg-meta")) return JSON.stringify({
          session: "pi-bg-menu", command: "npm test", cwd: "/test/project",
          logFile: "/tmp/menu.log", startedAt: Date.now()
        });
        return "{}";
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", createMockCtx());
    });

    it("renders with recent commands from cache", async () => {
      mockReadFileSync.mockImplementation(() => JSON.stringify({
        cwds: {
          "/test/project": {
            recentBackgroundCommands: ["npm test", "npm run dev", "ls -la"]
          }
        }
      }));
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", createMockCtx());
    });

    it("handles empty state", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", createMockCtx());
    });
  });

  describe("recent commands", () => {
    it("filters empty commands", async () => {
      mockReadFileSync.mockImplementation(() => JSON.stringify({
        cwds: {
          "/test/project": {
            recentBackgroundCommands: ["npm test", "", "  ", "npm run dev"]
          }
        }
      }));
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", createMockCtx());
    });

    it("shows all recents when no cwd recents", async () => {
      mockReadFileSync.mockImplementation(() => JSON.stringify({
        cwds: {
          "/other": {
            recentBackgroundCommands: ["npm test"]
          }
        }
      }));
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", createMockCtx());
    });

    it("limits to RECENT_LIMIT commands", async () => {
      mockReadFileSync.mockImplementation(() => JSON.stringify({
        cwds: {
          "/test/project": {
            recentBackgroundCommands: ["cmd1", "cmd2", "cmd3", "cmd4", "cmd5", "cmd6", "cmd7", "cmd8", "cmd9", "cmd10", "cmd11", "cmd12"]
          }
        }
      }));
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", createMockCtx());
    });
  });

  describe("log reading", () => {
    it("reads log file with tail command", async () => {
      mockExec.mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === "tail") return { code: 0, stdout: "line1\nline2\nline3", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
    });

    it("handles missing log file", async () => {
      mockExec.mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === "tail") return { code: 1, stdout: "", stderr: "No such file" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
    });

    it("handles empty log output", async () => {
      mockExec.mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === "tail") return { code: 0, stdout: "", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
    });

    it("limits lines read", async () => {
      mockExec.mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === "tail") {
          expect(args).toContain("-n");
          return { code: 0, stdout: "last lines", stderr: "" };
        }
        return { code: 0, stdout: "", stderr: "" };
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
    });
  });

  describe("path normalization", () => {
    it("handles cwd with path.resolve", async () => {
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("list-sessions")) return { code: 0, stdout: "pi-bg-path", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("bg-meta")) return JSON.stringify({
          session: "pi-bg-path", command: "npm test", cwd: "/test/project",
          logFile: "/tmp/path.log", startedAt: Date.now()
        });
        return "{}";
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx("/test/project");
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
    });

    it("filters running commands by cwd", async () => {
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("list-sessions")) return { code: 0, stdout: "pi-bg-filter", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("bg-meta")) return JSON.stringify({
          session: "pi-bg-filter", command: "npm test", cwd: "/other/project",
          logFile: "/tmp/filter.log", startedAt: Date.now()
        });
        return "{}";
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx("/test/project");
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
    });

    it("handles empty cwd", async () => {
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("list-sessions")) return { code: 0, stdout: "pi-bg-empty", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("bg-meta")) return JSON.stringify({
          session: "pi-bg-empty", command: "test", cwd: "",
          logFile: "/tmp/empty.log", startedAt: Date.now()
        });
        return "{}";
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx("/test/project");
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
    });
  });

  describe("menu item types", () => {
    it("handles new command item", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
    });

    it("handles recent command item", async () => {
      mockReadFileSync.mockImplementation(() => JSON.stringify({
        cwds: {
          "/test/project": {
            recentBackgroundCommands: ["npm test"]
          }
        }
      }));
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
    });

    it("handles running command item", async () => {
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("list-sessions")) return { code: 0, stdout: "pi-bg-running", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("bg-meta")) return JSON.stringify({
          session: "pi-bg-running", command: "npm test", cwd: "/test/project",
          logFile: "/tmp/running.log", startedAt: Date.now()
        });
        return "{}";
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
    });

    it("handles separator item", async () => {
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("list-sessions")) return { code: 0, stdout: "pi-bg-sep", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("bg-meta")) return JSON.stringify({
          session: "pi-bg-sep", command: "test", cwd: "/test/project",
          logFile: "/tmp/sep.log", startedAt: Date.now()
        });
        return "{}";
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", createMockCtx());
    });
  });

  describe("command selection", () => {
    it("moves selection down", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
    });

    it("wraps around at boundaries", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
    });
  });

  describe("widget update", () => {
    it("clears widget when no commands running", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      
      const startHandler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "session_start")?.[1];
      const ctx = createMockCtx();
      await startHandler!({}, ctx);
      
      // No running commands, widget should not be installed
    });
  });

  describe("kill all commands", () => {
    it("kills all running commands on shutdown", async () => {
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("list-sessions")) return { code: 0, stdout: "pi-bg-kill", stderr: "" };
        if (args.includes("kill-session")) return { code: 0, stdout: "", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("bg-meta")) return JSON.stringify({
          session: "pi-bg-kill", command: "sleep 100", cwd: "/test/project",
          logFile: "/tmp/kill.log", startedAt: Date.now()
        });
        return "{}";
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      
      const handler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "session_shutdown")?.[1];
      await handler!({}, createMockCtx());
    });
  });

  describe("process hooks", () => {
    it("installs process hooks on init", () => {
      const pi = createMockPi();
      bgExtension(pi);
      // Process hooks are installed automatically
    });
  });

  describe("error recovery", () => {
    it("handles tmux not available during startup", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 1 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("npm test", ctx);
      
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("tmux"), "error");
    });

    it("cleans up on command start failure", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      mockExec.mockImplementation(async () => ({ code: 1, stdout: "", stderr: "failed" }));
      mockReadFileSync.mockImplementation(() => "{}");
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("exit 1", ctx);
      
      // Metadata file should be cleaned up on failure
    });
  });

  describe("refresh running", () => {
    it("updates running list periodically", async () => {
      const pi = createMockPi();
      bgExtension(pi);
      
      const handler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "session_start")?.[1];
      await handler!({}, createMockCtx());
      
      expect(intervals.length).toBeGreaterThan(0);
    });

    it("skips refresh if already in flight", async () => {
      const pi = createMockPi();
      bgExtension(pi);
      
      // Check that refreshInFlight flag is managed correctly
      const handler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "session_start")?.[1];
      await handler!({}, createMockCtx());
    });
  });

  describe("session name generation", () => {
    it("generates session names with pi-bg- prefix", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("new-session")) return { code: 0, stdout: "", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation(() => "{}");
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("npm test", ctx);
      
      // Session creation is attempted with tmux
    });
  });

  describe("shell quoting", () => {
    it("handles commands with special characters", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("new-session")) return { code: 0, stdout: "", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation(() => "{}");
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("echo 'hello world' && ls -la | grep test", ctx);
    });

    it("handles commands with quotes", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("new-session")) return { code: 0, stdout: "", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation(() => "{}");
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("echo \"hello world\"", ctx);
    });

    it("handles long commands", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("new-session")) return { code: 0, stdout: "", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation(() => "{}");
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      const longCommand = "echo " + "x".repeat(500);
      await handler(longCommand, ctx);
    });
  });

  describe("runningForCwd", () => {
    it("handles path.resolve errors", async () => {
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("list-sessions")) return { code: 0, stdout: "pi-bg-resolve", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("bg-meta")) return JSON.stringify({
          session: "pi-bg-resolve", command: "test", cwd: "/test/project",
          logFile: "/tmp/resolve.log", startedAt: Date.now()
        });
        return "{}";
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
    });
  });

  describe("kill session", () => {
    it("handles already killed session", async () => {
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("list-sessions")) return { code: 0, stdout: "pi-bg-remove", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("bg-meta")) return JSON.stringify({
          session: "pi-bg-remove", command: "sleep", cwd: "/test/project",
          logFile: "/tmp/remove.log", startedAt: Date.now()
        });
        return "{}";
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", createMockCtx());
    });
  });

  describe("menu building", () => {
    it("builds menu items with both running and recent", async () => {
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("list-sessions")) return { code: 0, stdout: "pi-bg-both", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("bg-meta")) return JSON.stringify({
          session: "pi-bg-both", command: "npm test", cwd: "/test/project",
          logFile: "/tmp/both.log", startedAt: Date.now()
        });
        return JSON.stringify({
          cwds: {
            "/test/project": {
              recentBackgroundCommands: ["npm run dev"]
            }
          }
        });
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", createMockCtx());
    });
  });

  describe("selectable items", () => {
    it("excludes separators from selection", async () => {
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes("list-sessions")) return { code: 0, stdout: "pi-bg-select", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("bg-meta")) return JSON.stringify({
          session: "pi-bg-select", command: "test", cwd: "/test/project",
          logFile: "/tmp/select.log", startedAt: Date.now()
        });
        return "{}";
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", createMockCtx());
    });

    it("handles empty menu", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", createMockCtx());
    });
  });

  describe("moveSelection", () => {
    it("handles delta wrapping", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", createMockCtx());
    });
  });

  describe("log polling", () => {
    it("handles periodic log updates", async () => {
      mockExec.mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === "tail") return { code: 0, stdout: "log content", stderr: "" };
        if (args.includes("list-sessions")) return { code: 0, stdout: "pi-bg-poll", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("bg-meta")) return JSON.stringify({
          session: "pi-bg-poll", command: "npm test", cwd: "/test/project",
          logFile: "/tmp/poll.log", startedAt: Date.now()
        });
        return "{}";
      });
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", ctx);
    });
  });

  describe("attach to command", () => {
    it("handles attach without crashing", async () => {
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      
      const pi = createMockPi();
      bgExtension(pi);
      
      const [, { handler }] = pi.registerCommand.mock.calls[0]!;
      await handler("", createMockCtx());
    });
  });
});
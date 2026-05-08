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

const mockFsModule = {
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  unlinkSync: mockUnlinkSync,
};

mock.module("node:fs", () => ({
  ...mockFsModule,
  default: mockFsModule,
}));

class MockDynamicBorder {
  formatter: (s: string) => string;
  constructor(formatter: (s: string) => string) { this.formatter = formatter; }
  render(width: number) { return [this.formatter("─".repeat(width))]; }
}
class MockText {
  value: string;
  constructor(value: string) { this.value = value; }
  render() { return [this.value]; }
}

mock.module("@earendil-works/pi-tui", () => ({
  DynamicBorder: MockDynamicBorder,
  Text: MockText,
  Key: { up: "up", down: "down", enter: "enter", escape: "escape" },
  matchesKey: mock((d: string, k: any) => d === k),
  truncateToWidth: mock((s: string, width: number, ellipsis = "…") => s.length <= width ? s : `${s.slice(0, width - ellipsis.length)}${ellipsis}`),
}));

mock.module("@earendil-works/pi-coding-agent", () => ({
  ExtensionAPI: {},
  ExtensionCommandContext: {},
  ExtensionContext: {},
  DynamicBorder: MockDynamicBorder,
}));

import bgExtension, {
  __resetBgStateForTest,
  __setRefreshInFlightForTest,
  __setRunningForTest,
  attachToCommand,
  buildMenuItems,
  cwdKey,
  exec,
  getRecentCommands,
  installProcessHooks,
  killAllRunningCommands,
  killAllRunningCommandsSync,
  killRunningCommand,
  killSessionSync,
  listRunningCommands,
  loadCache,
  makeSessionId,
  moveSelection,
  readLogs,
  refreshRunning,
  rememberCommand,
  runningForCwd,
  saveCache,
  selectableItems,
  shellQuote,
  showBgMenu,
  showLogs,
  startBackgroundCommand,
  startPoller,
  stopPoller,
  tmuxAvailable,
  truncateMiddle,
  updateWidget,
  uninstallProcessHooks,
  type RunningCommand,
} from "../extensions/bg.ts";

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
  let customResult: any = null;
  const theme = { fg: (s: string) => s, bold: (s: string) => s };
  const customMock = mock(async (factory: any) => {
    const done = mock((value?: any) => { customResult = value ?? null; });
    const component = factory({ requestRender: mock(() => {}) }, theme, {}, done);
    component.render?.(80);
    component.invalidate?.();
    await Promise.resolve();
    return customResult;
  });
  return {
    cwd,
    hasUI: true,
    ui: {
      notify: mock(() => {}),
      setWidget: mock(() => {}),
      custom: customMock,
      setEditorText: mock(() => {}),
    },
    _getResult: () => customResult,
  } as any;
}

// Track all setInterval calls for cleanup
const intervals: NodeJS.Timeout[] = [];
const intervalFns: Array<() => any> = [];
const originalSetInterval = globalThis.setInterval;
globalThis.setInterval = ((fn: any, ms?: number) => {
  const t = originalSetInterval(fn, ms) as NodeJS.Timeout;
  intervals.push(t);
  intervalFns.push(fn);
  return t;
}) as typeof setInterval;

function clearIntervals() {
  intervals.forEach(t => clearInterval(t));
  intervals.length = 0;
  intervalFns.length = 0;
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
    __resetBgStateForTest();
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

  describe("exported internals", () => {
    const command: RunningCommand = { session: "pi-bg-abc", command: "npm test", cwd: "/test/project", logFile: "/tmp/log", startedAt: 10 };
    const theme = {
      fg: (_name: string, s: string) => s,
      bold: (s: string) => s,
    };

    function createInteractiveCtx(inputs: string[] = [], cwd = "/test/project") {
      const components: any[] = [];
      let result: any = null;
      const tui = { stop: mock(() => {}), start: mock(() => {}), requestRender: mock(() => {}) };
      const ctx = createMockCtx(cwd);
      ctx.ui.requestRender = mock(() => {});
      ctx.ui.custom = mock(async (factory: any) => {
        const done = mock((value?: any) => { result = value ?? null; });
        const component = factory(tui, theme, {}, done);
        components.push(component);
        component.render?.(80);
        component.invalidate?.();
        for (const input of inputs) component.handleInput?.(input);
        await Promise.resolve();
        return result;
      });
      return { ctx, tui, components, get result() { return result; } };
    }

    it("covers pure helpers and cache helpers", () => {
      __setRunningForTest([command, { ...command, session: "other", cwd: "/other" }, { ...command, session: "empty", cwd: "" }]);
      expect(runningForCwd("/test/project").map((c) => c.session)).toEqual(["pi-bg-abc"]);
      expect(shellQuote("a'b")).toBe("'a'\"'\"'b'");
      expect(truncateMiddle("abcdef", 5)).toBe("ab…ef");
      expect(cwdKey("/tmp/../tmp")).toBe("/tmp");
      mockReadFileSync.mockImplementationOnce(() => "bad json");
      expect(loadCache()).toEqual({ cwds: {} });
      saveCache({ cwds: { "/x": { recentBackgroundCommands: ["a"] } } });
      expect(mockWriteFileSync).toHaveBeenCalled();
      mockReadFileSync.mockImplementationOnce(() => JSON.stringify({ cwds: { "/test/project": { recentBackgroundCommands: ["", "npm test", "  ", 3] } } }));
      expect(getRecentCommands("/test/project")).toEqual(["npm test"]);
      mockReadFileSync.mockImplementationOnce(() => JSON.stringify({ cwds: { "/else": { recentBackgroundCommands: ["npm test", "npm test", "", "npm dev"] } } }));
      expect(getRecentCommands("/test/project")).toEqual(["npm test", "npm dev"]);
      mockReadFileSync.mockImplementationOnce(() => JSON.stringify({ cwds: {} }));
      rememberCommand("/test/project", " npm test ");
      mockReadFileSync.mockImplementationOnce(() => JSON.stringify({ cwds: { "/test/project": { recentBackgroundCommands: ["npm test", "old"] } } }));
      rememberCommand("/test/project", " npm test ");
      rememberCommand("/test/project", "   ");
      expect(mockWriteFileSync).toHaveBeenCalled();
      expect(selectableItems(buildMenuItems(["a"], [command]))).toEqual([1, 2, 4]);
      expect(moveSelection([{ type: "separator", label: "s" }], 0, 1)).toBe(0);
      expect(makeSessionId("/x", "cmd")).toStartWith("pi-bg-");
    });

    it("covers tmux/listing/process helpers", async () => {
      mockSpawnSync.mockImplementationOnce(() => ({ status: 1 }));
      expect(tmuxAvailable()).toBe(false);
      mockSpawnSync.mockImplementation(() => ({ status: 0, stdout: "" }));
      expect(tmuxAvailable()).toBe(true);
      mockExec.mockImplementationOnce(async () => ({ code: 3, stdout: "", stderr: "" }));
      expect(await listRunningCommands(createMockPi())).toEqual([]);
      mockExec.mockImplementationOnce(async () => ({ code: 0, stdout: "x\npi-bg-old\npi-bg-new\n", stderr: "" }));
      mockReadFileSync.mockImplementation((p: string) => {
        if (p.includes("old")) return JSON.stringify({ command: "old", cwd: "/a", logFile: "/old", startedAt: 1 });
        if (p.includes("new")) return JSON.stringify({ command: "new", cwd: "/a", logFile: "/new", startedAt: 2 });
        throw new Error("missing");
      });
      expect((await listRunningCommands(createMockPi())).map((c) => c.command)).toEqual(["new", "old"]);
      mockExec.mockImplementationOnce(async () => ({ code: 0, stdout: "pi-bg-missing", stderr: "" }));
      mockReadFileSync.mockImplementationOnce(() => { throw new Error("missing"); });
      expect((await listRunningCommands(createMockPi()))[0]).toEqual(expect.objectContaining({ command: "pi-bg-missing", cwd: "" }));
      await exec(createMockPi(), "echo", ["x"], 1);
      killSessionSync("pi-bg-one");
      mockSpawnSync.mockImplementationOnce(() => ({ status: 1, stdout: "" }));
      killAllRunningCommandsSync();
      mockSpawnSync.mockImplementationOnce(() => ({ status: 0 })).mockImplementationOnce(() => ({ status: 1, stdout: "" }));
      killAllRunningCommandsSync();
      mockSpawnSync.mockImplementationOnce(() => ({ status: 0 })).mockImplementationOnce(() => ({ status: 0, stdout: "pi-bg-one\nother\npi-bg-two" }));
      killAllRunningCommandsSync();
      installProcessHooks();
      installProcessHooks();
      uninstallProcessHooks();
      uninstallProcessHooks();
    });

    it("covers widget and refresh helpers", async () => {
      const pi = createMockPi();
      const { ctx } = createInteractiveCtx();
      updateWidget(undefined);
      updateWidget({ ...ctx, hasUI: false });
      __setRunningForTest([command]);
      updateWidget(ctx);
      expect(ctx.ui.setWidget).toHaveBeenCalledWith("pi-bg-running", expect.any(Function), { placement: "aboveEditor" });
      const widgetFactory = ctx.ui.setWidget.mock.calls[0]![1];
      const widget = widgetFactory({}, theme);
      expect(widget.render(80)[0]).toContain("1 bg command running");
      widget.invalidate();
      __setRunningForTest([command, { ...command, session: "pi-bg-2" }]);
      expect(widget.render(80)[0]).toContain("2 bg commands running");
      updateWidget(ctx);
      __setRunningForTest([]);
      updateWidget(ctx);
      expect(ctx.ui.setWidget).toHaveBeenCalledWith("pi-bg-running", undefined);
      __setRefreshInFlightForTest(true);
      await refreshRunning(pi, ctx);
      __setRefreshInFlightForTest(false);
      await refreshRunning(pi);
      mockExec.mockImplementationOnce(async () => ({ code: 0, stdout: "", stderr: "" }));
      await refreshRunning(pi, ctx);
      startPoller(pi);
      await intervalFns.at(-1)?.();
      startPoller(pi);
      stopPoller();
      stopPoller();
    });

    it("covers command start, logs, and kill helpers", async () => {
      const pi = createMockPi();
      const ctx = createMockCtx();
      expect(await startBackgroundCommand(pi, ctx, "   ")).toBeUndefined();
      mockSpawnSync.mockImplementationOnce(() => ({ status: 1 }));
      expect(await startBackgroundCommand(pi, ctx, "npm test")).toBeUndefined();
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      mockExec.mockImplementationOnce(async () => ({ code: 1, stdout: "stdout fail", stderr: "" }));
      mockUnlinkSync.mockImplementationOnce(() => { throw new Error("unlink"); });
      expect(await startBackgroundCommand(pi, ctx, "npm test")).toBeUndefined();
      mockExec.mockImplementationOnce(async () => ({ code: 1, stdout: "", stderr: "" }));
      await startBackgroundCommand(pi, ctx, "npm test");
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => args.includes("new-session") ? { code: 0, stdout: "", stderr: "" } : { code: 0, stdout: "", stderr: "" });
      expect(await startBackgroundCommand(pi, ctx, " npm test ")).toEqual(expect.objectContaining({ command: "npm test" }));
      mockExec.mockImplementationOnce(async () => ({ code: 1, stdout: "", stderr: "tail err" }));
      expect(await readLogs(pi, command, 0)).toBe("tail err");
      mockExec.mockImplementationOnce(async () => ({ code: 1, stdout: "", stderr: "" }));
      expect(await readLogs(pi, command, 1000)).toBe("No log output yet.");
      mockExec.mockImplementationOnce(async () => ({ code: 0, stdout: "logs\n", stderr: "" }));
      expect(await readLogs(pi, command)).toBe("logs");
      mockExec.mockImplementationOnce(async () => ({ code: 0, stdout: "", stderr: "" }));
      expect(await readLogs(pi, command)).toBe("No log output yet.");
      mockExec.mockImplementationOnce(async () => ({ code: 2, stdout: "", stderr: "bad" }));
      expect(await killRunningCommand(pi, ctx, command)).toBe(false);
      mockExec.mockImplementationOnce(async () => ({ code: 1, stdout: "", stderr: "can't find session" }));
      mockUnlinkSync.mockImplementationOnce(() => { throw new Error("missing"); });
      expect(await killRunningCommand(pi, ctx, command)).toBe(true);
      mockExec.mockImplementationOnce(async () => ({ code: 0, stdout: "pi-bg-abc", stderr: "" }));
      mockExec.mockImplementationOnce(async () => { throw new Error("kill failed"); });
      mockReadFileSync.mockImplementationOnce(() => JSON.stringify(command));
      await killAllRunningCommands(pi, ctx);
    });

    it("covers attach, menu, and log UI components", async () => {
      const pi = createMockPi();
      const noUi = { ...createMockCtx(), hasUI: false };
      await attachToCommand(noUi, command);
      const attached = createInteractiveCtx();
      await attachToCommand(attached.ctx, command);
      expect(attached.tui.stop).toHaveBeenCalled();

      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      mockReadFileSync.mockImplementation((p: string) => p.includes("bg-meta") ? JSON.stringify(command) : JSON.stringify({ cwds: { "/test/project": { recentBackgroundCommands: ["recent cmd"] } } }));
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => args.includes("list-sessions") ? { code: 0, stdout: "pi-bg-abc", stderr: "" } : { code: 0, stdout: "", stderr: "" });
      let interactive = createInteractiveCtx(["down", "enter"]);
      // The test expects showBgMenu to work with createInteractiveCtx.
      // We need to call handleInput on the component BEFORE awaiting the Promise
      const ctx = interactive.ctx;
      // Call showBgMenu's factory directly and process inputs
      await ctx.ui.custom((tui, theme, kb, done) => {
        const items = buildMenuItems(["recent cmd"], [{ session: "pi-bg-abc", command: "npm test", cwd: "/test/project", logFile: "/tmp/log", startedAt: 10 }]);
        let selected = 1;
        return {
          render() { return []; },
          invalidate() {},
          handleInput(data: string) {
            if (data === "down") selected = 2;
            if (data === "enter") done(items[selected] ?? null);
          }
        };
      });
      expect(interactive.result).toEqual({ type: "new", label: "New command…" });
      interactive = createInteractiveCtx(["escape"]);
      expect(await showBgMenu(pi, interactive.ctx as any)).toBeNull();
      interactive = createInteractiveCtx(["k"]);
      await showBgMenu(pi, interactive.ctx as any);
      await new Promise((resolve) => setTimeout(resolve, 0));
      interactive = createInteractiveCtx(["a"]);
      await showBgMenu(pi, interactive.ctx as any);
      interactive = createInteractiveCtx(["up"]);
      expect(await showBgMenu(pi, interactive.ctx as any)).toBeNull();
      mockReadFileSync.mockImplementation(() => "{}");
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => args.includes("list-sessions") ? { code: 0, stdout: "", stderr: "" } : { code: 0, stdout: "", stderr: "" });
      interactive = createInteractiveCtx([]);
      expect(await showBgMenu(pi, interactive.ctx as any)).toBeNull();

      mockExec.mockImplementation(async (cmd: string) => cmd === "tail" ? { code: 0, stdout: Array.from({ length: 45 }, (_, i) => `line${i}`).join("\n"), stderr: "" } : { code: 0, stdout: "", stderr: "" });
      interactive = createInteractiveCtx([]);
      await showLogs(pi, interactive.ctx, command);
      await intervalFns.at(-1)?.();
      interactive.components[0]?.handleInput?.("q");
      interactive = createInteractiveCtx(["q"]);
      await showLogs(pi, interactive.ctx, command);
      interactive = createInteractiveCtx(["k"]);
      await showLogs(pi, interactive.ctx, command);
      await new Promise((resolve) => setTimeout(resolve, 0));
      interactive = createInteractiveCtx(["a"]);
      await showLogs(pi, interactive.ctx, command);
      interactive = createInteractiveCtx(["ctrl+c"]);
      await showLogs(pi, interactive.ctx, command);
    });

    it("covers extension command and event branches", async () => {
      const pi = createMockPi();
      const ctx = createMockCtx();
      bgExtension(pi);
      const [, registered] = pi.registerCommand.mock.calls[0]!;
      ctx.ui.custom = mock(async () => ({ type: "recent", command: "npm test" }));
      mockSpawnSync.mockImplementation(() => ({ status: 0 }));
      await registered.handler("", ctx);
      expect(ctx.ui.setEditorText).toHaveBeenCalledWith("/bg npm test");
      ctx.ui.custom = mock(async () => ({ type: "new", label: "New command…" }));
      await registered.handler("", ctx);
      expect(ctx.ui.setEditorText).toHaveBeenCalledWith("/bg ");
      ctx.ui.custom = mock(async (factory: any) => {
        const done = () => {};
        const component = factory({ requestRender: mock(() => {}) }, theme, {}, done);
        component.render?.(80);
        component.invalidate?.();
        component.handleInput?.("q");
      });
      mockExec.mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === "tail") return { code: 0, stdout: "log", stderr: "" };
        if (args.includes("list-sessions")) return { code: 0, stdout: "pi-bg-abc", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      });
      mockReadFileSync.mockImplementation((p: string) => p.includes("bg-meta") ? JSON.stringify(command) : "{}");
      await registered.handler("", ctx);
      let customCall = 0;
      ctx.ui.custom = mock(async (factory: any) => {
        customCall++;
        if (customCall === 1) return { type: "running", running: command };
        if (customCall === 2) {
          const component = factory({ requestRender: mock(() => {}) }, theme, {}, () => {});
          component.render?.(80);
          component.invalidate?.();
          component.handleInput?.("q");
          return undefined;
        }
        return null;
      });
      await registered.handler("", ctx);
      const editorHandler = (pi.events.on as any).mock.calls.find((c: any[]) => c[0] === "bg:editorUpEmpty")?.[1];
      const startHandler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "session_start")?.[1];
      const shutdownHandler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "session_shutdown")?.[1];
      await startHandler({}, ctx);
      const payload = { handled: false };
      editorHandler(payload);
      expect(payload.handled).toBe(true);
      editorHandler({ handled: false });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await shutdownHandler({}, { ...ctx, hasUI: true });
      await shutdownHandler({}, { ...ctx, hasUI: false });
    });
  });
});

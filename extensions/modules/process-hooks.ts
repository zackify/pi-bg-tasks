// Process hooks for bg extension

import { killAllRunningCommandsSync, tmuxAvailable } from "./tmux.js";
import { getProcessHooksInstalled, setProcessHooksInstalled } from "./state.js";

/**
 * Install process exit hooks to clean up running commands
 */
export function installProcessHooks(): void {
	if (getProcessHooksInstalled()) return;
	setProcessHooksInstalled(true);
	process.on("exit", killAllRunningCommandsSync);
	process.on("SIGINT", killAllRunningCommandsSync);
	process.on("SIGTERM", killAllRunningCommandsSync);
	process.on("SIGHUP", killAllRunningCommandsSync);
}

/**
 * Uninstall process exit hooks
 */
export function uninstallProcessHooks(): void {
	if (!getProcessHooksInstalled()) return;
	setProcessHooksInstalled(false);
	process.off("exit", killAllRunningCommandsSync);
	process.off("SIGINT", killAllRunningCommandsSync);
	process.off("SIGTERM", killAllRunningCommandsSync);
	process.off("SIGHUP", killAllRunningCommandsSync);
}

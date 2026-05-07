// State management for bg extension

import type { RunningCommand, ExtensionContext } from "./types.js";

// Module-level state
let _latestCtx: ExtensionContext | undefined;
let _running: RunningCommand[] = [];
let _pollTimer: NodeJS.Timeout | undefined;
let _refreshInFlight = false;
let _processHooksInstalled = false;
let _widgetInstalled = false;
let _logViewerOpen = false;

// Getters and setters for state

export function getLatestCtx(): ExtensionContext | undefined {
	return _latestCtx;
}

export function setLatestCtx(ctx: ExtensionContext | undefined): void {
	_latestCtx = ctx;
}

export function getRunning(): RunningCommand[] {
	return _running;
}

export function setRunning(commands: RunningCommand[]): void {
	_running = commands;
}

export function getPollTimer(): NodeJS.Timeout | undefined {
	return _pollTimer;
}

export function setPollTimer(timer: NodeJS.Timeout | undefined): void {
	_pollTimer = timer;
}

export function getRefreshInFlight(): boolean {
	return _refreshInFlight;
}

export function setRefreshInFlight(inFlight: boolean): void {
	_refreshInFlight = inFlight;
}

export function getProcessHooksInstalled(): boolean {
	return _processHooksInstalled;
}

export function setProcessHooksInstalled(installed: boolean): void {
	_processHooksInstalled = installed;
}

export function getWidgetInstalled(): boolean {
	return _widgetInstalled;
}

export function setWidgetInstalled(installed: boolean): void {
	_widgetInstalled = installed;
}

export function getLogViewerOpen(): boolean {
	return _logViewerOpen;
}

export function setLogViewerOpen(open: boolean): void {
	_logViewerOpen = open;
}

// Reset all state (useful for testing)
export function resetState(): void {
	_latestCtx = undefined;
	_running = [];
	if (_pollTimer) {
		clearInterval(_pollTimer);
	}
	_pollTimer = undefined;
	_refreshInFlight = false;
	_processHooksInstalled = false;
	_widgetInstalled = false;
	_logViewerOpen = false;
}

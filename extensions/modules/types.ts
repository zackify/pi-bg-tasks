// Types for bg extension

export type Cache = {
	cwds?: Record<string, CwdCache>;
};

export type CwdCache = {
	recentBackgroundCommands?: string[];
};

export type RunningCommand = {
	session: string;
	command: string;
	cwd: string;
	logFile: string;
	startedAt: number;
};

export type MenuItem =
	| { type: "new"; label: string }
	| { type: "recent"; command: string }
	| { type: "running"; running: RunningCommand }
	| { type: "separator"; label: string };

export type ExecResult = {
	code: number;
	stdout: string;
	stderr: string;
};

export interface ExtensionAPI {
	events: { on: (event: string, handler: (payload: any) => void) => void };
	exec: (command: string, args: string[], options?: { timeout?: number }) => Promise<ExecResult>;
	registerCommand: (name: string, config: { description: string; handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) => void;
	on: (event: string, handler: (event: string, ctx: ExtensionContext) => Promise<void>) => void;
}

export interface ExtensionCommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify: (message: string, type?: "info" | "error") => void;
		setWidget: (id: string, widget: any) => void;
		custom: <T>(fn: (tui: any, theme: any, kb: any, done: (result: T) => void) => any) => Promise<T>;
		setEditorText: (text: string) => void;
	};
}

export interface ExtensionContext extends ExtensionCommandContext {
	// ExtensionContext extends ExtensionCommandContext
}

export interface Theme {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
	dim: (text: string) => string;
	muted: (text: string) => string;
	accent: (text: string) => string;
	success: (text: string) => string;
}

export interface DynamicBorderRender {
	render: (width: number) => string[];
}

export interface TextRender {
	render: (width: number) => string[];
}

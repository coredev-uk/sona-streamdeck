import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";

import { offlineStatus, type NowPlaying, type Queue, type Status } from "./types.ts";

// One long-lived `sona connect` child: Sona's add-on protocol v2, one JSON
// object a line, on its stdin and stdout (sona-go: docs/addons.md, "sona
// connect"). It exits with status 3 when Sona isn't running or quits; the
// connection starts it again with a backoff, so the keys come back on their
// own when Sona starts.

export type ConnectionState = "connecting" | "online" | "offline";

/** Why the connection is offline. */
export type OfflineReason = "" | "not-found" | "not-running" | "failed";

export type CallOptions = {
	/** `play <link> --shuffle`. */
	shuffle?: boolean;
	/** `prev --force`. */
	force?: boolean;
	/** `search --type`. */
	kind?: string;
	/** `search --limit`. */
	limit?: number;
};

export type ConnectionOptions = {
	/** The `sona` executable to start; null when there is none. */
	locate: () => Promise<string | null>;
	/** Arguments before `connect` (a test's script). */
	args?: string[];
	log?: (message: string) => void;
	/** Delays between attempts, in ms; the last repeats. */
	retry?: number[];
	/** How long a call may wait for its answer, in ms. */
	callTimeout?: number;
};

/** A call's failure: Sona's error code (docs/addons.md, "Errors"), or "offline". */
export class CallError extends Error {
	readonly code: string;

	constructor(code: string, message?: string) {
		super(message ?? code);
		this.name = "CallError";
		this.code = code;
	}
}

type Frame = {
	id?: number;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code: string; message?: string };
	event?: string;
	data?: unknown;
};

type Pending = {
	resolve: (value: unknown) => void;
	reject: (err: Error) => void;
	timer: NodeJS.Timeout;
};

/** Every permission the plugin uses; `sona connect` grants all but network. */
const permissions = [
	"playback.read",
	"playback.control",
	"queue.read",
	"queue.control",
	"search",
	"open",
	"volume",
	"like",
	"library",
	"private.read",
];

const helloID = 1;
const subscribeID = 2;

export class SonaConnection extends EventEmitter {
	state: ConnectionState = "offline";
	reason: OfflineReason = "";
	/** The latest status, and when it arrived (ms). */
	status: Status = offlineStatus;
	statusAt = 0;
	nowPlaying: NowPlaying = { track: null, startedAt: 0 };
	queue: Queue = { index: -1, tracks: [] };

	#opts: ConnectionOptions;
	#child: ChildProcess | undefined;
	#nextID = subscribeID + 1;
	#pending = new Map<number, Pending>();
	#attempt = 0;
	#timer: NodeJS.Timeout | undefined;
	#stopped = true;

	constructor(opts: ConnectionOptions) {
		super();
		this.setMaxListeners(0); // every action listens
		this.#opts = opts;
	}

	/** Starts `sona connect`, and keeps it running until stop. */
	start(): void {
		if (!this.#stopped) {
			return;
		}
		this.#stopped = false;
		void this.#launch();
	}

	/** Ends the child and stops trying. */
	stop(): void {
		this.#stopped = true;
		clearTimeout(this.#timer);
		this.#child?.stdin?.end();
		this.#child?.kill();
	}

	/** Starts again now: the `sona` location changed, or the person asked. */
	restart(): void {
		this.#attempt = 0;
		if (this.#child) {
			this.#child.kill(); // its exit schedules the next attempt
			return;
		}
		clearTimeout(this.#timer);
		if (!this.#stopped) {
			void this.#launch();
		}
	}

	/** Runs a `sona` command in the running Sona and resolves with its result. */
	call<T = unknown>(command: string, args: string[] = [], options: CallOptions = {}): Promise<T> {
		if (this.state !== "online" || !this.#child?.stdin) {
			return Promise.reject(new CallError("offline", "Sona isn't running"));
		}
		const id = this.#nextID++;
		const params: Record<string, unknown> = { command };
		if (args.length > 0) params.args = args;
		if (options.shuffle) params.shuffle = true;
		if (options.force) params.force = true;
		if (options.kind) params.kind = options.kind;
		if (options.limit) params.limit = options.limit;
		const { promise, resolve, reject } = Promise.withResolvers<T>();
		const timer = setTimeout(() => {
			this.#pending.delete(id);
			reject(new CallError("timeout", `${command} took too long`));
		}, this.#opts.callTimeout ?? 35_000);
		this.#pending.set(id, { resolve: (v) => resolve(v as T), reject, timer });
		this.#send({ id, method: "call", params });
		return promise;
	}

	async #launch(): Promise<void> {
		if (this.#stopped) {
			return;
		}
		this.#setState("connecting", "");
		const exe = await this.#opts.locate();
		if (this.#stopped) {
			return;
		}
		if (!exe) {
			this.#offline("not-found");
			return;
		}
		let child: ChildProcess;
		try {
			child = spawn(exe, [...(this.#opts.args ?? []), "connect"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
		} catch (err) {
			this.#log(`start ${exe}: ${String(err)}`);
			this.#offline("not-found");
			return;
		}
		this.#child = child;
		child.on("error", (err: NodeJS.ErrnoException) => {
			this.#log(`sona connect: ${err.message}`);
			if (err.code === "ENOENT" || err.code === "EACCES") {
				this.reason = "not-found";
			}
		});
		child.stdin?.on("error", () => {}); // a child gone mid-write; its exit says why
		createInterface({ input: child.stdout! }).on("line", (line) => this.#onLine(line));
		createInterface({ input: child.stderr! }).on("line", (line) => this.#log(`sona: ${line}`));
		child.on("close", (code) => this.#onExit(child, code));
		this.#send({
			id: helloID,
			method: "hello",
			params: { id: "stream-deck", protocol: { min: "2.0", max: "2.0" }, permissions },
		});
	}

	#onLine(line: string): void {
		let f: Frame;
		try {
			f = JSON.parse(line) as Frame;
		} catch {
			this.#log(`not a frame: ${line.slice(0, 200)}`);
			return;
		}
		if (f.event) {
			this.#onEvent(f.event, f.data);
			return;
		}
		if (f.id === helloID) {
			if (f.error) {
				this.#log(`hello refused: ${f.error.code}`);
				return; // the child ends the session; its exit retries
			}
			this.#attempt = 0;
			this.#send({ id: subscribeID, method: "subscribe", params: { topics: ["status", "now-playing", "queue"] } });
			this.#setState("online", "");
			return;
		}
		if (f.id === subscribeID || f.id === undefined) {
			if (f.error) this.#log(`subscribe: ${f.error.code}`);
			return;
		}
		const p = this.#pending.get(f.id);
		if (!p) {
			return;
		}
		this.#pending.delete(f.id);
		clearTimeout(p.timer);
		if (f.error) {
			p.reject(new CallError(f.error.code, f.error.message));
		} else {
			p.resolve(f.result);
		}
	}

	#onEvent(event: string, data: unknown): void {
		switch (event) {
			case "status":
				this.status = data as Status;
				this.statusAt = Date.now();
				this.emit("status", this.status);
				break;
			case "now-playing":
				this.nowPlaying = data as NowPlaying;
				this.emit("nowPlaying", this.nowPlaying);
				break;
			case "queue":
				this.queue = data as Queue;
				this.emit("queue", this.queue);
				break;
			case "shutdown":
				this.#log("Sona is quitting");
				break;
		}
	}

	#onExit(child: ChildProcess, code: number | null): void {
		if (this.#child !== child) {
			return;
		}
		this.#child = undefined;
		for (const [id, p] of this.#pending) {
			clearTimeout(p.timer);
			p.reject(new CallError("offline", "Sona isn't running"));
			this.#pending.delete(id);
		}
		if (this.reason === "not-found") {
			this.#offline("not-found");
		} else {
			this.#offline(code === 3 ? "not-running" : "failed");
		}
		if (code !== 3 && code !== 0) {
			this.#log(`sona connect exited with ${code}`);
		}
	}

	#offline(reason: OfflineReason): void {
		this.status = offlineStatus;
		this.statusAt = Date.now();
		this.nowPlaying = { track: null, startedAt: 0 };
		this.queue = { index: -1, tracks: [] };
		this.#setState("offline", reason);
		this.emit("status", this.status);
		this.emit("nowPlaying", this.nowPlaying);
		this.emit("queue", this.queue);
		if (this.#stopped) {
			return;
		}
		const retry = this.#opts.retry ?? [1000, 2000, 5000, 10_000];
		const delay = retry[Math.min(this.#attempt, retry.length - 1)];
		this.#attempt++;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.#launch(), delay);
	}

	#setState(state: ConnectionState, reason: OfflineReason): void {
		const changed = state !== this.state || reason !== this.reason;
		this.state = state;
		this.reason = reason;
		if (changed) {
			this.emit("state", state, reason);
		}
	}

	#send(frame: Frame): void {
		this.#child?.stdin?.write(JSON.stringify(frame) + "\n");
	}

	#log(message: string): void {
		this.#opts.log?.(message);
	}
}

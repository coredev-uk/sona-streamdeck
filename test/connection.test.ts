import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { CallError, SonaConnection, type ConnectionState } from "../src/sona/connection.ts";
import type { Queue, Status } from "../src/sona/types.ts";

const fake = path.join(import.meta.dirname, "fake-sona.mjs");

/** A connection to the fake `sona connect`, Sona running or not per the state file. */
function connect(running: boolean): { sona: SonaConnection; setRunning: (on: boolean) => void } {
	const dir = mkdtempSync(path.join(tmpdir(), "sona-sd-"));
	const state = path.join(dir, "state");
	const setRunning = (on: boolean): void => writeFileSync(state, on ? "running" : "stopped");
	setRunning(running);
	process.env.FAKE_SONA_STATE = state;
	const sona = new SonaConnection({ locate: async () => process.execPath, args: [fake], retry: [50], callTimeout: 2000 });
	return { sona, setRunning };
}

/** The first event's first argument for which ok holds. */
function next<T>(sona: SonaConnection, event: string, ok: (value: T) => boolean): Promise<T> {
	const { promise, resolve, reject } = Promise.withResolvers<T>();
	// A guard against a hang, not a wait: the test awaits the event itself.
	const timer = setTimeout(() => reject(new Error(`no ${event}`)), 5000);
	const on = (value: T): void => {
		if (ok(value)) {
			clearTimeout(timer);
			sona.off(event, on);
			resolve(value);
		}
	};
	sona.on(event, on);
	return promise;
}

test("hello, the topics, calls and their errors", async (t) => {
	const { sona } = connect(true);
	t.after(() => sona.stop());
	const status = next<Status>(sona, "status", (s: Status) => s.running);
	const queue = next<Queue>(sona, "queue", (q: Queue) => q.tracks.length > 0);
	sona.start();
	assert.equal((await status).track?.title, "Song");
	assert.equal(sona.state, "online");
	assert.equal((await queue).tracks[0].title, "Song");

	const changed = next<Status>(sona, "status", (s: Status) => s.shuffle);
	const res = await sona.call<Status>("shuffle", ["toggle"]);
	assert.equal(res.shuffle, true);
	assert.equal((await changed).shuffle, true);

	// The options reach Sona as the request's fields.
	const played = await sona.call<{ echo: { args: string[]; shuffle: boolean } }>("play", ["https://music.apple.com/library/playlist/p.x"], { shuffle: true });
	assert.deepEqual(played.echo, { args: ["https://music.apple.com/library/playlist/p.x"], shuffle: true });

	await assert.rejects(sona.call("like", ["toggle"]), (err: unknown) => err instanceof CallError && err.code === "not_signed_in");
});

test("waits for Sona, and comes back when it starts", async (t) => {
	const { sona, setRunning } = connect(false);
	t.after(() => sona.stop());
	const offline = next<ConnectionState>(sona, "state", (s: ConnectionState) => s === "offline");
	sona.start();
	await offline;
	assert.equal(sona.reason, "not-running");
	await assert.rejects(sona.call("toggle"), (err: unknown) => err instanceof CallError && err.code === "offline");

	const online = next<ConnectionState>(sona, "state", (s: ConnectionState) => s === "online");
	setRunning(true);
	await online;

	// Sona quits: the keys go offline (and the status with them).
	const gone = next<Status>(sona, "status", (s: Status) => !s.running);
	setRunning(false);
	await assert.rejects(sona.call("quit"), (err: unknown) => err instanceof CallError && err.code === "offline");
	await gone;
	assert.equal(sona.state === "offline" || sona.state === "connecting", true);
});

test("no sona to start", async (t) => {
	const sona = new SonaConnection({ locate: async () => null, retry: [50] });
	t.after(() => sona.stop());
	const offline = next<ConnectionState>(sona, "state", (s: ConnectionState) => s === "offline");
	sona.start();
	await offline;
	assert.equal(sona.reason, "not-found");

	const missing = new SonaConnection({ locate: async () => path.join(tmpdir(), "no-such-sona"), retry: [50] });
	t.after(() => missing.stop());
	const off = next<ConnectionState>(missing, "state", (s: ConnectionState) => s === "offline");
	missing.start();
	await off;
	assert.equal(missing.reason, "not-found");
});

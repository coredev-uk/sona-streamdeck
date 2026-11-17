#!/usr/bin/env node
// A stand-in for `sona connect` in the tests: protocol v2 frames on stdin and
// stdout. FAKE_SONA_STATE names a file holding "running" or "stopped"; while
// stopped it exits with status 3, as `sona connect` does with no Sona.

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const stateFile = process.env.FAKE_SONA_STATE;
if (process.argv.at(-1) !== "connect") {
	process.exit(2);
}
if (stateFile && readFileSync(stateFile, "utf8").trim() !== "running") {
	process.exit(3);
}

const status = {
	running: true,
	state: "playing",
	track: { id: "1", title: "Song", artist: "Artist", album: "Album", duration: 200, explicit: false, artwork: "" },
	position: 12,
	volume: 40,
	shuffle: false,
	repeat: "off",
	private: false,
	preview: false,
	error: "",
	liked: false,
};

const send = (f) => process.stdout.write(JSON.stringify(f) + "\n");

createInterface({ input: process.stdin }).on("line", (line) => {
	const f = JSON.parse(line);
	switch (f.method) {
		case "hello":
			send({ id: f.id, result: { id: f.params.id, protocol: "2.0.0", permissions: f.params.permissions.filter((p) => p !== "network"), limits: {} } });
			return;
		case "subscribe":
			send({ id: f.id, result: { topics: f.params.topics } });
			send({ event: "status", data: status });
			send({ event: "now-playing", data: { track: status.track, startedAt: 1 } });
			send({ event: "queue", data: { index: 0, tracks: [{ ...status.track, autoPlay: false }] } });
			return;
		case "call": {
			const { command, args = [], shuffle } = f.params;
			if (command === "shuffle") {
				status.shuffle = !status.shuffle;
				send({ id: f.id, result: status });
				send({ event: "status", data: status });
			} else if (command === "play") {
				send({ id: f.id, result: { ...status, echo: { args, shuffle: shuffle === true } } });
			} else if (command === "like") {
				send({ id: f.id, error: { code: "not_signed_in", message: "Sona needs an account for that" } });
			} else if (command === "quit") {
				process.exit(3);
			} else {
				send({ id: f.id, error: { code: "unknown_command", message: "Sona doesn't know that command" } });
			}
			return;
		}
	}
});

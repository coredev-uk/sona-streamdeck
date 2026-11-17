import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { candidates, locateSona } from "../src/sona/locate.ts";

test("the order: the setting alone, else PATH, then the install locations", () => {
	assert.deepEqual(candidates(" /opt/sona/sona ", "linux", { PATH: "/usr/bin" }, "/home/p"), ["/opt/sona/sona"]);
	assert.deepEqual(candidates("", "darwin", { PATH: "/usr/bin:/bin" }, "/Users/p"), [
		"/usr/bin/sona",
		"/bin/sona",
		"/Applications/Sona.app/Contents/MacOS/sona",
		"/Users/p/Applications/Sona.app/Contents/MacOS/sona",
		"/opt/homebrew/bin/sona",
		"/usr/local/bin/sona",
	]);
	assert.deepEqual(candidates("", "win32", { Path: "C:\\Windows", LOCALAPPDATA: "C:\\Users\\p\\AppData\\Local" }, "C:\\Users\\p"), [
		"C:\\Windows\\sona.exe",
		"C:\\Users\\p\\AppData\\Local\\Programs\\Sona\\sona.exe",
	]);
});

test("finds a runnable sona, and only one", async () => {
	const dir = mkdtempSync(path.join(tmpdir(), "sona-locate-"));
	const bin = path.join(dir, "bin");
	mkdirSync(bin);
	const notRunnable = path.join(dir, "sona");
	writeFileSync(notRunnable, "");
	chmodSync(notRunnable, 0o644);
	const sona = path.join(bin, "sona");
	writeFileSync(sona, "#!/bin/sh\n");
	chmodSync(sona, 0o755);
	if (process.platform === "win32") {
		return; // the executable bit is Unix's
	}
	assert.equal(await locateSona("", "linux", { PATH: `${dir}:${bin}` }, path.join(dir, "home")), sona);
	assert.equal(await locateSona(path.join(dir, "missing"), "linux", { PATH: bin }, dir), null);
});

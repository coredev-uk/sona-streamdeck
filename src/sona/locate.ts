import { access, constants } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Where the `sona` executable is: the path set in the plugin's settings,
// else the first on PATH, else where Sona's installers put it. Stream Deck
// starts plugins with a short PATH on macOS, so the install locations
// matter more than PATH there.

export type Platform = NodeJS.Platform;

/** Sona's install locations on platform, most likely first. */
export function installLocations(platform: Platform, env: NodeJS.ProcessEnv, home: string): string[] {
	switch (platform) {
		case "win32": {
			const local = env.LOCALAPPDATA ?? path.win32.join(home, "AppData", "Local");
			return [path.win32.join(local, "Programs", "Sona", "sona.exe")];
		}
		case "darwin":
			return [
				"/Applications/Sona.app/Contents/MacOS/sona",
				path.posix.join(home, "Applications", "Sona.app", "Contents", "MacOS", "sona"),
				"/opt/homebrew/bin/sona",
				"/usr/local/bin/sona",
			];
		default:
			return [path.posix.join(home, ".local", "bin", "sona"), "/usr/local/bin/sona", "/usr/bin/sona"];
	}
}

/** The candidates in the order they are tried. */
export function candidates(configured: string, platform: Platform, env: NodeJS.ProcessEnv, home: string): string[] {
	if (configured.trim() !== "") {
		return [configured.trim()];
	}
	const p = platform === "win32" ? path.win32 : path.posix;
	const name = platform === "win32" ? "sona.exe" : "sona";
	const dirs = (env.PATH ?? env.Path ?? "").split(platform === "win32" ? ";" : ":").filter((d) => d !== "");
	return [...dirs.map((d) => p.join(d, name)), ...installLocations(platform, env, home)];
}

/** The first candidate that exists and may be run; null when none does. */
export async function locateSona(configured: string, platform: Platform = process.platform, env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): Promise<string | null> {
	const mode = platform === "win32" ? constants.F_OK : constants.X_OK;
	for (const c of candidates(configured, platform, env, home)) {
		try {
			await access(c, mode);
			return c;
		} catch {
			// not there, or not runnable: the next one
		}
	}
	return null;
}

import streamDeck from "@elgato/streamdeck";

import { CallError, SonaConnection, type CallOptions } from "./sona/connection.ts";
import { locateSona } from "./sona/locate.ts";

// What every action shares: the one `sona connect` child, and the plugin's
// global settings.

export type GlobalSettings = {
	/** The `sona` executable, when it isn't where Sona installs it or on PATH. */
	sonaPath?: string;
};

export const globals: GlobalSettings = {};

export const sona = new SonaConnection({
	locate: () => locateSona(globals.sonaPath ?? ""),
	log: (message) => streamDeck.logger.info(message),
});

/** Something that can show a failure: a key or a dial. */
export type Alertable = { showAlert(): Promise<void> };

/**
 * Runs a command in Sona; a failure shows the key's or dial's alert (the
 * yellow triangle) and is logged, and resolves undefined.
 */
export async function run<T = unknown>(target: Alertable, command: string, args: string[] = [], options: CallOptions = {}): Promise<T | undefined> {
	try {
		return await sona.call<T>(command, args, options);
	} catch (err) {
		const code = err instanceof CallError ? err.code : String(err);
		streamDeck.logger.warn(`${command} ${args.join(" ")}: ${code}`);
		await target.showAlert();
		return undefined;
	}
}

/** What the property inspector's connection line says. */
export function connectionText(): string {
	switch (sona.state) {
		case "online":
			return "Connected to Sona.";
		case "connecting":
			return "Connecting to Sona…";
	}
	switch (sona.reason) {
		case "not-found":
			return "Can't find Sona. Install it, or set where sona is below.";
		case "not-running":
			return "Sona isn't running. The keys come back when it starts.";
		default:
			return "Can't reach Sona; trying again.";
	}
}

import type { KeyAction } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { run, sona } from "../context.ts";
import type { CallOptions } from "../sona/connection.ts";
import type { Status } from "../sona/types.ts";
import { keySVG, svgURL, type KeyLook } from "../render/svg.ts";
import { SonaKey } from "./key.ts";

// The keys that send one command and show one state: what each draws from
// the status, and what a press sends.

export const uuidPrefix = "uk.coredev.sona";

type Spec<S extends JsonObject> = {
	id: string;
	look: (status: Status, settings: S) => KeyLook;
	/** The command a press sends, for the status and settings. */
	command: (status: Status, settings: S) => { command: string; args?: string[]; options?: CallOptions };
};

class Control<S extends JsonObject> extends SonaKey<S> {
	readonly #spec: Spec<S>;

	constructor(spec: Spec<S>) {
		super(`${uuidPrefix}.${spec.id}`);
		this.#spec = spec;
	}

	protected image(_id: string, settings: S): string {
		const look = this.#spec.look(sona.status, settings);
		return svgURL(keySVG({ ...look, offline: sona.state !== "online" }));
	}

	protected async press(action: KeyAction<S>, settings: S): Promise<void> {
		const c = this.#spec.command(sona.status, settings);
		await run(action, c.command, c.args, c.options);
	}
}

export type PreviousSettings = { alwaysPrevious?: boolean };

/** The controls, by action ID (the manifest's UUID after the prefix). */
export function controls(): SonaKey[] {
	return [
		new Control({
			id: "toggle",
			look: (s) => ({ glyph: s.state === "playing" || s.state === "loading" ? "pause" : "play" }),
			command: () => ({ command: "toggle" }),
		}),
		new Control({ id: "next", look: () => ({ glyph: "next" }), command: () => ({ command: "next" }) }),
		new Control<PreviousSettings>({
			id: "previous",
			look: () => ({ glyph: "previous" }),
			command: (_s, settings) => ({ command: "prev", options: { force: settings.alwaysPrevious === true } }),
		}),
		new Control({
			id: "shuffle",
			look: (s) => ({ glyph: "shuffle", active: s.shuffle }),
			command: () => ({ command: "shuffle", args: ["toggle"] }),
		}),
		new Control({
			id: "repeat",
			look: (s) => ({ glyph: s.repeat === "one" ? "repeatOne" : "repeat", active: s.repeat !== "off" }),
			command: () => ({ command: "repeat", args: ["cycle"] }),
		}),
		new Control({
			id: "like",
			look: (s) => ({ glyph: s.liked ? "heartFilled" : "heart", active: s.liked === true }),
			command: () => ({ command: "like", args: ["toggle"] }),
		}),
		new Control({
			id: "dislike",
			look: (s) => ({ glyph: s.disliked ? "thumbsDownFilled" : "thumbsDown", active: s.disliked === true }),
			command: () => ({ command: "dislike", args: ["toggle"] }),
		}),
		new Control({
			id: "library",
			look: (s) => ({ glyph: s.inLibrary ? "check" : "add", active: s.inLibrary === true }),
			command: () => ({ command: "library", args: ["toggle"] }),
		}),
		new Control({
			id: "crossfade",
			look: (s) => ({ glyph: "crossfade", active: s.crossfade === true }),
			command: () => ({ command: "crossfade", args: ["toggle"] }),
		}),
		new Control({
			id: "private",
			look: (s) => ({ glyph: s.private ? "eyeOff" : "eye", active: s.private }),
			command: () => ({ command: "private", args: ["toggle"] }),
		}),
	];
}

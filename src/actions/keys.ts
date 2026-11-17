import type { KeyAction as SettingsKeyAction } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { run, sona } from "../context.ts";
import { artworkImage, artworkTile } from "../render/artwork.ts";
import { keySVG, songSVG, svgURL, titleFits } from "../render/svg.ts";
import { uuidPrefix } from "./controls.ts";
import { SonaKey } from "./key.ts";

/** A key whose settings this file doesn't read. */
type KeyAction<S extends JsonObject = JsonObject> = SettingsKeyAction<S>;

// The keys with more to them than one command: the volume (repeats while
// held), clearing the queue (asks for a second press), Spatial Audio (a
// setting Sona keeps), and the song, its cover and a cover spread over
// several keys.

export type VolumeSettings = { step?: number };

const repeatAfter = 400;
const repeatEvery = 150;

/** Volume up or down by the key's step; held, it keeps going. */
export class VolumeKey extends SonaKey<VolumeSettings> {
	readonly #sign: 1 | -1;
	readonly #held = new Map<string, NodeJS.Timeout>();

	constructor(sign: 1 | -1) {
		super(`${uuidPrefix}.volume-${sign > 0 ? "up" : "down"}`);
		this.#sign = sign;
	}

	protected image(): string {
		return svgURL(keySVG({ glyph: this.#sign > 0 ? "volumeUp" : "volumeDown", offline: sona.state !== "online" }));
	}

	protected async press(action: KeyAction<VolumeSettings>, settings: VolumeSettings): Promise<void> {
		const step = Math.min(Math.max(Math.round(settings.step ?? 5), 1), 50);
		const arg = `${this.#sign > 0 ? "+" : "-"}${step}`;
		this.release(action);
		const started = setTimeout(() => {
			this.#held.set(action.id, setInterval(() => void sona.call("volume", [arg]).catch(() => this.release(action)), repeatEvery));
		}, repeatAfter);
		this.#held.set(action.id, started);
		await run(action, "volume", [arg]);
	}

	protected override release(action: KeyAction<VolumeSettings>): void {
		const t = this.#held.get(action.id);
		clearTimeout(t);
		clearInterval(t);
		this.#held.delete(action.id);
	}
}

const confirmFor = 3000;

/** Clears the queue (the playing song stays) on a second press within 3 s. */
export class ClearQueueKey extends SonaKey {
	readonly #armed = new Map<string, NodeJS.Timeout>();

	constructor() {
		super(`${uuidPrefix}.clear-queue`);
	}

	protected image(id: string): string {
		const armed = this.#armed.has(id);
		return svgURL(keySVG({ glyph: "clearQueue", label: armed ? "Clear?" : undefined, alarm: armed, offline: sona.state !== "online" }));
	}

	protected async press(action: KeyAction): Promise<void> {
		const armed = this.#armed.get(action.id);
		if (!armed) {
			this.#armed.set(
				action.id,
				setTimeout(() => {
					this.#armed.delete(action.id);
					void this.draw(action);
				}, confirmFor),
			);
			await this.draw(action);
			return;
		}
		clearTimeout(armed);
		this.#armed.delete(action.id);
		await this.draw(action);
		if ((await run(action, "queue", ["clear"])) !== undefined) {
			await action.showOk();
		}
	}
}

/** Switches Spatial Audio, the setting Sona keeps and applies from the next song. */
export class SpatialKey extends SonaKey {
	#on = false;

	constructor() {
		super(`${uuidPrefix}.spatial`);
		sona.on("state", (state: string) => {
			if (state === "online") void this.#read();
		});
	}

	async #read(): Promise<void> {
		try {
			this.#on = (await sona.call<{ on: boolean }>("spatial", ["status"])).on;
		} catch {
			this.#on = false; // a Sona before Spatial Audio
		}
		this.redraw();
	}

	protected image(): string {
		return svgURL(keySVG({ glyph: "spatial", active: this.#on, offline: sona.state !== "online" }));
	}

	protected async press(action: KeyAction): Promise<void> {
		const res = await run<{ on: boolean }>(action, "spatial", ["toggle"]);
		if (res) {
			this.#on = res.on;
			this.redraw();
		}
	}
}

const scrollEvery = 450;

/** The song that plays: its title scrolls when long. A press plays or pauses. */
export class SongKey extends SonaKey {
	#scroll = 0;
	#timer: NodeJS.Timeout | undefined;

	constructor() {
		super(`${uuidPrefix}.now-playing`);
		sona.on("nowPlaying", () => {
			this.#scroll = 0;
		});
	}

	protected image(): string {
		const t = sona.status.track;
		if (sona.state !== "online") {
			return svgURL(songSVG({ title: "", artist: "", offline: true, message: "Sona" }));
		}
		if (!t) {
			return svgURL(songSVG({ title: "", artist: "", message: "Nothing playing" }));
		}
		return svgURL(songSVG({ title: t.title, artist: t.artist, scroll: this.#scroll }));
	}

	protected async press(action: KeyAction): Promise<void> {
		await run(action, "toggle");
	}

	override redraw(): void {
		super.redraw();
		// Scroll while any key shows a long title.
		const long = [...(sona.status.track?.title ?? "")].length > titleFits;
		const visible = this.actions.some((a) => a.isKey());
		if (long && visible && !this.#timer) {
			this.#timer = setInterval(() => {
				this.#scroll++;
				super.redraw();
			}, scrollEvery);
		} else if ((!long || !visible) && this.#timer) {
			clearInterval(this.#timer);
			this.#timer = undefined;
			this.#scroll = 0;
		}
	}
}

/** The playing song's cover. A press plays or pauses. */
export class ArtworkKey extends SonaKey {
	constructor() {
		super(`${uuidPrefix}.artwork`);
	}

	protected async image(): Promise<string> {
		const u = sona.status.track?.artwork ?? "";
		const img = sona.state === "online" && u ? await artworkImage(u) : null;
		return img ?? svgURL(keySVG({ glyph: "note", offline: sona.state !== "online" }));
	}

	protected async press(action: KeyAction): Promise<void> {
		await run(action, "toggle");
	}
}

export type GridSettings = {
	/** The grid's size in keys. */
	columns?: string;
	rows?: string;
	/** This key's place in it, from 1. */
	column?: string;
	row?: string;
};

function gridNumber(v: string | undefined, max: number): number {
	const n = Number.parseInt(v ?? "", 10);
	return Number.isFinite(n) ? Math.min(Math.max(n, 1), max) : 1;
}

/** One tile of the playing song's cover spread over a block of keys. */
export class ArtworkGridKey extends SonaKey<GridSettings> {
	constructor() {
		super(`${uuidPrefix}.artwork-grid`);
	}

	protected async image(_id: string, s: GridSettings): Promise<string> {
		const u = sona.status.track?.artwork ?? "";
		if (sona.state === "online" && u) {
			const cols = gridNumber(s.columns ?? "2", 4);
			const rows = gridNumber(s.rows ?? "2", 4);
			const tile = await artworkTile(u, cols, rows, gridNumber(s.column, cols) - 1, gridNumber(s.row, rows) - 1);
			if (tile) {
				return tile;
			}
		}
		return svgURL(keySVG({ glyph: "note", offline: sona.state !== "online" }));
	}

	protected async press(action: KeyAction<GridSettings>): Promise<void> {
		await run(action, "toggle");
	}
}

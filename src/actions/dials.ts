import { SingletonAction, type DialAction, type DialDownEvent, type DialRotateEvent, type DidReceiveSettingsEvent, type TouchTapEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { run, sona } from "../context.ts";
import { artworkImage } from "../render/artwork.ts";
import { dialIconSVG, ellipsize, svgURL } from "../render/svg.ts";
import { positionAt } from "../sona/types.ts";
import { uuidPrefix } from "./controls.ts";

// The Stream Deck + dials, on the built-in $B1 layout: a title, an icon, a
// value and a bar.

type Feedback = { title: string; icon: string; value: string; indicator: { value: number; enabled?: boolean } };

/** m:ss, or h:mm:ss from an hour. */
export function clock(seconds: number): string {
	const s = Math.max(Math.floor(seconds), 0);
	const mm = String(Math.floor(s / 60) % 60).padStart(s >= 3600 ? 2 : 1, "0");
	const ss = String(s % 60).padStart(2, "0");
	return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}

abstract class SonaDial<S extends JsonObject = JsonObject> extends SingletonAction<S> {
	override readonly manifestId: string;
	protected readonly settingsOf = new Map<string, S>();
	readonly #shown = new Map<string, string>();

	constructor(uuid: string) {
		super();
		this.manifestId = uuid;
		const redraw = (): void => this.redraw();
		sona.on("status", redraw);
		sona.on("state", redraw);
		sona.on("queue", redraw);
	}

	protected abstract feedback(id: string, settings: S): Promise<Feedback>;

	override async onWillAppear(ev: WillAppearEvent<S>): Promise<void> {
		if (ev.action.isDial()) {
			this.settingsOf.set(ev.action.id, ev.payload.settings);
			this.#shown.delete(ev.action.id);
			await this.draw(ev.action);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<S>): void {
		this.settingsOf.delete(ev.action.id);
		this.#shown.delete(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<S>): Promise<void> {
		if (ev.action.isDial()) {
			this.settingsOf.set(ev.action.id, ev.payload.settings);
			await this.draw(ev.action);
		}
	}

	redraw(): void {
		for (const a of this.actions) {
			if (a.isDial()) {
				void this.draw(a);
			}
		}
	}

	protected async draw(a: DialAction<S>): Promise<void> {
		const fb = await this.feedback(a.id, this.settingsOf.get(a.id) ?? ({} as S));
		const key = JSON.stringify(fb);
		if (this.#shown.get(a.id) === key) {
			return;
		}
		this.#shown.set(a.id, key);
		await a.setFeedback(fb);
	}

	/** Whether Sona is reachable; the dial's alert when not. */
	protected async ready(a: DialAction<S>): Promise<boolean> {
		if (sona.state === "online") {
			return true;
		}
		await a.showAlert();
		return false;
	}
}

export type PlaybackDialSettings = { volumeStep?: number; seekStep?: number };

/**
 * The player on one dial: turning changes the volume, or moves through the
 * song once a press switched to seeking; a tap on the screen plays or
 * pauses, and its left and right edges go back and skip.
 */
export class PlaybackDial extends SonaDial<PlaybackDialSettings> {
	readonly #seeking = new Set<string>();
	/** Ticks turned and not yet sent, by action ID. */
	readonly #pending = new Map<string, number>();
	readonly #sending = new Set<string>();
	#clock: NodeJS.Timeout | undefined;

	constructor() {
		super(`${uuidPrefix}.playback-dial`);
		// While a dial shows the position, it moves on with the song.
		this.#clock = setInterval(() => {
			if (this.#seeking.size > 0 && sona.status.state === "playing") this.redraw();
		}, 1000);
		this.#clock.unref?.();
	}

	protected async feedback(id: string): Promise<Feedback> {
		const s = sona.status;
		if (sona.state !== "online") {
			return { title: "Sona", icon: svgURL(dialIconSVG("dial", false, true)), value: "offline", indicator: { value: 0, enabled: false } };
		}
		const art = s.track?.artwork ? await artworkImage(s.track.artwork, 96) : null;
		const icon = art ?? svgURL(dialIconSVG(s.state === "playing" ? "pause" : "play"));
		const title = ellipsize(s.track ? `${s.track.title} · ${s.track.artist}` : "Nothing playing", 24);
		if (this.#seeking.has(id)) {
			const pos = positionAt(s, sona.statusAt, Date.now());
			const dur = s.track?.duration ?? 0;
			return { title, icon, value: dur > 0 ? `${clock(pos)} / ${clock(dur)}` : clock(pos), indicator: { value: dur > 0 ? Math.round((pos / dur) * 100) : 0, enabled: dur > 0 } };
		}
		return { title, icon, value: `${s.volume}%`, indicator: { value: s.volume } };
	}

	override async onDialRotate(ev: DialRotateEvent<PlaybackDialSettings>): Promise<void> {
		if (!(await this.ready(ev.action))) {
			return;
		}
		this.#pending.set(ev.action.id, (this.#pending.get(ev.action.id) ?? 0) + ev.payload.ticks);
		await this.#flush(ev.action, ev.payload.settings);
	}

	/** Sends the ticks turned so far as one command, one at a time. */
	async #flush(a: DialAction<PlaybackDialSettings>, settings: PlaybackDialSettings): Promise<void> {
		if (this.#sending.has(a.id)) {
			return; // the running send picks them up
		}
		this.#sending.add(a.id);
		try {
			for (let ticks = this.#pending.get(a.id) ?? 0; ticks !== 0; ticks = this.#pending.get(a.id) ?? 0) {
				this.#pending.set(a.id, 0);
				if (this.#seeking.has(a.id)) {
					const step = settings.seekStep ?? 5;
					await run(a, "seek", [`${ticks > 0 ? "+" : "-"}${Math.abs(ticks) * step}`]);
				} else {
					const step = settings.volumeStep ?? 2;
					await run(a, "volume", [`${ticks > 0 ? "+" : "-"}${Math.min(Math.abs(ticks) * step, 100)}`]);
				}
			}
		} finally {
			this.#sending.delete(a.id);
		}
	}

	override async onDialDown(ev: DialDownEvent<PlaybackDialSettings>): Promise<void> {
		if (this.#seeking.has(ev.action.id)) {
			this.#seeking.delete(ev.action.id);
		} else {
			this.#seeking.add(ev.action.id);
		}
		await this.draw(ev.action);
	}

	override async onTouchTap(ev: TouchTapEvent<PlaybackDialSettings>): Promise<void> {
		if (!(await this.ready(ev.action))) {
			return;
		}
		const x = ev.payload.tapPos[0];
		if (x < 50) {
			await run(ev.action, "prev");
		} else if (x > 150) {
			await run(ev.action, "next");
		} else {
			await run(ev.action, "toggle");
		}
	}
}

const forgetAfter = 6000;

/**
 * The queue on one dial: turning moves through the songs after the playing
 * one, and a press (or a tap) plays the one shown.
 */
export class QueueDial extends SonaDial {
	/** The song shown, by action ID, while the person browses. */
	readonly #picked = new Map<string, { index: number; timer: NodeJS.Timeout }>();

	constructor() {
		super(`${uuidPrefix}.queue-dial`);
	}

	#shownIndex(id: string): number {
		const q = sona.queue;
		const picked = this.#picked.get(id);
		const index = picked ? picked.index : q.index + 1;
		return Math.min(Math.max(index, 0), Math.max(q.tracks.length - 1, 0));
	}

	protected async feedback(id: string): Promise<Feedback> {
		const q = sona.queue;
		if (sona.state !== "online") {
			return { title: "Queue", icon: svgURL(dialIconSVG("queue", false, true)), value: "offline", indicator: { value: 0, enabled: false } };
		}
		if (q.tracks.length === 0) {
			return { title: "Queue", icon: svgURL(dialIconSVG("queue")), value: "Empty", indicator: { value: 0, enabled: false } };
		}
		const i = this.#shownIndex(id);
		const t = q.tracks[i];
		const art = t.artwork ? await artworkImage(t.artwork, 96) : null;
		const where = i === q.index ? "Playing" : i === q.index + 1 ? "Up next" : `${i + 1} of ${q.tracks.length}`;
		return {
			title: where,
			icon: art ?? svgURL(dialIconSVG("note")),
			value: ellipsize(`${t.title} · ${t.artist}`, 22),
			indicator: { value: q.tracks.length > 1 ? Math.round((i / (q.tracks.length - 1)) * 100) : 100 },
		};
	}

	override async onDialRotate(ev: DialRotateEvent): Promise<void> {
		if (!(await this.ready(ev.action))) {
			return;
		}
		const id = ev.action.id;
		const index = Math.min(Math.max(this.#shownIndex(id) + ev.payload.ticks, 0), Math.max(sona.queue.tracks.length - 1, 0));
		clearTimeout(this.#picked.get(id)?.timer);
		const timer = setTimeout(() => {
			this.#picked.delete(id);
			void this.draw(ev.action);
		}, forgetAfter);
		this.#picked.set(id, { index, timer });
		await this.draw(ev.action);
	}

	async #play(a: DialAction<JsonObject>): Promise<void> {
		if (!(await this.ready(a)) || sona.queue.tracks.length === 0) {
			return;
		}
		const i = this.#shownIndex(a.id);
		clearTimeout(this.#picked.get(a.id)?.timer);
		this.#picked.delete(a.id);
		await run(a, "queue", ["jump", String(i + 1)]);
	}

	override async onDialDown(ev: DialDownEvent): Promise<void> {
		await this.#play(ev.action);
	}

	override async onTouchTap(ev: TouchTapEvent): Promise<void> {
		await this.#play(ev.action);
	}
}

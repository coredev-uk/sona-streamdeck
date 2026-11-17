import { SingletonAction, type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, type KeyUpEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { sona } from "../context.ts";

/**
 * A key that draws itself from Sona's state: its image is redrawn whenever
 * the status or the connection changes (and only sent when it changed), and
 * a press while Sona isn't reachable shows the alert.
 */
export abstract class SonaKey<S extends JsonObject = JsonObject> extends SingletonAction<S> {
	override readonly manifestId: string;
	/** Each visible key's settings, by action ID. */
	protected readonly settingsOf = new Map<string, S>();
	readonly #shown = new Map<string, string>();

	constructor(uuid: string) {
		super();
		this.manifestId = uuid;
		const redraw = (): void => this.redraw();
		sona.on("status", redraw);
		sona.on("state", redraw);
	}

	/** The key's image (a data URL) for its settings. */
	protected abstract image(id: string, settings: S): string | Promise<string>;

	/** What a press does while Sona is reachable. */
	protected abstract press(action: KeyAction<S>, settings: S): Promise<void>;

	/** A key released (for keys that act while held). */
	protected release(_action: KeyAction<S>): void {}

	override async onWillAppear(ev: WillAppearEvent<S>): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		this.settingsOf.set(ev.action.id, ev.payload.settings);
		this.#shown.delete(ev.action.id);
		await this.draw(ev.action);
	}

	override onWillDisappear(ev: WillDisappearEvent<S>): void {
		this.settingsOf.delete(ev.action.id);
		this.#shown.delete(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<S>): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		this.settingsOf.set(ev.action.id, ev.payload.settings);
		await this.draw(ev.action);
	}

	override async onKeyDown(ev: KeyDownEvent<S>): Promise<void> {
		if (sona.state !== "online") {
			await ev.action.showAlert();
			return;
		}
		await this.press(ev.action, ev.payload.settings);
	}

	override onKeyUp(ev: KeyUpEvent<S>): void {
		this.release(ev.action);
	}

	/** Redraws every visible key of this action. */
	redraw(): void {
		for (const a of this.actions) {
			if (a.isKey()) {
				void this.draw(a);
			}
		}
	}

	protected async draw(a: KeyAction<S>): Promise<void> {
		const img = await this.image(a.id, this.settingsOf.get(a.id) ?? ({} as S));
		if (this.#shown.get(a.id) === img) {
			return;
		}
		this.#shown.set(a.id, img);
		await a.setImage(img);
	}
}

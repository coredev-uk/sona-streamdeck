import streamDeck, { type DidReceiveSettingsEvent, type KeyAction, type SendToPluginEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import { run, sona } from "../context.ts";
import { artworkImage } from "../render/artwork.ts";
import { keySVG, svgURL } from "../render/svg.ts";
import type { LibraryItem, LibraryItems } from "../sona/types.ts";
import { uuidPrefix } from "./controls.ts";
import { SonaKey } from "./key.ts";

// A key that plays one playlist, album or station: picked from the library
// in the property inspector, or any Apple Music link pasted there.

export type PinnedSettings = {
	/** The music.apple.com link `sona play` takes. */
	link?: string;
	shuffle?: boolean;
	/** Remembered from the pick, for the key's face. */
	name?: string;
	artwork?: string;
};

type Option = { label: string; value: string };
type Group = { label: string; children: Option[] };

/** What the picker last listed, by link, to name the key's face. */
const known = new Map<string, LibraryItem>();

export class PinnedKey extends SonaKey<PinnedSettings> {
	constructor() {
		super(`${uuidPrefix}.pinned`);
	}

	protected async image(_id: string, s: PinnedSettings): Promise<string> {
		const offline = sona.state !== "online";
		if (s.artwork && !offline) {
			const img = await artworkImage(s.artwork);
			if (img) {
				return img;
			}
		}
		return svgURL(keySVG({ glyph: "collection", label: s.name || (s.link ? undefined : "Pick one"), offline }));
	}

	protected async press(action: KeyAction<PinnedSettings>, s: PinnedSettings): Promise<void> {
		if (!s.link) {
			await action.showAlert();
			return;
		}
		await run(action, "play", [s.link], { shuffle: s.shuffle === true });
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<PinnedSettings>): Promise<void> {
		const s = ev.payload.settings;
		// A pick from the list: remember its name and cover with the key.
		const item = s.link ? known.get(s.link) : undefined;
		if (item && (s.name !== item.name || s.artwork !== item.artwork)) {
			await ev.action.setSettings({ ...s, name: item.name, artwork: item.artwork });
			return; // the settings come back with them
		}
		if (!item && s.link && s.name && s.link !== this.settingsOf.get(ev.action.id)?.link) {
			await ev.action.setSettings({ ...s, name: "", artwork: "" }); // a pasted link: no stale face
			return;
		}
		await super.onDidReceiveSettings(ev);
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, PinnedSettings>): Promise<void> {
		// sdpi-components' datasource: the picker asks, the plugin answers
		// with the same event and the items.
		const p = ev.payload;
		if (p !== null && typeof p === "object" && !Array.isArray(p) && p.event === "libraryItems") {
			await streamDeck.ui.sendToPropertyInspector({ event: "libraryItems", items: await libraryOptions() });
		}
	}
}

/** The library's playlists and albums as the picker's groups. */
async function libraryOptions(): Promise<Group[]> {
	const groups: Group[] = [];
	for (const [verb, label] of [
		["playlists", "Playlists"],
		["albums", "Albums"],
	] as const) {
		try {
			const res = await sona.call<LibraryItems>("library", [verb]);
			for (const it of res.items) known.set(it.url, it);
			groups.push({ label, children: res.items.filter((it) => it.url).map((it) => ({ label: it.subtitle ? `${it.name} — ${it.subtitle}` : it.name, value: it.url })) });
		} catch {
			// signed out, or Sona not running: the group is left out
		}
	}
	return groups;
}

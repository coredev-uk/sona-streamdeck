import streamDeck from "@elgato/streamdeck";

import { controls } from "./actions/controls.ts";
import { PlaybackDial, QueueDial } from "./actions/dials.ts";
import { ArtworkGridKey, ArtworkKey, ClearQueueKey, SongKey, SpatialKey, VolumeKey } from "./actions/keys.ts";
import { PinnedKey } from "./actions/pinned.ts";
import { connectionText, globals, sona, type GlobalSettings } from "./context.ts";

for (const a of [
	...controls(),
	new VolumeKey(1),
	new VolumeKey(-1),
	new ClearQueueKey(),
	new SpatialKey(),
	new SongKey(),
	new ArtworkKey(),
	new ArtworkGridKey(),
	new PinnedKey(),
	new PlaybackDial(),
	new QueueDial(),
]) {
	streamDeck.actions.registerAction(a);
}

// Every property inspector shows how the connection to Sona stands, and
// may set where `sona` is.
async function sendConnection(): Promise<void> {
	await streamDeck.ui.sendToPropertyInspector({ event: "connection", text: connectionText(), online: sona.state === "online" });
}

streamDeck.ui.onSendToPlugin((ev) => {
	const p = ev.payload;
	if (p !== null && typeof p === "object" && !Array.isArray(p) && p.event === "connection") {
		void sendConnection();
	}
});
streamDeck.ui.onDidAppear(() => void sendConnection());
sona.on("state", () => void sendConnection());

streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
	const path = ev.settings.sonaPath ?? "";
	if (path !== (globals.sonaPath ?? "")) {
		globals.sonaPath = path;
		sona.restart();
	}
});

await streamDeck.connect();
Object.assign(globals, await streamDeck.settings.getGlobalSettings<GlobalSettings>());
sona.start();

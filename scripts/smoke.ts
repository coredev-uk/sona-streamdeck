// Runs the built plugin against a running Sona with no Stream Deck: this
// script plays the Stream Deck app's part (the plugin's WebSocket, as the SDK
// documents it), lays out every action on a pretend Stream Deck and a
// Stream Deck +, presses keys and turns dials, and checks what the plugin
// draws and sends. Sona must be running, and `sona` found (or -sona PATH).
//
//   npm run build && node scripts/smoke.ts [-sona /path/to/sona] [-sheet DIR]
//
// It changes shuffle, repeat, crossfade and the volume, and puts each back.
// It plays nothing: Toggle is pressed only with nothing in the queue.

import { Resvg } from "@resvg/resvg-js";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";

const root = path.join(import.meta.dirname, "..", "uk.coredev.sona.sdPlugin");
const arg = (name: string): string | undefined => {
	const i = process.argv.indexOf(name);
	return i > 0 ? process.argv[i + 1] : undefined;
};
const sonaPath = arg("-sona") ?? "";
const sheetDir = arg("-sheet");

type Sent = { event: string; context?: string; payload?: Record<string, unknown> };

const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")) as {
	Actions: { UUID: string; Controllers: string[] }[];
};

const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
await once(wss, "listening");
const port = (wss.address() as { port: number }).port;
const received: Sent[] = [];
let plugin: WebSocket | undefined;
const waiters: { ok: (m: Sent) => boolean; resolve: (m: Sent) => void }[] = [];

wss.on("connection", (ws) => {
	plugin = ws;
	ws.on("message", (data) => {
		const m = JSON.parse(String(data)) as Sent;
		received.push(m);
		if (m.event === "getGlobalSettings") {
			send({ event: "didReceiveGlobalSettings", payload: { settings: { sonaPath } } });
		}
		for (const w of [...waiters]) {
			if (w.ok(m)) {
				waiters.splice(waiters.indexOf(w), 1);
				w.resolve(m);
			}
		}
	});
});

function send(m: object): void {
	plugin?.send(JSON.stringify(m));
}

/** The next message from the plugin for which ok holds (any already received counts when since is given). */
function expect(what: string, ok: (m: Sent) => boolean, ms = 15_000): Promise<Sent> {
	const { promise, resolve, reject } = Promise.withResolvers<Sent>();
	const timer = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), ms);
	waiters.push({
		ok,
		resolve: (m) => {
			clearTimeout(timer);
			resolve(m);
		},
	});
	return promise;
}

const keysDevice = { id: "deck", name: "Stream Deck XL", size: { columns: 8, rows: 4 }, type: 2 };
const plusDevice = { id: "plus", name: "Stream Deck +", size: { columns: 4, rows: 2 }, type: 7 };
const info = {
	application: { font: "", language: "en", platform: "mac", platformVersion: "15.0", version: "7.1.0.21000" },
	colors: { buttonMouseOverBackgroundColor: "", buttonPressedBackgroundColor: "", buttonPressedBorderColor: "", buttonPressedTextColor: "", highlightColor: "" },
	devicePixelRatio: 2,
	devices: [keysDevice, plusDevice],
	plugin: { uuid: "uk.coredev.sona", version: "0.1.0.0" },
};

const child = spawn(process.execPath, ["bin/plugin.js", "-port", String(port), "-pluginUUID", "uk.coredev.sona", "-registerEvent", "registerPlugin", "-info", JSON.stringify(info)], {
	cwd: root,
	stdio: ["ignore", "inherit", "inherit"],
});

let failures = 0;
function check(ok: boolean, what: string): void {
	console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
	if (!ok) failures++;
}

/** Each action's context, and where it sits. */
const placed = manifest.Actions.map((a, i) => {
	const dial = a.Controllers.includes("Encoder");
	return { uuid: a.UUID, context: `ctx-${a.UUID.split(".").pop()}`, device: dial ? "plus" : "deck", controller: dial ? "Encoder" : "Keypad", coordinates: { column: i % 8, row: Math.floor(i / 8) % 4 } };
});
const ctx = (id: string): (typeof placed)[number] => placed.find((p) => p.uuid === `uk.coredev.sona.${id}`)!;

function event(event: string, id: string, extra: Record<string, unknown> = {}, settings: Record<string, unknown> = {}): void {
	const p = ctx(id);
	send({ event, action: p.uuid, context: p.context, device: p.device, payload: { settings, coordinates: p.coordinates, controller: p.controller, isInMultiAction: false, state: 0, ...extra } });
}

/** The latest image (keys) or feedback (dials) the plugin sent for id. */
function latest(id: string, kind: "setImage" | "setFeedback"): Sent | undefined {
	const c = ctx(id).context;
	return received.findLast((m) => m.event === kind && m.context === c);
}

function svgOf(m: Sent | undefined): string {
	const img = String(m?.payload?.image ?? "");
	return img.startsWith("data:image/svg+xml") ? decodeURIComponent(img.slice(img.indexOf(",") + 1)) : "";
}

const register = expect("registration", (m) => m.event === "registerPlugin");
await register;
check(true, "the plugin registered");

// Lay everything out.
for (const p of placed) {
	event("willAppear", p.uuid.split(".").pop()!);
}
const online = await Promise.race([
	expect("an image drawn online", (m) => m.event === "setImage" && m.context === ctx("toggle").context && !svgOf(m).includes("#5f6662")).then(() => true),
	new Promise<boolean>((r) => setTimeout(() => r(false), 20_000)),
]);
check(online, "keys draw Sona's state once connected (not the offline dim)");
if (!online) {
	console.log("Is Sona running, and is sona found? (-sona PATH)");
	child.kill();
	process.exit(1);
}
await new Promise((r) => setTimeout(r, 1500)); // let the first status settle

const keys = placed.filter((p) => p.controller === "Keypad");
check(keys.every((p) => received.some((m) => m.event === "setImage" && m.context === p.context)), `every key (${keys.length}) has an image`);
const dials = placed.filter((p) => p.controller === "Encoder");
check(dials.every((p) => received.some((m) => m.event === "setFeedback" && m.context === p.context)), `every dial (${dials.length}) has feedback`);

// The connection line in a property inspector (which the app opens first:
// the SDK sends only to the one open).
function openInspector(id: string): void {
	send({ event: "propertyInspectorDidAppear", action: ctx(id).uuid, context: ctx(id).context, device: ctx(id).device });
}
openInspector("toggle");
send({ event: "sendToPlugin", action: ctx("toggle").uuid, context: ctx("toggle").context, payload: { event: "connection" } });
const conn = await expect("the connection line", (m) => m.event === "sendToPropertyInspector" && (m.payload as { event?: string })?.event === "connection");
check((conn.payload as { online?: boolean }).online === true, `the property inspector says: ${(conn.payload as { text?: string }).text}`);

// Switches: press, see the image follow, press again to put it back.
for (const id of ["shuffle", "crossfade"]) {
	const before = svgOf(latest(id, "setImage"));
	const wasOn = before.includes("#f0b43c");
	event("keyDown", id);
	event("keyUp", id);
	await expect(`${id} redrawn`, (m) => m.event === "setImage" && m.context === ctx(id).context && svgOf(m).includes("#f0b43c") !== wasOn);
	check(true, `${id} turns ${wasOn ? "off" : "on"} and the key follows`);
	event("keyDown", id);
	event("keyUp", id);
	await expect(`${id} back`, (m) => m.event === "setImage" && m.context === ctx(id).context && svgOf(m).includes("#f0b43c") === wasOn);
	check(true, `${id} is back as it was`);
}

// Repeat cycles off → all → one → off.
const repeatSeen: string[] = [];
for (let i = 0; i < 3; i++) {
	event("keyDown", "repeat");
	event("keyUp", "repeat");
	const m = await expect("repeat redrawn", (x) => x.event === "setImage" && x.context === ctx("repeat").context && svgOf(x) !== repeatSeen.at(-1));
	repeatSeen.push(svgOf(m));
}
check(repeatSeen.length === 3 && repeatSeen[1].includes("M11.2 10.3") && !repeatSeen[2].includes("#f0b43c"), "repeat cycles all → one → off");

// The player dial shows the volume; a turn moves it, and back.
const volOf = (m: Sent | undefined): number => Number(String((m?.payload as { value?: string })?.value ?? "").replace("%", ""));
const vol0 = volOf(latest("playback-dial", "setFeedback"));
event("dialRotate", "playback-dial", { ticks: 2, pressed: false });
const turned = await expect("the dial's volume", (m) => m.event === "setFeedback" && m.context === ctx("playback-dial").context && volOf(m) !== vol0);
check(volOf(turned) === Math.min(vol0 + 4, 100), `the dial turns the volume ${vol0}% → ${volOf(turned)}%`);
event("dialRotate", "playback-dial", { ticks: -2, pressed: false });
await expect("the volume back", (m) => m.event === "setFeedback" && m.context === ctx("playback-dial").context && volOf(m) === vol0);
check(true, "and back");

// Volume keys.
event("keyDown", "volume-up", {}, { step: 3 });
event("keyUp", "volume-up", {}, { step: 3 });
await expect("volume up", (m) => m.event === "setFeedback" && m.context === ctx("playback-dial").context && volOf(m) === Math.min(vol0 + 3, 100));
check(true, "Volume Up raises it by its step");
event("keyDown", "volume-down", {}, { step: 3 });
event("keyUp", "volume-down", {}, { step: 3 });
await expect("volume down", (m) => m.event === "setFeedback" && m.context === ctx("playback-dial").context && volOf(m) === vol0);
check(true, "Volume Down puts it back");

// A press of the dial switches it to the position.
event("dialDown", "playback-dial");
const seeking = await expect("position mode", (m) => m.event === "setFeedback" && m.context === ctx("playback-dial").context && String((m.payload as { value?: string })?.value).includes(":"));
check(true, `pressed, the dial shows the position (${(seeking.payload as { value?: string }).value})`);
event("dialDown", "playback-dial");

// The Play Collection picker lists the library.
openInspector("pinned");
send({ event: "sendToPlugin", action: ctx("pinned").uuid, context: ctx("pinned").context, payload: { event: "libraryItems" } });
const lib = await expect("the library list", (m) => m.event === "sendToPropertyInspector" && (m.payload as { event?: string })?.event === "libraryItems");
const groups = (lib.payload as { items: { label: string; children: { label: string; value: string }[] }[] }).items;
check(groups.length > 0 && groups.every((g) => g.children.every((c) => c.value.startsWith("https://music.apple.com/library/"))), `the picker lists ${groups.map((g) => `${g.children.length} ${g.label.toLowerCase()}`).join(", ")}`);

// Clear Queue asks first.
event("keyDown", "clear-queue");
const armed = await expect("Clear?", (m) => m.event === "setImage" && m.context === ctx("clear-queue").context && svgOf(m).includes("Clear?"));
check(armed !== undefined, "Clear Queue asks for a second press");

// A key that Sona refuses shows the alert (Suggest Less without an account,
// or with nothing playing).
event("keyDown", "dislike");
const alert = await Promise.race([
	expect("an alert", (m) => m.event === "showAlert" && m.context === ctx("dislike").context, 8000).then(() => "alert"),
	expect("a redraw", (m) => m.event === "setImage" && m.context === ctx("dislike").context, 8000).then(() => "redraw"),
]).catch(() => "nothing");
check(alert === "alert" || alert === "redraw", `Suggest Less answers (${alert})`);

if (sheetDir) {
	mkdirSync(sheetDir, { recursive: true });
	for (const p of placed) {
		const m = received.findLast((x) => (x.event === "setImage" || x.event === "setFeedback") && x.context === p.context);
		const name = p.uuid.split(".").pop()!;
		const s = svgOf(m);
		if (s) writeFileSync(path.join(sheetDir, `${name}.png`), new Resvg(s).render().asPng());
		if (m?.event === "setFeedback") writeFileSync(path.join(sheetDir, `${name}.json`), JSON.stringify({ ...m.payload, icon: "…" }, null, 1));
	}
	console.log(`wrote the deck's faces to ${sheetDir}`);
}

child.kill();
wss.close();
console.log(failures === 0 ? "smoke: all good" : `smoke: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

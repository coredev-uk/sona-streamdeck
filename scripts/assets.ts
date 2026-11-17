// Writes the plugin's images from the same drawing the keys use at run time:
// the action list icons (white on transparent), the keys' default faces,
// the category icon and the plugin icon (PNG, for the Marketplace).
//
//   node scripts/assets.ts            write them into the .sdPlugin folder
//   node scripts/assets.ts --sheet D  also write PNG previews of every key into D

import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { glyphSVG, keySVG, songSVG, svg, palette, type KeyLook } from "../src/render/svg.ts";
import type { GlyphName } from "../src/render/glyphs.ts";

const root = path.join(import.meta.dirname, "..", "uk.coredev.sona.sdPlugin");

/** Each action's list icon and default key face. */
export const faces: Record<string, { icon: GlyphName; key: KeyLook | "song" }> = {
	toggle: { icon: "play", key: { glyph: "play" } },
	next: { icon: "next", key: { glyph: "next" } },
	previous: { icon: "previous", key: { glyph: "previous" } },
	shuffle: { icon: "shuffle", key: { glyph: "shuffle" } },
	repeat: { icon: "repeat", key: { glyph: "repeat" } },
	like: { icon: "heart", key: { glyph: "heart" } },
	dislike: { icon: "thumbsDown", key: { glyph: "thumbsDown" } },
	library: { icon: "add", key: { glyph: "add" } },
	crossfade: { icon: "crossfade", key: { glyph: "crossfade" } },
	private: { icon: "eyeOff", key: { glyph: "eye" } },
	"volume-up": { icon: "volumeUp", key: { glyph: "volumeUp" } },
	"volume-down": { icon: "volumeDown", key: { glyph: "volumeDown" } },
	"clear-queue": { icon: "clearQueue", key: { glyph: "clearQueue" } },
	spatial: { icon: "spatial", key: { glyph: "spatial" } },
	"now-playing": { icon: "note", key: "song" },
	artwork: { icon: "note", key: { glyph: "note" } },
	"artwork-grid": { icon: "note", key: { glyph: "note" } },
	pinned: { icon: "collection", key: { glyph: "collection" } },
	"playback-dial": { icon: "dial", key: { glyph: "dial" } },
	"queue-dial": { icon: "queue", key: { glyph: "queue" } },
};

/** Sona's mark: the record of the app icon, in one colour or its own. */
function mark(size: number, mono: boolean): string {
	const c = (n: number): number => (n / 512) * size;
	if (mono) {
		return svg(size, size, `<circle cx="${c(256)}" cy="${c(256)}" r="${c(220)}" fill="none" stroke="#FFFFFF" stroke-width="${c(40)}"/><circle cx="${c(256)}" cy="${c(256)}" r="${c(96)}" fill="#FFFFFF"/>`);
	}
	return svg(
		size,
		size,
		`<circle cx="${c(256)}" cy="${c(256)}" r="${c(240)}" fill="#1b1f1d"/>` +
			[200, 166, 132].map((r) => `<circle cx="${c(256)}" cy="${c(256)}" r="${c(r)}" fill="none" stroke="#2a302c" stroke-width="${c(6)}"/>`).join("") +
			`<circle cx="${c(256)}" cy="${c(256)}" r="${c(96)}" fill="${palette.accent}"/><circle cx="${c(256)}" cy="${c(256)}" r="${c(14)}" fill="#1b1f1d"/>`,
	);
}

function png(s: string, width: number): Buffer {
	return new Resvg(s, { fitTo: { mode: "width", value: width } }).render().asPng();
}

function write(rel: string, data: string | Buffer): void {
	const p = path.join(root, rel);
	mkdirSync(path.dirname(p), { recursive: true });
	writeFileSync(p, data);
}

const face = (k: KeyLook | "song"): string => (k === "song" ? songSVG({ title: "Song", artist: "Artist" }) : keySVG(k));

for (const [id, f] of Object.entries(faces)) {
	write(`imgs/actions/${id}.svg`, svg(20, 20, glyphSVG(f.icon, "#FFFFFF", 0, 0, 20)));
	write(`imgs/keys/${id}.svg`, face(f.key));
}
write("imgs/plugin/category.svg", mark(28, true));
write("imgs/plugin/icon.png", png(mark(256, false), 256));
write("imgs/plugin/icon@2x.png", png(mark(512, false), 512));

const sheet = process.argv.indexOf("--sheet");
if (sheet > 0) {
	const dir = process.argv[sheet + 1];
	mkdirSync(dir, { recursive: true });
	const looks: [string, string][] = Object.entries(faces).map(([id, f]) => [id, face(f.key)]);
	looks.push(
		["shuffle-on", keySVG({ glyph: "shuffle", active: true })],
		["repeat-one", keySVG({ glyph: "repeatOne", active: true })],
		["liked", keySVG({ glyph: "heartFilled", active: true })],
		["disliked", keySVG({ glyph: "thumbsDownFilled", active: true })],
		["in-library", keySVG({ glyph: "check", active: true })],
		["private-on", keySVG({ glyph: "eyeOff", active: true })],
		["pause", keySVG({ glyph: "pause" })],
		["offline", keySVG({ glyph: "play", offline: true })],
		["clear-armed", keySVG({ glyph: "clearQueue", label: "Clear?", alarm: true })],
		["pinned-named", keySVG({ glyph: "collection", label: "Road trip mix" })],
		["song-long", songSVG({ title: "Bohemian Rhapsody (Remastered 2011)", artist: "Queen", scroll: 4 })],
		["song-offline", songSVG({ title: "", artist: "", offline: true, message: "Sona" })],
	);
	for (const [name, s] of looks) {
		writeFileSync(path.join(dir, `${name}.png`), png(s, 144));
	}
	writeFileSync(path.join(dir, "mark.png"), png(mark(256, false), 256));
	writeFileSync(path.join(dir, "category.png"), png(mark(56, true), 56));
	console.log(`wrote ${looks.length + 2} previews to ${dir}`);
}

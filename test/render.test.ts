import assert from "node:assert/strict";
import { test } from "node:test";

import { Resvg } from "@resvg/resvg-js";

import { cropTile, isArtworkURL, sized } from "../src/render/artwork.ts";
import { glyphs, type GlyphName } from "../src/render/glyphs.ts";
import { ellipsize, escapeXML, keySVG, marquee, songSVG, titleFits } from "../src/render/svg.ts";
import { positionAt, offlineStatus } from "../src/sona/types.ts";

/** The RGBA pixel at x, y of a rendered SVG. */
function pixel(svg: string, x: number, y: number): number[] {
	const img = new Resvg(svg).render();
	const i = (y * img.width + x) * 4;
	return [...img.pixels.subarray(i, i + 4)];
}

test("every glyph draws, ink when off and amber when on", () => {
	for (const name of Object.keys(glyphs) as GlyphName[]) {
		const off = new Resvg(keySVG({ glyph: name })).render();
		assert.equal(off.width, 144, name);
		// Something is drawn besides the ground.
		const px = off.pixels;
		let ink = 0;
		for (let i = 0; i < px.length; i += 4) if (px[i] > 120) ink++;
		assert.ok(ink > 100, `${name} draws ${ink} light pixels`);
	}
	// The middle of a filled heart is amber when on.
	assert.deepEqual(pixel(keySVG({ glyph: "heartFilled", active: true }), 72, 76).slice(0, 3), [0xf0, 0xb4, 0x3c]);
});

test("text: escaped, cut and scrolled", () => {
	assert.equal(escapeXML(`<Tom & "Jerry's">`), "&lt;Tom &amp; &quot;Jerry&apos;s&quot;&gt;");
	assert.equal(ellipsize("Abbey Road", 20), "Abbey Road");
	assert.equal(ellipsize("Sgt. Pepper's Lonely Hearts", 8), "Sgt. Pe…");
	assert.equal(marquee("Short", 5), "Short");
	const long = "Bohemian Rhapsody";
	assert.equal([...marquee(long, 0)].length, titleFits);
	assert.equal(marquee(long, 0), long.slice(0, titleFits));
	assert.equal(marquee(long, long.length + 3), marquee(long, 0)); // it loops
	// A title with markup in it renders.
	assert.ok(new Resvg(songSVG({ title: "<Song> & co", artist: "A & B" })).render().width === 144);
});

test("artwork: Apple's CDN only, at the size asked", () => {
	assert.equal(isArtworkURL("https://is1-ssl.mzstatic.com/image/thumb/a/600x600bb.jpg"), true);
	assert.equal(isArtworkURL("http://is1-ssl.mzstatic.com/a.jpg"), false);
	assert.equal(isArtworkURL("https://example.com/a.jpg"), false);
	assert.equal(isArtworkURL("https://evilmzstatic.com/a.jpg"), false);
	assert.equal(sized("https://is1-ssl.mzstatic.com/image/thumb/a/600x600bb.png", 288), "https://is1-ssl.mzstatic.com/image/thumb/a/288x288bb.jpg");
});

test("a grid tile is its part of the cover", () => {
	// A 4×4 image whose quarters are red, green, blue and white.
	const w = 4;
	const data = new Uint8Array(w * w * 4);
	const colours = [
		[255, 0, 0],
		[0, 255, 0],
		[0, 0, 255],
		[255, 255, 255],
	];
	for (let y = 0; y < w; y++) {
		for (let x = 0; x < w; x++) {
			const q = (y < 2 ? 0 : 2) + (x < 2 ? 0 : 1);
			data.set([...colours[q], 255], (y * w + x) * 4);
		}
	}
	const url = cropTile({ width: w, height: w, data }, 2, 2, 1, 1); // bottom right
	const jpg = Buffer.from(url.split(",")[1], "base64");
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><image href="data:image/jpeg;base64,${jpg.toString("base64")}" width="2" height="2"/></svg>`;
	const [r, g, b] = pixel(svg, 1, 1);
	assert.ok(r > 200 && g > 200 && b > 200, `white, got ${r},${g},${b}`);
});

test("the position moves on while playing, within the song", () => {
	const s = { ...offlineStatus, running: true, state: "playing" as const, position: 10, track: { id: "1", title: "", artist: "", album: "", duration: 12, explicit: false, artwork: "" } };
	assert.equal(positionAt(s, 1000, 2500), 11.5);
	assert.equal(positionAt(s, 1000, 9000), 12);
	assert.equal(positionAt({ ...s, state: "paused" }, 1000, 9000), 10);
});

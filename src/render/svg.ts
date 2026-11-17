import { glyphs, type Glyph, type GlyphName } from "./glyphs.ts";

// Key and touch-strip images, drawn as SVG and handed to Stream Deck as data
// URLs. Colours are Sona's: a near-black ground, warm off-white glyphs, its
// amber for what is on.

export const palette = {
	ground: "#161a18",
	ink: "#ece9e2",
	accent: "#f0b43c",
	dim: "#5f6662",
	alarm: "#e8735d",
} as const;

const font = "-apple-system, 'Segoe UI', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif";

/** The size of a key image, in pixels (Stream Deck XL's @2x). */
export const keySize = 144;

export type KeyLook = {
	glyph: GlyphName;
	/** Drawn in amber: the thing is on (shuffle, a favourite). */
	active?: boolean;
	/** Drawn dimmed: Sona isn't reachable, or the key can't act now. */
	offline?: boolean;
	/** A short word under the glyph. */
	label?: string;
	/** The label in the alarm colour (a confirmation). */
	alarm?: boolean;
};

export function escapeXML(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c);
}

/** s cut to at most n characters, with an ellipsis when cut. */
export function ellipsize(s: string, n: number): string {
	const chars = [...s];
	return chars.length <= n ? s : chars.slice(0, Math.max(n - 1, 1)).join("").trimEnd() + "…";
}

/**
 * The SVG of glyph in colour, scaled from its 24-unit grid to size, at x, y.
 * Colours are written out rather than inherited (currentColor): the Stream
 * Deck app's SVG renderer is not a browser's.
 */
export function glyphSVG(name: GlyphName, colour: string, x: number, y: number, size: number): string {
	const g: Glyph = glyphs[name];
	const s = size / 24;
	let body = "";
	if (g.stroke) {
		body += `<path d="${g.stroke}" fill="none" stroke="${colour}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
	}
	if (g.fill) {
		body += `<path d="${g.fill}" fill="${colour}"/>`;
	}
	if (g.extra) {
		body += g.extra.replaceAll("currentColor", colour);
	}
	return `<g transform="translate(${x} ${y}) scale(${s})">${body}</g>`;
}

/** A key: its glyph, and a label under it. */
export function keySVG(look: KeyLook): string {
	const colour = look.offline ? palette.dim : look.active ? palette.accent : palette.ink;
	const size = look.label ? 64 : 76;
	const x = (keySize - size) / 2;
	const y = look.label ? 24 : (keySize - size) / 2;
	let label = "";
	if (look.label) {
		const fill = look.offline ? palette.dim : look.alarm ? palette.alarm : palette.ink;
		label = `<text x="72" y="122" text-anchor="middle" font-family="${font}" font-size="19" font-weight="600" fill="${fill}">${escapeXML(ellipsize(look.label, 12))}</text>`;
	}
	return svg(keySize, keySize, `<rect width="144" height="144" fill="${palette.ground}"/>${glyphSVG(look.glyph, colour, x, y, size)}${label}`);
}

export type SongLook = {
	title: string;
	artist: string;
	/** Characters the title has scrolled by (marquee). */
	scroll?: number;
	offline?: boolean;
	/** What to say instead of a song. */
	message?: string;
};

/** Title characters that fit a key's width at the title's size. */
export const titleFits = 10;

/** The marquee text of title scrolled by n characters. */
export function marquee(title: string, n: number): string {
	const chars = [...title];
	if (chars.length <= titleFits) {
		return title;
	}
	const loop = [...chars, ..." · ", ...chars];
	const start = n % (chars.length + 3);
	return loop.slice(start, start + titleFits).join("");
}

/** The song display key: the title (scrolling when long) over the artist. */
export function songSVG(look: SongLook): string {
	const ground = `<rect width="144" height="144" fill="${palette.ground}"/>`;
	if (look.message !== undefined || look.offline) {
		const msg = look.message ?? "Sona";
		return svg(keySize, keySize, `${ground}${glyphSVG("note", palette.dim, 44, 26, 56)}<text x="72" y="118" text-anchor="middle" font-family="${font}" font-size="16" font-weight="600" fill="${palette.dim}">${escapeXML(ellipsize(msg, 15))}</text>`);
	}
	const title = escapeXML(marquee(look.title, look.scroll ?? 0));
	const artist = escapeXML(ellipsize(look.artist, 14));
	return svg(
		keySize,
		keySize,
		`${ground}<clipPath id="text"><rect x="12" y="0" width="120" height="144"/></clipPath>${glyphSVG("note", palette.accent, 12, 14, 30)}` +
			`<g clip-path="url(#text)"><text x="12" y="84" font-family="${font}" font-size="20" font-weight="700" fill="${palette.ink}">${title}</text>` +
			`<text x="12" y="114" font-family="${font}" font-size="17" fill="${palette.dim}">${artist}</text></g>`,
	);
}

/** A touch-strip icon for a dial (the layout's 48×48 icon slot, drawn at 2×). */
export function dialIconSVG(name: GlyphName, active = false, offline = false): string {
	const colour = offline ? palette.dim : active ? palette.accent : palette.ink;
	return svg(96, 96, glyphSVG(name, colour, 12, 12, 72));
}

export function svg(w: number, h: number, body: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

/** An SVG as a data URL for setImage and setFeedback. */
export function svgURL(s: string): string {
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(s)}`;
}

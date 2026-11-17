import jpeg from "jpeg-js";

// Album covers for the keys. Sona hands out 600×600 images on Apple's artwork
// CDN (is1-ssl.mzstatic.com …/600x600bb.jpg); the plugin fetches them itself,
// at the size a key needs, and keeps the last few.

const maxCached = 24;
const cache = new Map<string, Promise<Buffer | null>>();

/** u at size×size pixels, as a JPEG, when it is an artwork CDN URL. */
export function sized(u: string, size: number): string {
	return u.replace(/\/\d+x\d+(bb|cc|sr)?\.(jpg|jpeg|png|webp)$/i, `/${size}x${size}bb.jpg`);
}

/** Only Apple's artwork CDN over https: Sona's status never names another host. */
export function isArtworkURL(u: string): boolean {
	try {
		const p = new URL(u);
		return p.protocol === "https:" && (p.hostname === "mzstatic.com" || p.hostname.endsWith(".mzstatic.com"));
	} catch {
		return false;
	}
}

async function fetchBytes(u: string): Promise<Buffer | null> {
	try {
		const res = await fetch(u, { signal: AbortSignal.timeout(10_000) });
		if (!res.ok) {
			return null;
		}
		return Buffer.from(await res.arrayBuffer());
	} catch {
		return null;
	}
}

/** The JPEG bytes of artwork u at size, from the cache or the CDN; null when it can't be had. */
export function artworkBytes(u: string, size: number): Promise<Buffer | null> {
	if (!isArtworkURL(u)) {
		return Promise.resolve(null);
	}
	const key = sized(u, size);
	let p = cache.get(key);
	if (p) {
		cache.delete(key); // most recently used last
		cache.set(key, p);
		return p;
	}
	p = fetchBytes(key);
	cache.set(key, p);
	void p.then((b) => {
		if (b === null) cache.delete(key); // try again next time
	});
	while (cache.size > maxCached) {
		cache.delete(cache.keys().next().value!);
	}
	return p;
}

/** Artwork u as a data URL for a key; null when it can't be had. */
export async function artworkImage(u: string, size = 288): Promise<string | null> {
	const b = await artworkBytes(u, size);
	return b ? `data:image/jpeg;base64,${b.toString("base64")}` : null;
}

/**
 * The tile at column col, row row of artwork u cut into cols × rows squares
 * (an album art grid across several keys), as a data URL.
 */
export async function artworkTile(u: string, cols: number, rows: number, col: number, row: number): Promise<string | null> {
	const span = Math.max(cols, rows);
	const b = await artworkBytes(u, Math.min(144 * span, 1200));
	if (!b) {
		return null;
	}
	let img: { width: number; height: number; data: Uint8Array };
	try {
		img = jpeg.decode(b, { useTArray: true, formatAsRGBA: true });
	} catch {
		return null;
	}
	return cropTile(img, cols, rows, col, row);
}

/** The tile of a decoded RGBA image, encoded as a JPEG data URL. */
export function cropTile(img: { width: number; height: number; data: Uint8Array }, cols: number, rows: number, col: number, row: number): string {
	// The cover is square; a grid that isn't square shows its middle.
	const span = Math.max(cols, rows);
	const tile = Math.floor(Math.min(img.width, img.height) / span);
	const x0 = Math.floor((img.width - tile * cols) / 2) + col * tile;
	const y0 = Math.floor((img.height - tile * rows) / 2) + row * tile;
	const out = new Uint8Array(tile * tile * 4);
	for (let y = 0; y < tile; y++) {
		const from = ((y0 + y) * img.width + x0) * 4;
		out.set(img.data.subarray(from, from + tile * 4), y * tile * 4);
	}
	const jpg = jpeg.encode({ data: out, width: tile, height: tile }, 88);
	return `data:image/jpeg;base64,${Buffer.from(jpg.data).toString("base64")}`;
}

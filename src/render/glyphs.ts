// The glyphs on the keys, drawn on a 24×24 grid: stroked paths (round caps
// and joins) unless a glyph says it is filled. Sona's own drawing, in the
// manner of its interface's icons.

export type Glyph = {
	/** Path data, stroked. */
	stroke?: string;
	/** Path data, filled. */
	fill?: string;
	/** Extra SVG drawn as is (circles, text), in the glyph's colour. */
	extra?: string;
};

export const glyphs = {
	play: { fill: "M8 5.5v13a1 1 0 0 0 1.5.9l10.2-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5z" },
	pause: { fill: "M6.5 5h3.5v14H6.5zM14 5h3.5v14H14z" },
	next: { fill: "M5 6.2v11.6a.8.8 0 0 0 1.2.7l8.6-5.8a.8.8 0 0 0 0-1.4L6.2 5.5A.8.8 0 0 0 5 6.2zM16.5 5.5h2.5v13h-2.5z" },
	previous: { fill: "M19 6.2v11.6a.8.8 0 0 1-1.2.7l-8.6-5.8a.8.8 0 0 1 0-1.4l8.6-5.8a.8.8 0 0 1 1.2.7zM5 5.5h2.5v13H5z" },
	shuffle: { stroke: "M3 7h3.5c2.5 0 3.6 1.6 5 4.7S14.5 17 17 17h3M3 17h3.5c1.4 0 2.4-.6 3.2-1.6M14.3 8.6C15 7.6 15.9 7 17 7h3M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5" },
	repeat: { stroke: "M4 11.5V9.5A2.5 2.5 0 0 1 6.5 7H19M16.5 4.5 19 7l-2.5 2.5M20 12.5v2A2.5 2.5 0 0 1 17.5 17H5M7.5 19.5 5 17l2.5-2.5" },
	repeatOne: {
		stroke: "M4 11.5V9.5A2.5 2.5 0 0 1 6.5 7H19M16.5 4.5 19 7l-2.5 2.5M20 12.5v2A2.5 2.5 0 0 1 17.5 17H5M7.5 19.5 5 17l2.5-2.5",
		fill: "M11.2 10.3 12.6 9.6h.9v5h-1.2v-3.6l-.9.4z",
	},
	heart: { stroke: "M12 19.5s-7.5-4.6-8.8-9C2.3 7.4 4.4 5 7.2 5c1.9 0 3.3 1 4.8 2.8C13.5 6 14.9 5 16.8 5c2.8 0 4.9 2.4 4 5.5-1.3 4.4-8.8 9-8.8 9z" },
	heartFilled: { fill: "M12 19.5s-7.5-4.6-8.8-9C2.3 7.4 4.4 5 7.2 5c1.9 0 3.3 1 4.8 2.8C13.5 6 14.9 5 16.8 5c2.8 0 4.9 2.4 4 5.5-1.3 4.4-8.8 9-8.8 9z" },
	thumbsDown: { stroke: "M16 4v9.5l-3.6 6.2a1.6 1.6 0 0 1-3-.9V15H5.6a1.8 1.8 0 0 1-1.8-2.1l1.1-7.2A2 2 0 0 1 6.9 4zM16 4h3.2a.8.8 0 0 1 .8.8v7.9a.8.8 0 0 1-.8.8H16" },
	thumbsDownFilled: {
		fill: "M15.2 4v9.3l-3.4 6a1.7 1.7 0 0 1-3.1-.9V15H5.5a1.8 1.8 0 0 1-1.8-2.1l1.1-7.2A2 2 0 0 1 6.8 4zM16.8 4h2.4a.8.8 0 0 1 .8.8v7.9a.8.8 0 0 1-.8.8h-2.4z",
	},
	add: { stroke: "M12 5v14M5 12h14" },
	check: { stroke: "M5 12.5 9.5 17 19 7" },
	volumeUp: { stroke: "M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 12h5M18.5 9.5v5" },
	volumeDown: { stroke: "M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 12h5" },
	crossfade: { stroke: "M3 17c5.2 0 6.3-10 9-10s3.8 10 9 10M3 7c5.2 0 6.3 10 9 10s3.8-10 9-10" },
	spatial: { stroke: "M4.5 15.5V12a7.5 7.5 0 0 1 15 0v3.5M4.5 14.5h2.8v5.5H5.3a.8.8 0 0 1-.8-.8zM19.5 14.5h-2.8v5.5h2a.8.8 0 0 0 .8-.8z" },
	eye: { stroke: "M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6z", extra: '<circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/>' },
	eyeOff: { stroke: "M3.5 3.5l17 17M10.3 6.2A9.8 9.8 0 0 1 12 6c5.9 0 9.5 6 9.5 6a16 16 0 0 1-2.8 3.3M6.4 7.4C3.9 9.1 2.5 12 2.5 12s3.6 6 9.5 6c1.6 0 3-.4 4.2-1M10.2 10.3a2.6 2.6 0 0 0 3.5 3.5" },
	clearQueue: { stroke: "M4 7h11M4 12h11M4 17h6M14.5 14.5l5 5M19.5 14.5l-5 5" },
	queue: { stroke: "M4 7h11M4 12h11M4 17h8M17 15.5v-8.5l3.5 1.5" },
	collection: { stroke: "M5 4.5h14a.5.5 0 0 1 .5.5v14a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5z", fill: "M10 9v6.4a.5.5 0 0 0 .8.4l4.6-3.2a.5.5 0 0 0 0-.8l-4.6-3.2A.5.5 0 0 0 10 9z" },
	note: { stroke: "M9 17.5V6.5l10-2.5v11", extra: '<circle cx="6.8" cy="17.5" r="2.3" fill="currentColor"/><circle cx="16.8" cy="15" r="2.3" fill="currentColor"/>' },
	dial: { stroke: "M12 4v3M12 20a8 8 0 1 0-8-8", extra: '<circle cx="12" cy="12" r="2" fill="currentColor"/>' },
} satisfies Record<string, Glyph>;

export type GlyphName = keyof typeof glyphs;

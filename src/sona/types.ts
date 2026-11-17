// The JSON Sona answers with: `sona connect` speaks add-on protocol v2, and its
// results and events are the `sona` command line's schemas
// (sona-go: internal/cli/schema.go, docs/addons.md). Fields are only ever
// added; unknown ones are ignored.

export type Track = {
	id: string;
	title: string;
	artist: string;
	album: string;
	duration: number;
	explicit: boolean;
	/** A 600×600 image on Apple's artwork CDN; "" when none. */
	artwork: string;
};

export type State = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export type Repeat = "off" | "all" | "one";

export type Status = {
	running: boolean;
	state: State;
	track: Track | null;
	/** Seconds into the track when the status was taken. */
	position: number;
	/** 0–100. */
	volume: number;
	shuffle: boolean;
	repeat: Repeat;
	private: boolean;
	preview: boolean;
	error: string;
	liked?: boolean;
	disliked?: boolean;
	inLibrary?: boolean;
	crossfade?: boolean;
	spatial?: boolean;
};

export type NowPlaying = {
	track: Track | null;
	/** Unix milliseconds; 0 when nothing plays. */
	startedAt: number;
};

export type QueueTrack = Track & { autoPlay: boolean };

export type Queue = {
	/** The playing song's place in tracks; -1 when none. */
	index: number;
	tracks: QueueTrack[];
};

export type Like = {
	track: Track;
	liked: boolean;
	disliked?: boolean;
	inLibrary?: boolean;
};

export type LibraryItem = {
	id: string;
	name: string;
	subtitle: string;
	artwork: string;
	/** The music.apple.com link `play` takes. */
	url: string;
};

export type LibraryItems = {
	kind: "playlist" | "album";
	total: number;
	items: LibraryItem[];
};

export type SearchResult = {
	kind: string;
	id: string;
	name: string;
	subtitle: string;
	explicit: boolean;
	url: string;
};

export type SearchResults = {
	term: string;
	results: SearchResult[];
};

/** The status of a Sona that isn't running or can't be reached. */
export const offlineStatus: Status = {
	running: false,
	state: "idle",
	track: null,
	position: 0,
	volume: 0,
	shuffle: false,
	repeat: "off",
	private: false,
	preview: false,
	error: "",
};

/**
 * The position of status at time now (ms): the reported position, moved on
 * while playing, within the track.
 */
export function positionAt(status: Status, receivedAt: number, now: number): number {
	let pos = status.position;
	if (status.state === "playing") {
		pos += (now - receivedAt) / 1000;
	}
	const dur = status.track?.duration ?? 0;
	return dur > 0 ? Math.min(Math.max(pos, 0), dur) : Math.max(pos, 0);
}

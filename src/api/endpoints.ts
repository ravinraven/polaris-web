import {
	Album,
	AlbumHeader,
	AlbumKey,
	API_ARRAY_SEPARATOR,
	ApiKey,
	Artist,
	ArtistHeader,
	Authorization,
	BrowserEntry,
	CreatedApiKey,
	Genre,
	GenreHeader,
	IndexStatus,
	InitialSetup,
	MountDir,
	NewApiKey,
	NewSettings,
	NewUser,
	Peaks,
	Playlist,
	PlaylistHeader,
	SavePlaylistInput,
	Settings,
	Song,
	SongList,
	User,
	UserUpdate,
} from "@/api/dto";
import { useSongsStore } from "@/stores/songs";
import { useUserStore } from "@/stores/user";

async function request(endpoint: string, options?: RequestInit): Promise<Response> {
	const user = useUserStore();

	if (!options) {
		options = {};
	}

	options.headers = new Headers(options.headers);
	if (user.isLoggedIn) {
		options.headers.set("Authorization", "Bearer " + getAuthToken());
	}
	options.headers.set("Accept-Version", "8")

	const response = await fetch("api" + endpoint, options);
	if (response.status == 401) {
		user.logout();
	}

	if (!response.ok) {
		throw response;
	}

	return response;
}

function getAuthToken(): string | undefined {
	return useUserStore().authToken;
}

// OpenSubsonic (`/rest`)
//
// Polaris's OpenSubsonic API does the browsing of albums and the serving of audio and cover art.
// It identifies everything by opaque ids, while the rest of this app knows songs by path and
// albums by name and artists. These maps remember which id goes with which, from every response
// that carried both. Anything not (yet) seen falls back to the Polaris API.

const REST_VERSION = "1.16.1";
const REST_PAGE_SIZE = 500;
const REST_ID = /^(so|al|ar|pl|di)_[A-Za-z0-9_-]{21}$/;
const songIds = new Map<string, string>();
const albumIds = new Map<string, string>();

function albumIdKey(key: AlbumKey): string {
	return (key.name || "") + API_ARRAY_SEPARATOR + key.artists.join(API_ARRAY_SEPARATOR);
}

function restURL(method: string, params: Record<string, string | number | undefined> = {}): string {
	const query = new URLSearchParams({ v: REST_VERSION, c: "polaris-web", f: "json" });
	for (const [name, value] of Object.entries(params)) {
		if (value !== undefined) {
			query.set(name, String(value));
		}
	}
	// A session token is what this app has; the server accepts it on /rest as well
	query.set("auth_token", getAuthToken() ?? "");
	return `rest/${method}?${query}`;
}

type RestObject = Record<string, any>;

async function rest(method: string, params: Record<string, string | number | undefined> = {}): Promise<RestObject> {
	const response = await fetch(restURL(method, params));
	if (!response.ok) {
		throw response;
	}
	const body = (await response.json())["subsonic-response"];
	if (body.status !== "ok") {
		// 40 is the error for unknown credentials: the session is no longer valid
		if (body.error?.code === 40) {
			useUserStore().logout();
		}
		throw new Error(body.error?.message ?? "OpenSubsonic request failed");
	}
	return body;
}

function restArtists(item: RestObject): string[] {
	const names: string[] | undefined = item.artists?.map((a: RestObject) => a.name);
	return names?.length ? names : item.artist ? [item.artist] : [];
}

function restSong(child: RestObject): Song {
	songIds.set(child.path, child.id);
	return {
		path: child.path,
		track_number: child.track,
		disc_number: child.discNumber,
		title: child.title,
		artists: restArtists(child),
		album_artists: child.albumArtists?.map((a: RestObject) => a.name),
		year: child.year,
		album: child.album,
		artwork: child.coverArt,
		duration: child.duration,
		genres: child.genres?.map((g: RestObject) => g.name),
		composers: child.contributors?.filter((c: RestObject) => c.role === "composer").map((c: RestObject) => c.artist.name),
		lyricists: child.contributors?.filter((c: RestObject) => c.role === "lyricist").map((c: RestObject) => c.artist.name),
	};
}

function restAlbumHeader(album: RestObject): AlbumHeader {
	const header: AlbumHeader = {
		name: album.name,
		main_artists: restArtists(album),
		artwork: album.coverArt,
		year: album.year,
	};
	albumIds.set(albumIdKey({ name: header.name, artists: header.main_artists }), album.id);
	return header;
}

// The id of an album, looking it up when the list it came from has not been seen in this session
// (the app remembers album lists between visits).
async function resolveAlbumId(key: AlbumKey): Promise<string | undefined> {
	const known = albumIds.get(albumIdKey(key));
	if (known || !key.name) {
		return known;
	}
	try {
		const body = await rest("search3", { query: key.name, albumCount: 50, artistCount: 0, songCount: 0 });
		(body.searchResult3?.album ?? []).forEach(restAlbumHeader);
	} catch {
		return undefined;
	}
	return albumIds.get(albumIdKey(key));
}

async function restAlbumList(type: string, offset: number, size: number): Promise<AlbumHeader[]> {
	const body = await rest("getAlbumList2", { type, offset, size });
	return (body.albumList2?.album ?? []).map(restAlbumHeader);
}

// Basic

export async function initialSetup(): Promise<InitialSetup> {
	return (await request("/initial_setup")).json();
}

export async function login(username: string, password: string): Promise<Authorization> {
	const response = await request("/auth", {
		method: "POST",
		body: JSON.stringify({ username: username, password: password }),
		headers: { "Content-type": "application/json" },
	});
	return response.json();
}

// Config

export async function getSettings(): Promise<Settings> {
	return (await request("/settings")).json();
}

export async function putSettings(settings: NewSettings): Promise<void> {
	await request("/settings", {
		method: "PUT",
		body: JSON.stringify(settings),
		headers: { "Content-Type": "application/json" },
	});
}

export async function getMountDirs(): Promise<MountDir[]> {
	return (await request("/mount_dirs")).json();
}

export async function putMountDirs(mountDirs: MountDir[]): Promise<void> {
	await request("/mount_dirs", {
		method: "PUT",
		body: JSON.stringify(mountDirs),
		headers: { "Content-Type": "application/json" },
	});
}

export async function triggerIndex(): Promise<void> {
	await request("/trigger_index", { method: "POST" });
}

export async function getIndexStatus(): Promise<IndexStatus> {
	return (await request("/index_status")).json();
}

// Users

export async function getUsers(): Promise<User[]> {
	return (await request("/users")).json();
}

export async function createUser(newUser: NewUser): Promise<void> {
	await request("/user", {
		method: "POST",
		body: JSON.stringify(newUser),
		headers: { "Content-Type": "application/json" },
	});
}

export async function updateUser(name: string, userUpdate: UserUpdate): Promise<void> {
	await request("/user/" + name, {
		method: "PUT",
		body: JSON.stringify(userUpdate),
		headers: { "Content-Type": "application/json" },
	});
}

export async function deleteUser(name: string) {
	await request("/user/" + name, { method: "DELETE" });
}

// API keys

export async function getApiKeys(): Promise<ApiKey[]> {
	return (await request("/api_keys")).json();
}

export async function createApiKey(newApiKey: NewApiKey): Promise<CreatedApiKey> {
	const response = await request("/api_keys", {
		method: "POST",
		body: JSON.stringify(newApiKey),
		headers: { "Content-Type": "application/json" },
	});
	return response.json();
}

export async function deleteApiKey(id: string): Promise<void> {
	await request("/api_keys/" + encodeURIComponent(id), { method: "DELETE" });
}

// File browser

export async function browse(path: string): Promise<BrowserEntry[]> {
	const songs = useSongsStore();
	const response = await request("/browse/" + encodeURIComponent(path));
	return await response.json().then((entries: BrowserEntry[]) => {
		songs.request(entries.filter(e => !e.is_directory).map(e => e.path));
		return entries;
	});
}

export async function flatten(path: string): Promise<SongList> {
	const songs = useSongsStore();
	const response = await request("/flatten/" + encodeURIComponent(path));

	const songList = response.json().then((list: SongList) => {
		songs.ingest(list.first_songs);
		songs.request(list.paths);
		return list;
	});

	return await songList;
}

// Semantic

export async function getGenres(): Promise<GenreHeader[]> {
	const response = await request("/genres");
	return await response.json();
}

export async function getGenre(name: string): Promise<Genre> {
	const response = await request(`/genre/${encodeURIComponent(name)}`);
	return await response.json();
}

export async function getGenreAlbums(name: string): Promise<AlbumHeader[]> {
	const response = await request(`/genre/${encodeURIComponent(name)}/albums`);
	return await response.json();
}

export async function getGenreArtists(name: string): Promise<ArtistHeader[]> {
	const response = await request(`/genre/${encodeURIComponent(name)}/artists`);
	return await response.json();
}

export async function getGenreSongs(genre: string): Promise<SongList> {
	const songs = useSongsStore();
	const response = await request(`/genre/${encodeURIComponent(genre)}/songs`);
	const songList = response.json().then((list: SongList) => {
		songs.ingest(list.first_songs);
		songs.request(list.paths);
		return list;
	});
	return await songList;
}

export async function getAlbums(): Promise<AlbumHeader[]> {
	const albums: AlbumHeader[] = [];
	for (;;) {
		const page = await restAlbumList("alphabeticalByName", albums.length, REST_PAGE_SIZE);
		albums.push(...page);
		if (page.length < REST_PAGE_SIZE) {
			return albums;
		}
	}
}

export async function getRandomAlbums(seed: number, offset: number, count: number): Promise<AlbumHeader[]> {
	const response = await request(`/albums/random?seed=${seed}&offset=${offset}&count=${count}`);
	return await response.json();
}

export async function getRecentAlbums(offset: number, count: number): Promise<AlbumHeader[]> {
	return await restAlbumList("newest", offset, Math.min(count, REST_PAGE_SIZE));
}

export async function getArtists(): Promise<ArtistHeader[]> {
	const response = await request("/artists");
	return await response.json();
}

export async function getArtist(name: string): Promise<Artist> {
	const response = await request(`/artist/${encodeURIComponent(name)}`);
	return await response.json();
}

export async function getAlbum(albumKey: AlbumKey): Promise<Album> {
	const songs = useSongsStore();
	const id = await resolveAlbumId(albumKey);
	if (id) {
		const album = (await rest("getAlbum", { id })).album;
		const header = restAlbumHeader(album);
		const result: Album = { ...header, songs: (album.song ?? []).map(restSong) };
		songs.ingest(result.songs);
		return result;
	}
	const response = await request("/album/" + encodeURIComponent(albumKey.name || "") + "/by/" + encodeURIComponent(albumKey.artists.join(API_ARRAY_SEPARATOR)));
	return await response.json().then((album: Album) => {
		songs.ingest(album.songs);
		return album;
	});
}

// Search

export async function search(query: string): Promise<SongList> {
	const songs = useSongsStore();
	const response = await request("/search/" + encodeURIComponent(query));

	const songList = response.json().then((list: SongList) => {
		songs.ingest(list.first_songs);
		songs.request(list.paths);
		return list;
	});

	return await songList;
}

// Playlist management

export async function listPlaylists(): Promise<PlaylistHeader[]> {
	return (await request("/playlists")).json();
}

export async function getPlaylist(name: string): Promise<Playlist> {
	const songs = useSongsStore();
	const response = await request("/playlist/" + encodeURIComponent(name));
	return await response.json().then((playlist: Playlist) => {
		songs.ingest(playlist.songs.first_songs);
		songs.request(playlist.songs.paths);
		return playlist;
	});
}

export async function putPlaylist(name: string, tracks: string[]): Promise<void> {
	let playlist: SavePlaylistInput = { tracks: tracks };
	await request("/playlist/" + encodeURIComponent(name), {
		method: "PUT",
		body: JSON.stringify(playlist),
		headers: { "Content-Type": "application/json" },
	});
}

export async function deletePlaylist(name: string): Promise<void> {
	await request("/playlist/" + encodeURIComponent(name), { method: "DELETE" });
}

export async function exportPlaylists(): Promise<{ filename: string, payload: Blob }> {
	const response = await request("/playlists/export");
	const parseFilename = /(filename="?([\w\-\.]+)"?)|(filename\*=UTF-8''([\w\-\.]+))/i;
	const match = response.headers.get("Content-Disposition")?.match(parseFilename);
	let filename = "playlists.zip";
	if (match) {
		filename = match[2] || match[4];
	}
	return { filename, payload: await response.blob() };
}

export async function importPlaylists(files: { filename: string, content: Blob }[]): Promise<void> {
	const formData = new FormData();
	for (let { filename, content } of files) {
		formData.append(filename, content);
	}
	await request("/playlists/import", {
		method: "PUT",
		body: formData,
	});
}

// Media 

export async function get_songs(paths: string[]): Promise<{ songs: Song[], not_found: string[] }> {
	const response = await request("/songs", {
		method: "POST",
		body: JSON.stringify({ paths: [...new Set(paths).values()] }),
		headers: { "Content-Type": "application/json" },
	});
	return await response.json();
}

export async function get_peaks(path: string): Promise<Peaks> {
	const response = await request(`/peaks/${encodeURIComponent(path)}`, { method: "GET" });
	return await response.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

export function makeAudioURL(path: string) {
	const id = songIds.get(path);
	if (id) {
		return restURL("stream", { id });
	}
	return "api/audio/" + encodeURIComponent(path) + "?auth_token=" + getAuthToken();
}

const THUMBNAIL_PIXELS = { tiny: 64, small: 400, large: 1200, native: undefined };

export function makeThumbnailURL(path: string, size: "tiny" | "small" | "large" | "native") {
	size = size || "small";
	// Artwork from the OpenSubsonic API is a cover art id, from the Polaris API a path
	if (REST_ID.test(path)) {
		return restURL("getCoverArt", { id: path, size: THUMBNAIL_PIXELS[size] });
	}
	return `api/thumbnail/${encodeURIComponent(path)}?size=${size}&pad=false&auth_token=${getAuthToken()}`;
}

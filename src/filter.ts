// The filter box of the file browser. Words are combined (all must match):
//
//   .flac  or  ext:flac   files with that extension
//   dir:rock              files inside a folder whose name contains "rock"
//   anything else         text found anywhere in the path
//
// The server finds candidates with the first term; the rest narrow them down here.

export type Filter = {
	/** What to ask the server for, if there is anything to ask */
	searchText: string | undefined;
	/** Whether a path passes every term */
	matches: (path: string) => boolean;
};

type Term = { kind: "text" | "ext" | "dir"; value: string };

function parseTerm(word: string): Term | undefined {
	const lower = word.toLowerCase();
	if (lower.startsWith("ext:") && lower.length > 4) {
		return { kind: "ext", value: lower.slice(4).replace(/^\./, "") };
	}
	if (lower.startsWith("dir:") && lower.length > 4) {
		return { kind: "dir", value: lower.slice(4) };
	}
	if (/^\.[^./\\]+$/.test(lower)) {
		return { kind: "ext", value: lower.slice(1) };
	}
	return word ? { kind: "text", value: lower } : undefined;
}

function extensionOf(path: string): string {
	const name = path.split(/[\/\\]/).pop() ?? "";
	const dot = name.lastIndexOf(".");
	return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

function folderNames(path: string): string[] {
	return path.split(/[\/\\]/).slice(0, -1).map(n => n.toLowerCase());
}

export function parseFilter(query: string): Filter {
	const terms = query.split(/\s+/).map(parseTerm).filter((t): t is Term => t !== undefined);

	// Prefer the term that narrows the server's answer the most
	const asked = terms.find(t => t.kind == "text") ?? terms.find(t => t.kind == "dir") ?? terms[0];
	let searchText: string | undefined = undefined;
	if (asked) {
		searchText = asked.kind == "ext" ? "." + asked.value : asked.value;
	}

	const matches = (path: string) => {
		const lower = path.toLowerCase();
		return terms.every(term => {
			switch (term.kind) {
				case "ext": return extensionOf(path) == term.value;
				case "dir": return folderNames(path).some(n => n.includes(term.value));
				default: return lower.includes(term.value);
			}
		});
	};

	return { searchText, matches };
}

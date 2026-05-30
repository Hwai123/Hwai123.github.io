import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const CONFIG_PATH = path.resolve("scripts/obsidian-publish.config.json");
export const SYNC_MARKER = "<!-- synced-from-obsidian -->";

export async function pathExists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

export function normalizeSlash(value) {
	return value.replaceAll("\\", "/");
}

export function stripExtension(value) {
	return value.replace(/\.(md|mdx|canvas|excalidraw|png|jpe?g|webp|gif|svg|pdf)$/i, "");
}

export function parseArgs(argv) {
	const args = {};
	const positional = [];

	for (let i = 0; i < argv.length; i++) {
		const item = argv[i];

		if (item.startsWith("--")) {
			const key = item.slice(2);
			const next = argv[i + 1];

			if (!next || next.startsWith("--")) {
				args[key] = true;
			} else {
				args[key] = next;
				i++;
			}
		} else {
			positional.push(item);
		}
	}

	return { args, positional };
}

export async function readConfig() {
	const raw = await fs.readFile(CONFIG_PATH, "utf8");
	const config = JSON.parse(raw);

	if (!config.vaultRoot) {
		throw new Error("obsidian-publish.config.json 缺少 vaultRoot。");
	}

	if (!config.outputRoot) {
		throw new Error("obsidian-publish.config.json 缺少 outputRoot。");
	}

	if (!Array.isArray(config.notes)) {
		config.notes = [];
	}

	if (!Array.isArray(config.assetSearchDirs)) {
		config.assetSearchDirs = ["attachments"];
	}

	if (!Array.isArray(config.noteSearchDirs)) {
		config.noteSearchDirs = [""];
	}

	return config;
}

export async function writeConfig(config) {
	await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function unquote(value) {
	return value.trim().replace(/^["']|["']$/g, "");
}

function parseInlineArray(value) {
	return value
		.slice(1, -1)
		.split(",")
		.map((item) => unquote(item))
		.filter(Boolean);
}

export function parseFrontmatter(markdown) {
	const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

	if (!match) {
		return { data: {}, body: markdown };
	}

	const raw = match[1];
	const body = markdown.slice(match[0].length);
	const data = {};
	const lines = raw.split(/\r?\n/);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);

		if (!pair) {
			continue;
		}

		const key = pair[1];
		const value = pair[2].trim();

		if (value === "") {
			const list = [];

			while (lines[i + 1]?.match(/^\s*-\s+/)) {
				i++;
				list.push(unquote(lines[i].replace(/^\s*-\s+/, "")));
			}

			data[key] = list;
		} else if (value.startsWith("[") && value.endsWith("]")) {
			data[key] = parseInlineArray(value);
		} else if (value === "true" || value === "false") {
			data[key] = value === "true";
		} else {
			data[key] = unquote(value);
		}
	}

	return { data, body };
}

export function asString(value) {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function asBoolean(value) {
	if (typeof value === "boolean") {
		return value;
	}

	if (typeof value === "string") {
		if (value === "true") return true;
		if (value === "false") return false;
	}

	return undefined;
}

export function asStringArray(value) {
	if (Array.isArray(value)) {
		return value.map(String).map((item) => item.trim()).filter(Boolean);
	}

	if (typeof value === "string" && value.trim()) {
		return [value.trim()];
	}

	return undefined;
}

export function dateOnly(value) {
	if (!value) {
		return undefined;
	}

	return String(value).match(/\d{4}-\d{2}-\d{2}/)?.[0];
}

export function firstHeading(body) {
	return body.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

export function firstParagraph(body) {
	const cleaned = body
		.replace(/```[\s\S]*?```/g, "")
		.replace(/\$\$[\s\S]*?\$\$/g, "")
		.replace(/!\[\[[^\]]+\]\]/g, "")
		.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias || target)
		.split(/\r?\n\r?\n/)
		.map((paragraph) => paragraph.trim())
		.find((paragraph) => paragraph && !paragraph.startsWith("#") && !paragraph.startsWith(">"));

	return cleaned?.replace(/\s+/g, " ").slice(0, 160);
}

export function fallbackSlug(title, source) {
	const ascii = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

	if (ascii) {
		return `notes/${ascii}`;
	}

	const hash = crypto.createHash("sha1").update(source).digest("hex").slice(0, 8);
	const today = new Date().toISOString().slice(0, 10);
	return `notes/${today}-${hash}`;
}

export function toVaultRelativePath(input, vaultRoot) {
	const resolvedVaultRoot = path.resolve(vaultRoot);
	const absoluteSource = path.isAbsolute(input)
		? path.resolve(input)
		: path.resolve(resolvedVaultRoot, input);
	const relative = path.relative(resolvedVaultRoot, absoluteSource);

	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error("这篇笔记不在 vaultRoot 下面，请检查路径。");
	}

	return {
		absoluteSource,
		source: normalizeSlash(relative),
	};
}

function notePathVariants(filePath) {
	if (path.extname(filePath)) {
		return [filePath];
	}

	return [filePath, `${filePath}.md`, `${filePath}.mdx`];
}

async function isReadableFile(filePath) {
	try {
		const stat = await fs.stat(filePath);
		return stat.isFile();
	} catch {
		return false;
	}
}

export async function resolveNoteSource(input, config) {
	const vaultRoot = path.resolve(config.vaultRoot);

	if (path.isAbsolute(input)) {
		for (const candidate of notePathVariants(path.resolve(input))) {
			if (await isReadableFile(candidate)) {
				return toVaultRelativePath(candidate, vaultRoot);
			}
		}

		return toVaultRelativePath(input, vaultRoot);
	}

	const candidates = [];
	const normalizedInput = normalizeSlash(input).replace(/^\/+/, "");

	for (const candidate of notePathVariants(path.resolve(vaultRoot, normalizedInput))) {
		candidates.push(candidate);
	}

	for (const searchDir of config.noteSearchDirs ?? [""]) {
		if (!searchDir) {
			continue;
		}

		const candidateBase = path.resolve(vaultRoot, searchDir, normalizedInput);
		for (const candidate of notePathVariants(candidateBase)) {
			candidates.push(candidate);
		}
	}

	for (const candidate of [...new Set(candidates)]) {
		if (await isReadableFile(candidate)) {
			return toVaultRelativePath(candidate, vaultRoot);
		}
	}

	return toVaultRelativePath(input, vaultRoot);
}

export function cleanSlug(value) {
	return normalizeSlash(value)
		.replace(/^\/+/, "")
		.replace(/^posts\//, "")
		.replace(/\/+$/, "");
}

export function splitTags(value) {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

export function safeAssetName(filePath) {
	const parsed = path.parse(filePath);
	const name = parsed.name
		.normalize("NFKC")
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

	return `${name || "asset"}${parsed.ext.toLowerCase()}`;
}

export function isImagePath(value) {
	return /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(value);
}

export function isDocumentAssetPath(value) {
	return /\.(pdf|mp3|mp4|webm|wav|ogg)$/i.test(value);
}

export function isExcalidrawPath(value) {
	return /(\.relationship\.md|\.excalidraw|\.excalidraw\.md)$/i.test(value);
}

export function stripAnchor(value) {
	return value.split("#")[0];
}

export function noteDisplayName(target) {
	return stripExtension(path.basename(stripAnchor(target))).replace(/\.relationship$/i, "");
}

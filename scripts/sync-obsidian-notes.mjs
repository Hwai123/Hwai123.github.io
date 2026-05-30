import fs from "node:fs/promises";
import path from "node:path";
import {
	SYNC_MARKER,
	asBoolean,
	asString,
	asStringArray,
	cleanSlug,
	dateOnly,
	firstHeading,
	firstParagraph,
	isDocumentAssetPath,
	isExcalidrawPath,
	isImagePath,
	noteDisplayName,
	normalizeSlash,
	parseArgs,
	parseFrontmatter,
	pathExists,
	readConfig,
	safeAssetName,
	stripAnchor,
	stripExtension,
	toVaultRelativePath,
} from "./obsidian-publish-utils.mjs";

const warnings = [];

function usage() {
	return `用法:
  pnpm sync:obsidian

可选参数:
  --only "slug-or-source"   只同步某一篇
  --strict                  遇到缺失附件或导出图时失败
  --force                   允许覆盖没有同步标记的 index.md`;
}

function yamlString(value) {
	return JSON.stringify(value ?? "");
}

function renderFrontmatter(meta) {
	const lines = [
		"---",
		`title: ${yamlString(meta.title)}`,
		`published: ${meta.published}`,
	];

	if (meta.updated) lines.push(`updated: ${meta.updated}`);
	if (meta.description) lines.push(`description: ${yamlString(meta.description)}`);
	if (meta.image) lines.push(`image: ${yamlString(meta.image)}`);

	lines.push(`tags: ${JSON.stringify(meta.tags ?? [])}`);
	lines.push(`category: ${yamlString(meta.category ?? "")}`);
	lines.push(`draft: ${meta.draft === true ? "true" : "false"}`);

	if (meta.lang) lines.push(`lang: ${yamlString(meta.lang)}`);
	if (meta.author) lines.push(`author: ${yamlString(meta.author)}`);
	if (meta.sourceLink) lines.push(`sourceLink: ${yamlString(meta.sourceLink)}`);
	if (meta.licenseName) lines.push(`licenseName: ${yamlString(meta.licenseName)}`);
	if (meta.licenseUrl) lines.push(`licenseUrl: ${yamlString(meta.licenseUrl)}`);
	if (typeof meta.comment === "boolean") lines.push(`comment: ${meta.comment ? "true" : "false"}`);

	lines.push("---", "", SYNC_MARKER, "");

	return lines.join("\n");
}

function mergeMeta(note, data, body, source, stat) {
	const title =
		asString(note.title) ??
		asString(data.title) ??
		firstHeading(body) ??
		path.basename(source, path.extname(source));
	const tags = asStringArray(note.tags) ?? asStringArray(data.tags) ?? [];
	const published =
		dateOnly(asString(note.published)) ??
		dateOnly(asString(data.published)) ??
		dateOnly(asString(data.created)) ??
		dateOnly(asString(data.date)) ??
		stat.mtime.toISOString().slice(0, 10);
	const updated =
		dateOnly(asString(note.updated)) ??
		dateOnly(asString(data.updated)) ??
		dateOnly(asString(data.modified));
	const description =
		asString(note.description) ??
		asString(data.description) ??
		asString(data.summary) ??
		firstParagraph(body) ??
		"";

	return {
		title,
		published,
		updated,
		description,
		image: asString(note.image) ?? asString(data.image),
		tags,
		category: asString(note.category) ?? asString(data.category) ?? tags[0] ?? "",
		draft: asBoolean(note.draft) ?? asBoolean(data.draft) ?? false,
		lang: asString(note.lang) ?? asString(data.lang),
		author: asString(note.author) ?? asString(data.author),
		sourceLink: asString(note.sourceLink) ?? asString(data.sourceLink) ?? asString(data.source),
		licenseName: asString(note.licenseName) ?? asString(data.licenseName),
		licenseUrl: asString(note.licenseUrl) ?? asString(data.licenseUrl),
		comment: asBoolean(note.comment) ?? asBoolean(data.comment),
	};
}

function noteKeys(note) {
	const source = normalizeSlash(note.source);
	const withoutExt = stripExtension(source);
	const base = path.posix.basename(withoutExt);
	const keys = new Set([source, withoutExt, base]);

	if (note.title) {
		keys.add(note.title);
	}

	return keys;
}

function createPublishedNoteMap(notes) {
	const map = new Map();

	for (const note of notes) {
		for (const key of noteKeys(note)) {
			map.set(key, note);
		}
	}

	return map;
}

function resolveWikiLink(target, alias, publishedNoteMap) {
	const cleanTarget = stripExtension(stripAnchor(target.trim()));
	const published = publishedNoteMap.get(cleanTarget) ?? publishedNoteMap.get(path.posix.basename(cleanTarget));
	const label = alias?.trim() || path.posix.basename(cleanTarget);

	if (!published) {
		return label;
	}

	return `[${label}](/posts/${cleanSlug(published.slug)}/)`;
}

function candidateAssetPaths({ target, sourceDir, vaultRoot, config }) {
	const cleanTarget = normalizeSlash(stripAnchor(target)).replace(/^attachments\//, "");
	const candidates = [];
	const resolvedVaultRoot = path.resolve(vaultRoot);
	let currentDir = path.resolve(sourceDir);

	while (currentDir.startsWith(resolvedVaultRoot)) {
		candidates.push(path.resolve(currentDir, cleanTarget));
		candidates.push(path.resolve(currentDir, "attachments", cleanTarget));

		if (currentDir === resolvedVaultRoot) {
			break;
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			break;
		}
		currentDir = parentDir;
	}

	for (const dir of config.assetSearchDirs ?? []) {
		candidates.push(path.resolve(vaultRoot, dir, cleanTarget));
	}

	return [...new Set(candidates)];
}

async function findFirstExisting(candidates) {
	for (const candidate of candidates) {
		if (await pathExists(candidate)) {
			return candidate;
		}
	}

	return undefined;
}

async function resolveAsset(target, sourceDir, vaultRoot, config) {
	return findFirstExisting(candidateAssetPaths({ target, sourceDir, vaultRoot, config }));
}

async function resolveExcalidrawExport(target, sourceDir, vaultRoot, config) {
	const cleanTarget = normalizeSlash(stripAnchor(target)).replace(/^attachments\//, "");
	const targetDir = path.posix.dirname(cleanTarget);
	const targetBase = path.posix.basename(cleanTarget)
		.replace(/\.relationship\.md$/i, "")
		.replace(/\.excalidraw\.md$/i, "")
		.replace(/\.excalidraw$/i, "")
		.replace(/\.md$/i, "");
	const targetFileBase = path.posix.basename(cleanTarget).replace(/\.(md|excalidraw)$/i, "");
	const names = [
		`${targetBase}.svg`,
		`${targetBase}.png`,
		`${targetBase}.webp`,
		`${targetBase}.avif`,
		`${targetFileBase}.svg`,
		`${targetFileBase}.png`,
		`${targetFileBase}.webp`,
		`${targetFileBase}.avif`,
		`${path.posix.basename(cleanTarget)}.svg`,
		`${path.posix.basename(cleanTarget)}.png`,
	];
	const candidates = [];

	for (const name of names) {
		const withOriginalDir = targetDir === "." ? name : path.posix.join(targetDir, name);
		candidates.push(...candidateAssetPaths({ target: withOriginalDir, sourceDir, vaultRoot, config }));
	}

	return findFirstExisting(candidates);
}

async function copyAsset(sourcePath, assetDir, usedNames) {
	const safeName = safeAssetName(sourcePath);
	let finalName = safeName;
	let counter = 2;

	while (usedNames.has(finalName)) {
		const parsed = path.parse(safeName);
		finalName = `${parsed.name}-${counter}${parsed.ext}`;
		counter++;
	}

	usedNames.add(finalName);
	await fs.mkdir(assetDir, { recursive: true });
	await fs.copyFile(sourcePath, path.join(assetDir, finalName));
	return `./assets/${finalName}`;
}

async function transformEmbeds(markdown, context) {
	const embedRegex = /!\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;
	let output = "";
	let lastIndex = 0;

	for (const match of markdown.matchAll(embedRegex)) {
		output += markdown.slice(lastIndex, match.index);

		const target = match[1].trim();
		const width = match[2]?.trim();
		const cleanTarget = stripAnchor(target);
		const displayName = noteDisplayName(cleanTarget);

		if (isImagePath(cleanTarget) || isDocumentAssetPath(cleanTarget)) {
			const asset = await resolveAsset(cleanTarget, context.sourceDir, context.vaultRoot, context.config);

			if (asset) {
				const rel = await copyAsset(asset, context.assetDir, context.usedNames);
				output += isImagePath(cleanTarget)
					? width
						? `<img src="${rel}" width="${width}" alt="${displayName}" />`
						: `![${displayName}](${rel})`
					: `[${displayName}](${rel})`;
			} else {
				warnings.push(`${context.note.source}: 找不到附件 ${cleanTarget}`);
				output += `> [!warning]\n> 找不到附件：${cleanTarget}`;
			}
		} else if (isExcalidrawPath(cleanTarget)) {
			const exported = await resolveExcalidrawExport(cleanTarget, context.sourceDir, context.vaultRoot, context.config);

			if (exported) {
				const rel = await copyAsset(exported, context.assetDir, context.usedNames);
				output += width
					? `<img src="${rel}" width="${width}" alt="${displayName}" />`
					: `![${displayName}](${rel})`;
			} else {
				warnings.push(`${context.note.source}: 找不到 Excalidraw 导出图 ${cleanTarget}`);
				output += `> [!warning]\n> 找不到 Excalidraw 导出图：${cleanTarget}`;
			}
		} else {
			output += resolveWikiLink(target, undefined, context.publishedNoteMap);
		}

		lastIndex = match.index + match[0].length;
	}

	output += markdown.slice(lastIndex);
	return output;
}

function transformWikiLinks(markdown, publishedNoteMap) {
	return markdown.replace(/\[\[([^|\]#]+(?:#[^|\]]+)?)(?:\|([^\]]+))?\]\]/g, (_, target, alias) =>
		resolveWikiLink(target, alias, publishedNoteMap),
	);
}

function stripObsidianComments(markdown) {
	return markdown.replace(/%%[\s\S]*?%%/g, "");
}

async function assertSafeWrite(indexPath, force) {
	if (!(await pathExists(indexPath))) {
		return;
	}

	const existing = await fs.readFile(indexPath, "utf8");

	if (!existing.includes(SYNC_MARKER) && force !== true) {
		throw new Error(
			`拒绝覆盖没有同步标记的文件：${indexPath}。确认要覆盖时运行 pnpm sync:obsidian -- --force。`,
		);
	}
}

async function syncNote(note, config, publishedNoteMap, options) {
	const vaultRoot = path.resolve(config.vaultRoot);
	const outputRoot = path.resolve(config.outputRoot);
	const { absoluteSource, source } = toVaultRelativePath(note.source, vaultRoot);
	const slug = cleanSlug(note.slug);
	const outDir = path.resolve(outputRoot, slug);
	const assetDir = path.join(outDir, "assets");
	const indexPath = path.join(outDir, "index.md");
	const relativeOut = path.relative(outputRoot, outDir);

	if (!slug) {
		throw new Error(`${source}: 缺少 slug。`);
	}

	if (relativeOut.startsWith("..") || path.isAbsolute(relativeOut)) {
		throw new Error(`${source}: slug 输出到了 outputRoot 外部，请检查配置。`);
	}

	await assertSafeWrite(indexPath, options.force);

	const raw = await fs.readFile(absoluteSource, "utf8");
	const stat = await fs.stat(absoluteSource);
	const { data, body } = parseFrontmatter(raw);
	const meta = mergeMeta(note, data, body, source, stat);
	const usedNames = new Set();
	const context = {
		note: { ...note, source },
		config,
		vaultRoot,
		sourceDir: path.dirname(absoluteSource),
		assetDir,
		usedNames,
		publishedNoteMap,
	};
	const withoutComments = stripObsidianComments(body);
	const withEmbeds = await transformEmbeds(withoutComments, context);
	const converted = transformWikiLinks(withEmbeds, publishedNoteMap);

	await fs.mkdir(outDir, { recursive: true });
	await fs.writeFile(indexPath, `${renderFrontmatter(meta)}${converted.trim()}\n`, "utf8");

	console.log(`synced: ${source} -> ${normalizeSlash(path.relative(process.cwd(), indexPath))}`);
}

async function main() {
	const { args } = parseArgs(process.argv.slice(2));

	if (args.help === true || args.h === true) {
		console.log(usage());
		return;
	}

	const config = await readConfig();
	const only = asString(args.only);
	const notes = only
		? config.notes.filter((note) => note.source === only || note.slug === only)
		: config.notes;

	if (notes.length === 0) {
		console.log(only ? `没有匹配到要同步的笔记：${only}` : "发布清单为空，没有需要同步的笔记。");
		return;
	}

	const publishedNoteMap = createPublishedNoteMap(config.notes);

	for (const note of notes) {
		await syncNote(note, config, publishedNoteMap, { force: args.force === true });
	}

	if (warnings.length > 0) {
		console.log("");
		console.log("同步完成，但有这些提醒：");
		for (const warning of warnings) {
			console.log(`- ${warning}`);
		}

		if (args.strict === true) {
			process.exitCode = 1;
		}
	}
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});

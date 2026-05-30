import fs from "node:fs/promises";
import path from "node:path";
import {
	asBoolean,
	asString,
	asStringArray,
	cleanSlug,
	dateOnly,
	fallbackSlug,
	firstHeading,
	firstParagraph,
	parseArgs,
	parseFrontmatter,
	readConfig,
	resolveNoteSource,
	splitTags,
	writeConfig,
} from "./obsidian-publish-utils.mjs";

function usage() {
	return `用法:
  pnpm note:add "vault 内相对路径.md" --category "分类" --slug "url/path"

常用参数:
  --title "标题"
  --published 2026-05-30
  --description "简介"
  --tags "标签1,标签2"
  --draft
  --dry-run
  --force`;
}

async function main() {
	const { args, positional } = parseArgs(process.argv.slice(2));
	const input = positional[0];

	if (!input || args.help === true || args.h === true) {
		console.log(usage());
		process.exit(args.help === true || args.h === true ? 0 : 1);
	}

	const config = await readConfig();
	const { absoluteSource, source } = await resolveNoteSource(input, config);
	const raw = await fs.readFile(absoluteSource, "utf8");
	const stat = await fs.stat(absoluteSource);
	const { data, body } = parseFrontmatter(raw);

	const title =
		asString(args.title) ??
		asString(data.title) ??
		firstHeading(body) ??
		path.basename(source, path.extname(source));
	const tags =
		(typeof args.tags === "string" ? splitTags(args.tags) : undefined) ??
		asStringArray(data.tags) ??
		[];
	const published =
		dateOnly(asString(args.published)) ??
		dateOnly(asString(data.published)) ??
		dateOnly(asString(data.created)) ??
		dateOnly(asString(data.date)) ??
		stat.mtime.toISOString().slice(0, 10);
	const updated =
		dateOnly(asString(args.updated)) ??
		dateOnly(asString(data.updated)) ??
		dateOnly(asString(data.modified));
	const category = asString(args.category) ?? asString(data.category) ?? tags[0] ?? "";
	const description =
		asString(args.description) ??
		asString(data.description) ??
		asString(data.summary) ??
		firstParagraph(body) ??
		"";
	const sourceLink = asString(args.sourceLink) ?? asString(data.sourceLink) ?? asString(data.source);
	const image = asString(args.image) ?? asString(data.image);
	const draft = asBoolean(args.draft) ?? asBoolean(data.draft) ?? false;
	const slug = cleanSlug(asString(args.slug) ?? fallbackSlug(title, source));

	const entry = {
		source,
		slug,
		title,
		published,
		...(updated ? { updated } : {}),
		description,
		tags,
		category,
		...(sourceLink ? { sourceLink } : {}),
		...(image ? { image } : {}),
		draft,
	};

	if (args["dry-run"] === true) {
		console.log(JSON.stringify(entry, null, 2));
		return;
	}

	const existingIndex = config.notes.findIndex((note) => note.source === source || note.slug === slug);

	if (existingIndex >= 0) {
		if (args.force !== true) {
			const existing = config.notes[existingIndex];
			throw new Error(
				`发布清单里已经有 source 或 slug 相同的条目：${existing.source} -> ${existing.slug}。如需覆盖，加 --force。`,
			);
		}

		config.notes[existingIndex] = {
			...config.notes[existingIndex],
			...entry,
		};
	} else {
		config.notes.push(entry);
	}

	await writeConfig(config);

	console.log(`已加入发布清单：${title}`);
	console.log(`source: ${source}`);
	console.log(`slug: ${slug}`);
	console.log(`published: ${published}`);
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});

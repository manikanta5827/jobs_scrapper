/**
 * Dead Function Finder
 *
 * AST-based (TypeScript compiler API) scan for unused function declarations,
 * arrow/function-expression consts, and class/object methods across a
 * JS/TS/Svelte/Vue project.
 *
 * Usage:
 *   node scripts/find_dead_functions.js [optional/path/to/scan]
 */

import fs from "fs";
import path from "path";
import ts from "typescript";

const targetDir = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : process.cwd();

if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
	console.error(`Not a directory: ${targetDir}`);
	process.exit(1);
}

const ignoreDirs = new Set([
	"node_modules",
	".git",
	".svelte-kit",
	"build",
	"dist",
	"coverage",
	".next",
	".nuxt",
	"out",
	"public",
	"static",
	".turbo",
	".vercel",
	".cache",
	"graphify-out",
	"playwright-report",
	"test-results",
	".report",
]);

// Extensions parsed directly by the TS compiler vs. extracted-then-parsed.
const directExtensions = new Map([
	[".ts", ts.ScriptKind.TS],
	[".tsx", ts.ScriptKind.TSX],
	[".js", ts.ScriptKind.JS],
	[".jsx", ts.ScriptKind.JSX],
	[".mjs", ts.ScriptKind.JS],
	[".cjs", ts.ScriptKind.JS],
]);
const markupExtensions = new Set([".svelte", ".vue", ".html"]);
const validExtensions = new Set([...directExtensions.keys(), ...markupExtensions]);

// Framework lifecycle hooks / reserved names that are "used" by the framework itself.
const ignoreFunctions = new Set([
	"load",
	"GET",
	"POST",
	"PUT",
	"DELETE",
	"PATCH",
	"layout",
	"page",
	"actions",
	"prerender",
	"ssr",
	"csr",
	"render",
	"componentDidMount",
	"componentDidUpdate",
	"componentWillUnmount",
	"ngOnInit",
	"setup",
	"constructor",
	"default",
	"handleError", // SvelteKit hooks.server.ts reserved export, framework-invoked by name
	"runes", // Svelte config compilerOptions key, read by the Svelte compiler
	"css", // Svelte custom-transition return contract ({ css, tick, duration, ... }), read by the runtime
	"tick",
]);

function getAllFiles(dirPath, seenReal = new Set(), out = []) {
	let entries;
	try {
		entries = fs.readdirSync(dirPath, { withFileTypes: true });
	} catch {
		return out; // permission denied / unreadable dir
	}

	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name);

		if (entry.isSymbolicLink()) {
			let real;
			try {
				real = fs.realpathSync(fullPath);
			} catch {
				continue; // broken symlink
			}
			if (seenReal.has(real)) continue; // symlink loop guard
			seenReal.add(real);
			let stat;
			try {
				stat = fs.statSync(fullPath);
			} catch {
				continue;
			}
			if (stat.isDirectory()) {
				if (!ignoreDirs.has(entry.name)) getAllFiles(fullPath, seenReal, out);
			} else if (validExtensions.has(path.extname(fullPath))) {
				out.push(fullPath);
			}
			continue;
		}

		if (entry.isDirectory()) {
			if (!ignoreDirs.has(entry.name)) getAllFiles(fullPath, seenReal, out);
		} else if (entry.isFile() && validExtensions.has(path.extname(fullPath))) {
			out.push(fullPath);
		}
	}

	return out;
}

// Svelte/Vue/HTML: parse only <script> contents, but blank out everything else
// to *characters* (keeping every newline) so reported line numbers still match
// the original file.
function extractScript(content) {
	const regex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
	let out = "";
	let lastIndex = 0;
	let found = false;
	let match;
	while ((match = regex.exec(content))) {
		found = true;
		const innerStart = match.index + match[0].indexOf(match[1]);
		out += content.slice(lastIndex, innerStart).replace(/[^\n]/g, " ");
		out += match[1];
		lastIndex = innerStart + match[1].length;
	}
	if (!found) return null;
	out += content.slice(lastIndex).replace(/[^\n]/g, " ");
	return out;
}

// Inverse of extractScript: keeps the markup, blanks out <script> bodies.
// Used to catch usages that only appear in template bindings (on:click={fn}, {#each fn(x)}...).
function extractTemplate(content) {
	return content.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_, inner) => inner.replace(/[^\n]/g, " "));
}

const definitions = new Map(); // name -> [{file, line}]
const usageCounts = new Map(); // name -> total identifier occurrences project-wide

function recordDefinition(name, file, node, sourceFile) {
	if (name.length <= 2 || ignoreFunctions.has(name)) return;
	if (!definitions.has(name)) definitions.set(name, []);
	const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
	definitions.get(name).push({ file, line: line + 1 });
}

function isFunctionLike(node) {
	return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

// An object-literal member whose enclosing object literal is (at any nesting depth)
// itself a call/constructor argument is an SDK callback/options slot — the library
// invokes it structurally, not by name, so it can never look "used" via identifier
// lookup (e.g. `new Client({ onStarted() {...} })`, `streamText({ onChunk: ... })`).
function isCallbackObjectMember(node) {
	for (let current = node.parent; current; current = current.parent) {
		if (ts.isObjectLiteralExpression(current)) {
			const parent = current.parent;
			if ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.arguments?.includes(current)) {
				return true;
			}
		}
	}
	return false;
}

// `export { foo }` / `export { foo } from "./x"` reference foo's identifier in its
// own defining file without ever calling it — that's export plumbing, not a usage.
// Without this, every barrel-re-exported dead function looks "used" by its own barrel line.
function isExportSpecifierIdentifier(node) {
	const parent = node.parent;
	return !!parent && ts.isExportSpecifier(parent) && (parent.name === node || parent.propertyName === node);
}

function walk(node, sourceFile, file, scopeStack) {
	if (ts.isIdentifier(node) && !scopeStack.includes(node.text) && !isExportSpecifierIdentifier(node)) {
		usageCounts.set(node.text, (usageCounts.get(node.text) || 0) + 1);
	}

	let definedName = null;
	let nameNode = null;

	if (ts.isFunctionDeclaration(node) && node.name && node.body) {
		definedName = node.name.text;
		nameNode = node.name;
		recordDefinition(definedName, file, node.name, sourceFile);
	} else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isFunctionLike(node.initializer)) {
		definedName = node.name.text;
		nameNode = node.name;
		recordDefinition(definedName, file, node.name, sourceFile);
	} else if (
		(ts.isMethodDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)) &&
		ts.isIdentifier(node.name) &&
		node.body &&
		!isCallbackObjectMember(node)
	) {
		definedName = node.name.text;
		nameNode = node.name;
		recordDefinition(definedName, file, node.name, sourceFile);
	} else if (
		ts.isPropertyAssignment(node) &&
		ts.isIdentifier(node.name) &&
		isFunctionLike(node.initializer) &&
		!isCallbackObjectMember(node)
	) {
		definedName = node.name.text;
		nameNode = node.name;
		recordDefinition(definedName, file, node.name, sourceFile);
	} else if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isFunctionLike(node.initializer)) {
		// class field arrow/function, e.g. `class X { onClick = () => {} }`
		definedName = node.name.text;
		nameNode = node.name;
		recordDefinition(definedName, file, node.name, sourceFile);
	}

	// ponytail: strips direct self-recursion only, not mutual-recursion clusters
	// (A calls B, B calls A, neither called externally) — those still read as "used".
	// Upgrade path: build a real call graph and flag unreached strongly-connected components.
	// The name node itself must walk with the OLD stack — it's the declaration site, whose
	// own occurrence backs the `total <= occurrences.length` dead check, not a body usage.
	// Only body/param children get nextStack, to strip recursive self-calls inside the body.
	const nextStack = definedName ? [...scopeStack, definedName] : scopeStack;
	ts.forEachChild(node, (child) => walk(child, sourceFile, file, child === nameNode ? scopeStack : nextStack));
}

console.log(`Scanning directory: ${targetDir}`);
const files = getAllFiles(targetDir);
console.log(`Found ${files.length} valid source files. Parsing...`);

const templates = []; // {file, text} — markup portion of .svelte/.vue/.html files, checked in pass 2

let parsedCount = 0;
for (const file of files) {
	let content;
	try {
		content = fs.readFileSync(file, "utf-8");
	} catch {
		continue; // unreadable file
	}

	const ext = path.extname(file);
	let sourceText = content;
	let scriptKind = directExtensions.get(ext);

	if (markupExtensions.has(ext)) {
		const extracted = extractScript(content);
		templates.push({ file, text: extractTemplate(content) });
		if (extracted === null) continue; // no <script> block, nothing to analyze
		sourceText = extracted;
		scriptKind = ts.ScriptKind.TS;
	}

	let sourceFile;
	try {
		sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
	} catch {
		continue; // unparseable file, skip rather than crash the whole scan
	}

	walk(sourceFile, sourceFile, file, []);
	parsedCount++;
	if (parsedCount % 50 === 0) process.stdout.write(".");
}

// Pass 2: template markup isn't real JS, so it wasn't AST-walked above — but
// bindings like on:click={handler} or {#each items as x}{fn(x)}{/each} are real
// usages. Word-boundary scan the blanked-script markup text for definition names.
for (const { text } of templates) {
	for (const name of definitions.keys()) {
		if (!text.includes(name)) continue;
		const matches = text.match(new RegExp(`\\b${name}\\b`, "g"));
		if (matches) usageCounts.set(name, (usageCounts.get(name) || 0) + matches.length);
	}
}

console.log(`\n\nCross-referencing ${definitions.size} unique names against usage...`);

const deadFunctions = [];
for (const [name, occurrences] of definitions.entries()) {
	const total = usageCounts.get(name) || 0;
	// Only the declaration sites themselves were seen => never called/referenced.
	if (total <= occurrences.length) {
		deadFunctions.push({ name, definitions: occurrences });
	}
}

console.log("\n================ POTENTIAL DEAD FUNCTIONS ================");
deadFunctions.forEach((df) => {
	console.log(`\nƒ ${df.name}()`);
	df.definitions.forEach((def) => {
		console.log(`  -> ${path.relative(targetDir, def.file)}:${def.line}`);
	});
});
console.log(`\nTotal potential dead functions found: ${deadFunctions.length}`);
console.log("==========================================================\n");
console.log(
	"Note: name-based, not import-resolved — a dead function sharing a name with a live one elsewhere won't be flagged, and default-export re-imports under a new local name won't be linked. Cross-check hits before deleting.",
);

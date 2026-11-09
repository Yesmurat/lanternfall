#!/usr/bin/env node
// Applies the Lanternfall house style to every JS file in the repo.
//
//   npm run format              # rewrite the files in place
//   npm run format -- --check   # report what would change, touch nothing
//
// ESLint (.eslintrc.json) carries the parts it can express: tab indentation,
// braces on every control statement, `else`/`catch` on their own line, and no
// padding inside plain blocks. The passes below add the three parts no stock
// rule produces:
//
//   1. switch cases wrapped in their own block
//   2. a blank line just inside every function, class, try and case body
//   3. `=` aligned down runs of consecutive assignments
//
// Passes 2 and 3 only ever insert whitespace. Pass 1 inserts braces. Nothing
// here may alter a token otherwise, and verify() re-tokenises each file to
// prove it: the only permitted difference is an inserted `{`, `}` or `;`.

import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import * as espree from 'espree';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PARSE = { ecmaVersion: 'latest', sourceType: 'module', loc: true, range: true };

const files = execFileSync('git', ['ls-files', '*.js', '*.mjs', '*.cjs'], { cwd: ROOT, encoding: 'utf8' })
	.split('\n')
	.filter(f => f && !f.startsWith('dist/') && !f.startsWith('node_modules/'));

// ---------------------------------------------------------------- eslint

// .eslintrc.json omits `padded-blocks` so that `npm run lint` passes on the
// formatted output. The normalise stage adds it back as "never everywhere",
// stripping all padding so pass 2 can put it back only where the house style
// wants it. That ordering is what makes repeated runs idempotent.
const eslint = new ESLint({
	cwd: ROOT,
	fix: true,
	overrideConfig: {
		rules: {
			'padded-blocks': ['error', { blocks: 'never', classes: 'never', switches: 'never' }],
		},
	},
});

async function lintFix(code, file) {
	const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
	const fixed = result.output ?? code;
	const fatal = (result.messages || []).filter(m => m.fatal);
	if (fatal.length) {
		throw new Error(`${file}: ${fatal[0].message} (line ${fatal[0].line})`);
	}
	return fixed;
}

// --------------------------------------------- pass 0: statements after a brace

// Expanding `if (a) { if (b) c(); return d; }` leaves ESLint's `curly` fixer
// with `} return d;` — correct, but not one statement per line. A trailing
// `else`/`catch`/`finally`/`while`, a comment, or punctuation continuing an
// expression all legitimately follow a brace, so only a real statement is split
// off. The brace's own indent is reused, which puts the statement back at the
// depth it already had.
const BLOCK_BEARING = new Set([
	'IfStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement',
	'WhileStatement', 'DoWhileStatement', 'SwitchStatement', 'TryStatement',
]);

function splitAfterBrace(code) {
	const ast = espree.parse(code, PARSE);
	const lines = code.split('\n');
	const edits = [];

	// Only a statement that directly follows a sibling statement is split, so a
	// `}` that merely sits inside one larger statement — `import { x } from 'y'`
	// being the case that matters here — is left whole. A statement that now
	// carries a block is also pulled down, which is what rescues `r -= e[1];
	// if (r <= 0) { … }` after `curly` has braced the `if`. Two plain statements
	// sharing a line are left as the author wrote them.
	const scan = list => {
		for (let i = 1; i < list.length; i++) {
			const prev = list[i - 1];
			const cur = list[i];
			if (cur.loc.start.line !== prev.loc.end.line) continue;
			const afterBrace = code.slice(0, prev.range[1]).trimEnd().endsWith('}');
			if (!afterBrace && !BLOCK_BEARING.has(cur.type)) continue;
			const indent = lines[prev.loc.end.line - 1].match(/^[\t ]*/)[0];
			edits.push({ from: prev.range[1], to: cur.range[0], text: '\n' + indent });
		}
	};

	walk(ast, node => {
		if (node.type === 'Program' || node.type === 'BlockStatement' || node.type === 'StaticBlock') {
			scan(node.body);
		}
		else if (node.type === 'SwitchCase') {
			scan(node.consequent);
		}
	});

	edits.sort((a, b) => b.from - a.from);
	let out = code;
	for (const e of edits) {
		out = out.slice(0, e.from) + e.text + out.slice(e.to);
	}
	return out;
}

// ------------------------------------------------- pass 1: switch case blocks

// `case 'x': stmt; break;` becomes `case 'x': { stmt; break; }` so every case
// gets its own scope. Applied back to front, so earlier offsets stay valid.
function caseBlocks(code) {
	const ast = espree.parse(code, { ...PARSE, tokens: true });
	const edits = [];

	walk(ast, node => {
		if (node.type !== 'SwitchCase' || node.consequent.length === 0) return;
		if (node.consequent.length === 1 && node.consequent[0].type === 'BlockStatement') return;

		// the colon sits between the case's test (or the `default` keyword) and
		// its first statement, so search that gap rather than guessing a token
		const gapStart = node.test ? node.test.range[1] : node.range[0];
		const colon = code.indexOf(':', gapStart);
		const first = node.consequent[0];
		const last = node.consequent[node.consequent.length - 1];
		if (colon === -1 || colon > first.range[0]) return;

		// the body opens on its own line rather than trailing the `case`, and
		// `this.hiss(…); break;` becomes one statement per line
		edits.push({ from: colon + 1, to: first.range[0], text: ' {\n' });
		for (let i = 1; i < node.consequent.length; i++) {
			const prev = node.consequent[i - 1];
			const cur = node.consequent[i];
			if (cur.loc.start.line === prev.loc.end.line) {
				edits.push({ from: prev.range[1], to: cur.range[0], text: '\n' });
			}
		}
		edits.push({ from: last.range[1], to: last.range[1], text: '\n}' });
	});

	edits.sort((a, b) => b.from - a.from);
	let out = code;
	for (const e of edits) {
		out = out.slice(0, e.from) + e.text + out.slice(e.to);
	}
	return out;
}

// ------------------------------------------------------- pass 2: blank lines

// Three rules, all read off src/audio.js as the author spaced it:
//
//   a. a function, class, switch or case body is always padded inside
//   b. any other block is padded only when it holds a block of its own, so
//      `if (this.ctx) { if (…) {…} return true; }` opens up but a leaf guard
//      like `catch (e) { return false; }` stays tight
//   c. consecutive statements are parted by a blank line where control flow
//      begins or ends, and where a run of declarations meets statements that
//      are not declarations
//
// Everything is collected as 1-based line numbers first and the file is rebuilt
// once, so nesting cannot shift the positions out from under us.
const CONTROL = new Set([
	'IfStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement',
	'WhileStatement', 'DoWhileStatement', 'SwitchStatement', 'TryStatement',
	'FunctionDeclaration', 'ClassDeclaration',
]);

function spacing(code) {
	const ast = espree.parse(code, PARSE);
	const after = new Set();
	const before = new Set();

	const pad = node => {
		if (!node || node.loc.start.line === node.loc.end.line) return;
		const body = node.body || node.cases;
		if (Array.isArray(body) && body.length === 0) return;
		after.add(node.loc.start.line);
		before.add(node.loc.end.line);
	};

	const holdsBlock = block =>
		Array.isArray(block.body) &&
		block.body.some(s => CONTROL.has(s.type) || s.type === 'BlockStatement');

	const padNested = block => {
		if (block && block.type === 'BlockStatement' && holdsBlock(block)) {
			pad(block);
		}
	};

	const separate = list => {
		for (let i = 1; i < list.length; i++) {
			const a = list[i - 1];
			const b = list[i];
			const aDecl = a.type === 'VariableDeclaration';
			const bDecl = b.type === 'VariableDeclaration';
			if (CONTROL.has(a.type) || CONTROL.has(b.type) || aDecl !== bDecl) {
				before.add(b.loc.start.line);
			}
		}
	};

	walk(ast, node => {
		switch (node.type) {
			case 'FunctionDeclaration':
			case 'FunctionExpression':
			case 'ArrowFunctionExpression': {
				if (node.body.type === 'BlockStatement') {
					pad(node.body);
				}
				break;
			}
			case 'ClassBody': {
				pad(node);
				break;
			}
			case 'IfStatement': {
				padNested(node.consequent);
				padNested(node.alternate);
				break;
			}
			case 'ForStatement':
			case 'ForInStatement':
			case 'ForOfStatement':
			case 'WhileStatement':
			case 'DoWhileStatement': {
				padNested(node.body);
				break;
			}
			case 'TryStatement': {
				padNested(node.block);
				padNested(node.finalizer);
				break;
			}
			case 'CatchClause': {
				padNested(node.body);
				break;
			}
			case 'SwitchStatement': {
				pad(node);
				for (let i = 1; i < node.cases.length; i++) {
					before.add(node.cases[i].loc.start.line);
				}
				break;
			}
			case 'SwitchCase': {
				if (node.consequent.length === 1 && node.consequent[0].type === 'BlockStatement') {
					pad(node.consequent[0]);
				}
				break;
			}
			default:
				break;
		}

		if (node.type === 'Program' || node.type === 'BlockStatement' || node.type === 'StaticBlock') {
			separate(node.body);
		}
		else if (node.type === 'SwitchCase') {
			separate(node.consequent);
		}
	});

	const lines = code.split('\n');
	const blank = i => i < 0 || i >= lines.length || lines[i].trim() === '';
	const out = [];

	for (let i = 0; i < lines.length; i++) {
		const n = i + 1;
		// `else`, `catch` and `finally` each open with a blank line above them
		const standalone = /^[\t ]*(?:else\b|catch[\t ]*\(|finally\b)/.test(lines[i]);
		if ((before.has(n) || standalone) && !blank(i - 1) && out[out.length - 1] !== '') {
			out.push('');
		}
		out.push(lines[i]);
		if (after.has(n) && !blank(i + 1)) {
			out.push('');
		}
	}
	return out.join('\n');
}

// ----------------------------------------------- pass 3: align assignment runs

// An assignment this pass is willing to touch: a bare name, a property path or
// a single index on the left, a plain `=`, and anything at all on the right.
const ASSIGN = /^([\t ]*)((?:const|let|var)[\t ]+[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^[\]]*\])*)([\t ]*)=([\t ]*)([^=>].*)$/;

function alignAssignments(code) {
	const lines = code.split('\n');
	let i = 0;

	while (i < lines.length) {
		const first = lines[i].match(ASSIGN);
		if (!first) {
			i++;
			continue;
		}

		// a run is consecutive matching lines sharing one indent; a blank line,
		// a comment or anything else ends it, so groups align independently
		const indent = first[1];
		const run = [];
		let j = i;
		while (j < lines.length) {
			const m = lines[j].match(ASSIGN);
			if (!m || m[1] !== indent) break;
			run.push({ line: j, lhs: m[2], rhs: m[5] });
			j++;
		}

		if (run.length > 1) {
			const width = Math.max(...run.map(r => r.lhs.length));
			for (const r of run) {
				lines[r.line] = indent + r.lhs.padEnd(width) + ' = ' + r.rhs;
			}
		}
		i = j > i ? j : i + 1;
	}
	return lines.join('\n');
}

// ------------------------------------------------- pass 4: leftover continuations

// ESLint's `indent` rule does not govern the continuation lines of a multi-line
// binary expression, so a few are left on their original two-space units. Those
// units map one-for-one onto tabs, which keeps each continuation exactly one
// level deeper than the statement it belongs to. Lines inside a multi-line
// template literal or block comment are content, not indentation, so they are
// left strictly alone.
function tabify(code) {
	const comments = [];
	const ast = espree.parse(code, { ...PARSE, comment: true });
	const protected_ = new Set();

	const protectInterior = node => {
		for (let n = node.loc.start.line + 1; n <= node.loc.end.line; n++) {
			protected_.add(n);
		}
	};

	walk(ast, node => {
		if (node.type === 'TemplateLiteral' && node.loc.start.line !== node.loc.end.line) {
			protectInterior(node);
		}
	});
	for (const c of ast.comments || comments) {
		if (c.type === 'Block' && c.loc.start.line !== c.loc.end.line) {
			protectInterior(c);
		}
	}

	return code
		.split('\n')
		.map((line, i) => {
			if (protected_.has(i + 1)) return line;
			const lead = line.match(/^[\t ]*/)[0];
			if (lead.length === 0 || lead.includes('\t')) return line;
			const tabs = '\t'.repeat(Math.floor(lead.length / 2));
			return tabs + ' '.repeat(lead.length % 2) + line.slice(lead.length);
		})
		.join('\n');
}

// ------------------------------------------------- pass 5: one blank line max

// Padding a body that already had a blank line around it leaves two or three in
// a row, which is how `}` and the next function ended up three lines apart.
// Blank lines inside a multi-line template literal are string content and are
// never touched.
function collapseBlankRuns(code) {
	const ast = espree.parse(code, PARSE);
	const inString = new Set();

	walk(ast, node => {
		if (node.type !== 'TemplateLiteral' || node.loc.start.line === node.loc.end.line) return;
		for (let n = node.loc.start.line; n <= node.loc.end.line; n++) {
			inString.add(n);
		}
	});

	const lines = code.split('\n');
	const out = [];
	for (let i = 0; i < lines.length; i++) {
		const isBlank = lines[i].trim() === '';
		const prevBlank = out.length > 0 && out[out.length - 1].trim() === '';
		if (isBlank && prevBlank && !inString.has(i + 1)) continue;
		out.push(lines[i]);
	}
	return out.join('\n');
}

// ---------------------------------------------------------------- plumbing

function walk(node, visit) {
	if (!node || typeof node.type !== 'string') return;
	visit(node);
	for (const key of Object.keys(node)) {
		if (key === 'loc' || key === 'range' || key === 'parent') continue;
		const child = node[key];
		if (Array.isArray(child)) {
			for (const c of child) walk(c, visit);
		}
		else if (child && typeof child.type === 'string') {
			walk(child, visit);
		}
	}
}

// Proves a rewrite changed no code: the token streams must match except for
// inserted `{`, `}` or `;`. Anything else means a pass corrupted the file.
const INSERTABLE = new Set(['{', '}', ';']);

function verify(before, after, file) {
	const a = espree.tokenize(before, PARSE);
	const b = espree.tokenize(after, PARSE);
	const inserted = [];
	let i = 0;
	let j = 0;

	while (i < a.length && j < b.length) {
		if (a[i].type === b[j].type && a[i].value === b[j].value) {
			i++;
			j++;
		}
		else if (b[j].type === 'Punctuator' && INSERTABLE.has(b[j].value)) {
			inserted.push(b[j].value);
			j++;
		}
		else {
			throw new Error(
				`${file}: token stream diverged — expected ${a[i].type} "${a[i].value}" ` +
				`but found ${b[j].type} "${b[j].value}"`
			);
		}
	}
	while (j < b.length && b[j].type === 'Punctuator' && INSERTABLE.has(b[j].value)) {
		inserted.push(b[j].value);
		j++;
	}
	if (i < a.length || j < b.length) {
		throw new Error(`${file}: token stream length diverged (${a.length} before, ${b.length} after)`);
	}
	return inserted.length;
}

// ---------------------------------------------------------------- main

const check = process.argv.includes('--check');
let changed = 0;

for (const file of files) {
	const abs = path.join(ROOT, file);
	const original = await readFile(abs, 'utf8');

	let out = await lintFix(original, file);
	out = splitAfterBrace(out);
	out = caseBlocks(out);
	out = await lintFix(out, file);      // re-indent around the new case blocks
	out = tabify(out);
	out = spacing(out);
	out = alignAssignments(out);
	out = collapseBlankRuns(out);
	if (!out.endsWith('\n')) out += '\n';

	const inserted = verify(original, out, file);

	if (out === original) {
		console.log(`  ok      ${file}`);
		continue;
	}
	changed++;
	const note = inserted ? ` (+${inserted} brace/semi tokens)` : '';
	if (check) {
		console.log(`  differs ${file}${note}`);
	}
	else {
		await writeFile(abs, out, 'utf8');
		console.log(`  wrote   ${file}${note}`);
	}
}

console.log(
	check
		? `\n${changed} of ${files.length} file(s) would change.`
		: `\n${changed} of ${files.length} file(s) rewritten.`
);
if (check && changed) process.exitCode = 1;

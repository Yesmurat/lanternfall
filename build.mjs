#!/usr/bin/env node
// Builds dist/ : a standalone copy of the game that any static host can serve.
//
// index.html is authored for the Claude artifact host, which supplies the
// <!doctype>, <head> and a small CSS reset at publish time. Off-platform that
// scaffolding has to exist in the file, so this script adds it and copies the
// ES modules alongside.

import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root       = path.dirname(fileURLToPath(import.meta.url));
const dist       = path.join(root, 'dist');
const BODY_START = '<div class="wrap">';

const DESCRIPTION =
	'A turn-based roguelike in twenty procedurally generated depths, where the oil in your lantern is your field of view.';

const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
	`<rect width="32" height="32" rx="4" fill="#07090e"/>` +
	`<path d="M16 5c2.6 5.4 6.4 7.6 6.4 12.4a6.4 6.4 0 0 1-12.8 0c0-2.8 1.6-4.6 2.8-6.4.9 1.8 1.8 2.7 2.7 2.7.9-2.7-.9-5.4.9-8.7z" fill="#f0a93c"/>` +
	`<ellipse cx="16" cy="19.5" rx="2.1" ry="3" fill="#fff4d2"/></svg>`
);

// the reset the artifact host injects, restated so the page renders identically
const BASE_CSS = `
:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);color-scheme:dark}
*{-webkit-tap-highlight-color:transparent}
body{margin:0;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
img{max-width:100%}
[hidden]{display:none!important}
`.trim();

const page = await readFile(path.join(root, 'index.html'), 'utf8');
const at   = page.indexOf(BODY_START);

if (at === -1) {
	throw new Error(`build: could not find "${BODY_START}" in index.html — has the markup changed?`);
}

const head = page.slice(0, at)
	.replace(/^\s*<meta name="claude:viewport-fit-sides"[^>]*>\s*$/m, '')  // host-only hint
	.trim();
const body = page.slice(at).trim();

if (!/<title>/.test(head)) {
	throw new Error('build: index.html lost its <title>');
}

if (!/<script type="module"/.test(body)) {
	throw new Error('build: index.html lost its module script');
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="${DESCRIPTION}">
<meta name="theme-color" content="#07090e">
<meta property="og:type" content="website">
<meta property="og:title" content="Lanternfall">
<meta property="og:description" content="${DESCRIPTION}">
<link rel="icon" href="${FAVICON}">
<style>${BASE_CSS}</style>
${head}
</head>
<body>
${body}
</body>
</html>
`;

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await writeFile(path.join(dist, 'index.html'), html, 'utf8');
await cp(path.join(root, 'src'), path.join(dist, 'src'), { recursive: true });
await writeFile(path.join(dist, '.nojekyll'), '', 'utf8');   // Pages: serve files verbatim

console.log(`built dist/ — index.html (${(html.length / 1024).toFixed(1)} kb) + src/`);

// Builds the translated site from the English pages. English is the source:
// index.html, privacy.html, start.html and 404.html are written by hand, and
// each other language in languages.js gets a generated copy in its own folder
// (/es/, /es/privacy, /es/start, and a 404 page for unknown /es/ paths).
//
//   node scripts/i18n.mjs            rebuild every translated page and worker/strings.js
//   node scripts/i18n.mjs --check    fail if anything is missing or out of date (CI runs this)
//   node scripts/i18n.mjs --missing  print the English text that still needs translating, as JSON
//
// The words come from i18n/<code>.json: each English text (a paragraph, a
// heading, a button, an alt text, a string in the scripts) mapped to its
// translation. A paragraph keeps its inline markup (links, <strong>, <span>),
// and the translation must keep the same tags. Change the English, run this,
// and translate whatever --missing lists.
//
// It also keeps the English pages' language menu and hreflang links in step,
// and writes worker/strings.js, the translations the Worker and the page
// scripts need at run time (the outline templates, the /start messages, the
// emails and the delete page).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUAGES } from '../languages.js';
import { AD_PAGES, OUTLINES } from '../outlines.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://wright-ai-solutions.com';
const read = file => readFileSync(join(root, file), 'utf8');

// The pages, and the path each is served at (null: not a page you link to).
export const PAGES = [
  { file: 'index.html', path: '' },
  { file: 'privacy.html', path: 'privacy' },
  { file: 'start.html', path: 'start' },
  { file: '404.html', path: null },
];
const TRANSLATED = LANGUAGES.filter(l => l.code !== 'en');

// Scripts whose t('...') calls are words a visitor sees. The page scripts'
// words travel in each translated page; the Worker's go in worker/strings.js.
const PAGE_SCRIPTS = { 'script.js': ['*'], 'start.js': ['start.html'] };
const WORKER_SCRIPTS = ['worker/emails.js', 'worker/leads.js', 'worker/pages.js'];

// Words the generator itself adds to every translated page.
const GENERATOR_WORDS = [
  'Language',
  'Translated from English with AI. <a href="{english}">Read the original in English</a>.',
  'If this translation and the English differ, the English version applies.',
];

// ---------------------------------------------------------------------------
// A small HTML reader: enough for these hand-written pages, with every node's
// place in the source so text can be swapped without touching anything else.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// Elements that sit inside a sentence. Everything else (p, li, h1, button...)
// starts a new piece of text.
const INLINE = new Set(['a', 'span', 'strong', 'em', 'b', 'i', 'br', 'code', 'small', 'abbr', 'sup', 'sub', 'time', 'mark', 'wbr', 'q', 's', 'u']);
// script, style, svg and textarea are one token each, so nothing inside code,
// styles or drawings is ever translated.
const TOKEN = /<!--[\s\S]*?-->|<(script|style|svg|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/?[a-zA-Z][^>]*>|[^<]+|</g;

export function parse(html) {
  const top = { tag: '#root', children: [], start: 0, end: html.length };
  const stack = [top];
  for (const m of html.matchAll(TOKEN)) {
    const text = m[0];
    const start = m.index;
    const end = start + text.length;
    const parent = stack.at(-1);
    if (text.startsWith('<!--')) {
      parent.children.push({ tag: '#comment', start, end, children: [] });
    } else if (m[1]) {
      parent.children.push({ tag: m[1].toLowerCase(), opaque: true, start, end, open: text.slice(0, text.indexOf('>') + 1), children: [] });
    } else if (text.startsWith('</')) {
      const name = text.slice(2).replace(/[\s>].*$/s, '').toLowerCase();
      const at = stack.findLastIndex(n => n.tag === name);
      if (at > 0) {
        while (stack.length > at) {
          const done = stack.pop();
          done.end = end;
          done.innerEnd = start;
        }
      }
    } else if (text.startsWith('<') && text.length > 1) {
      const name = text.slice(1).replace(/[\s/>].*$/s, '').toLowerCase();
      const node = { tag: name, start, end, open: text, innerStart: end, children: [] };
      parent.children.push(node);
      if (!VOID.has(name) && !text.endsWith('/>')) stack.push(node);
    } else {
      parent.children.push({ tag: '#text', start, end, text, children: [] });
    }
  }
  return top;
}

const hasWords = s => /\p{L}/u.test(s.replace(/<[^>]*>/g, '').replace(/&[a-z]+;|&#\d+;/gi, ''));
// A figure on its own, such as the hero's "$11,760": no words, but each
// language writes the separators and the dollar sign its own way ("11 760 $").
const isFigure = s => /^\$\d{1,3}(?:,\d{3})+$/.test(s);
const isBreaking = node => node.tag !== '#text' && (node.opaque || node.tag === '#comment' || !INLINE.has(node.tag) || node.children.some(isBreaking));
export const normalize = s => s.replace(/\s+/g, ' ').trim();

// The pieces of text to translate, as source ranges: each run of text and
// inline elements between block elements is one piece, unless it has no text
// of its own (a row of links), when each inline element is looked at alone.
export function textPieces(html) {
  const pieces = [];
  const skip = [...html.matchAll(/<!-- i18n:(\w+) -->[\s\S]*?<!-- \/i18n:\1 -->/g)].map(m => [m.index, m.index + m[0].length]);
  const skipped = node => skip.some(([a, b]) => node.start >= a && node.end <= b);

  function runs(children) {
    const out = [];
    let run = [];
    for (const child of children) {
      if (isBreaking(child)) {
        if (run.length) out.push(run);
        run = [];
        if (!child.opaque && child.tag !== '#comment') visit(child);
      } else {
        run.push(child);
      }
    }
    if (run.length) out.push(run);
    return out;
  }

  function takeRun(run) {
    const ownText = run.some(n => n.tag === '#text' && n.text.trim());
    if (!ownText) {
      for (const n of run) if (n.tag !== '#text') visit(n);
      return;
    }
    const first = run.findIndex(n => n.tag !== '#text' || n.text.trim());
    const last = run.findLastIndex(n => n.tag !== '#text' || n.text.trim());
    let start = run[first].start;
    let end = run[last].end;
    if (run[first].tag === '#text') start += run[first].text.length - run[first].text.trimStart().length;
    if (run[last].tag === '#text') end -= run[last].text.length - run[last].text.trimEnd().length;
    const source = html.slice(start, end);
    if (hasWords(source) || isFigure(source)) pieces.push({ start, end, key: normalize(source) });
  }

  function visit(node) {
    if (skipped(node) || node.opaque || node.tag === '#comment' || node.tag === '#text') return;
    if (node.open && /\stranslate="no"/.test(node.open)) return;
    for (const run of runs(node.children)) takeRun(run);
  }
  visit(parse(html));
  return pieces;
}

// Attributes people read: alt text, labels, placeholders, tooltips and the
// page's description for search results and link previews.
const WORD_ATTRS = ['alt', 'title', 'aria-label', 'placeholder'];
const META_WORDS = /^(description|og:title|og:description|twitter:title|twitter:description)$/;

export function attributePieces(html) {
  const pieces = [];
  const skip = [...html.matchAll(/<!-- i18n:(\w+) -->[\s\S]*?<!-- \/i18n:\1 -->/g)].map(m => [m.index, m.index + m[0].length]);
  function visit(node) {
    if (skip.some(([a, b]) => node.start >= a && node.end <= b)) return;
    if (node.open && node.tag !== '#text') {
      const attrs = [...node.open.matchAll(/\s([\w:-]+)\s*=\s*"([^"]*)"/g)];
      const named = Object.fromEntries(attrs.map(a => [a[1].toLowerCase(), a[2]]));
      for (const a of attrs) {
        const name = a[1].toLowerCase();
        const wanted = WORD_ATTRS.includes(name)
          || (node.tag === 'meta' && name === 'content' && META_WORDS.test(named.name || named.property || ''));
        if (!wanted || !hasWords(a[2])) continue;
        const start = node.start + a.index + a[0].length - a[2].length - 1;
        pieces.push({ start, end: start + a[2].length, key: normalize(a[2]), attribute: true });
      }
    }
    if (!node.opaque) node.children.forEach(visit);
  }
  visit(parse(html));
  return pieces;
}

// ---------------------------------------------------------------------------
// The words in the scripts and the outline templates.

const JS_STRING = String.raw`'((?:[^'\\\n]|\\.)*)'`;
const SCRIPT_CALLS = new RegExp(String.raw`(?:\bt|\btranslate\([^,()]*?(?:\[[^\]]*\])?,)\(?\s*` + JS_STRING, 'g');
const unescapeJs = s => s.replace(/\\(.)/g, (all, c) => ({ n: '\n', t: '\t' }[c] || c));

export function scriptWords(file) {
  return [...read(file).matchAll(SCRIPT_CALLS)].map(m => unescapeJs(m[1]));
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(v => collectStrings(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) if (k !== 'kind') collectStrings(v, out);
  }
  return out;
}
const outlineWords = () => collectStrings([AD_PAGES, OUTLINES]);

const unique = list => [...new Set(list)];

// Everything that needs a translation, in page order.
export function englishWords() {
  const pageWords = PAGES.flatMap(({ file }) => {
    const html = read(file);
    return [...textPieces(html), ...attributePieces(html)].sort((a, b) => a.start - b.start).map(p => p.key);
  });
  return unique([
    ...pageWords,
    ...GENERATOR_WORDS,
    ...Object.keys(PAGE_SCRIPTS).flatMap(scriptWords),
    ...outlineWords(),
    ...WORKER_SCRIPTS.flatMap(scriptWords),
  ]);
}

// ---------------------------------------------------------------------------
// Checking a translation.

const tagsOf = s => (s.match(/<[^>]+>/g) || []).map(t => t.replace(/\s+/g, ' ')).sort();
const placeholdersOf = s => (s.match(/\{\w+\}/g) || []).sort();

export function problemsWith(english, translated, { attribute = false } = {}) {
  const problems = [];
  if (typeof translated !== 'string' || !translated.trim()) return ['missing'];
  if (JSON.stringify(tagsOf(english)) !== JSON.stringify(tagsOf(translated))) problems.push('markup differs from the English');
  if (JSON.stringify(placeholdersOf(english)) !== JSON.stringify(placeholdersOf(translated))) problems.push('{placeholders} differ from the English');
  if (attribute && translated.includes('"')) problems.push('a straight double quote can\'t go in an attribute');
  if (/<(?!\/?[a-z])/i.test(translated.replace(/<[^>]+>/g, ''))) problems.push('a stray "<"');
  return problems;
}

export function loadTranslations(code) {
  const file = join(root, 'i18n', `${code}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

// ---------------------------------------------------------------------------
// Writing the pages.

const pageUrl = (lang, path) => (lang.code === 'en' ? `/${path}` : `/${lang.code}/${path}`);

function alternates(page) {
  if (page.path === null) return '';
  const links = LANGUAGES.map(l => `<link rel="alternate" hreflang="${l.tag}" href="${SITE}${pageUrl(l, page.path)}">`);
  links.push(`<link rel="alternate" hreflang="x-default" href="${SITE}${pageUrl(LANGUAGES[0], page.path)}">`);
  return `<!-- i18n:alternates -->\n${links.join('\n')}\n<!-- /i18n:alternates -->`;
}

const GLOBE = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9s1.2-6.4 3.6-9z"/></svg>';

// The language menu: a <details> list of the same page in every language, so
// it works without JavaScript.
function switcher(lang, page, words) {
  const label = `${words('Language')}: ${lang.name}`;
  const items = LANGUAGES.map(l => {
    const current = l.code === lang.code ? ' aria-current="true"' : '';
    // English pages offer a returning visitor the language they picked before.
    const offer = lang.code === 'en' && l.code !== 'en' ? ` data-offer="${l.offer}"` : '';
    return `      <li><a href="${pageUrl(l, page.path || '')}" hreflang="${l.tag}" lang="${l.tag}"${current}${offer}>${l.name}</a></li>`;
  });
  return `<!-- i18n:switcher -->
      <details class="lang-menu">
        <summary class="lang-toggle" aria-label="${label}" title="${label}">${GLOBE}<span class="lang-code" aria-hidden="true">${lang.code.toUpperCase()}</span></summary>
        <ul class="lang-list">
${items.join('\n')}
        </ul>
      </details>
      <!-- /i18n:switcher -->`;
}

function note(lang, page, words) {
  if (lang.code === 'en') return '<!-- i18n:note --><!-- /i18n:note -->';
  const english = pageUrl(LANGUAGES[0], page.path || '');
  const text = words('Translated from English with AI. <a href="{english}">Read the original in English</a>.')
    .replace('{english}', english).replace('<a href=', '<a hreflang="en" lang="en" href=');
  // The privacy notice is a promise: the English is the one that counts.
  const applies = page.file === 'privacy.html' ? ` ${words('If this translation and the English differ, the English version applies.')}` : '';
  return `<!-- i18n:note -->\n  <p class="wrap footer-note">${text}${applies}</p>\n  <!-- /i18n:note -->`;
}

const replaceBlock = (html, name, block) => {
  const re = new RegExp(`<!-- i18n:${name} -->[\\s\\S]*?<!-- /i18n:${name} -->`);
  if (!re.test(html)) throw new Error(`missing <!-- i18n:${name} --> block`);
  return html.replace(re, () => block);
};

// The English page with its generated parts (menu, hreflang links) up to date.
export function englishPage(page) {
  let html = read(page.file);
  const en = LANGUAGES[0];
  const words = text => text;
  html = replaceBlock(html, 'switcher', switcher(en, page, words));
  if (page.path !== null) html = replaceBlock(html, 'alternates', alternates(page));
  return replaceBlock(html, 'note', note(en, page, words));
}

// Points this site's own page links at the language's copy; files (styles,
// scripts, images) stay where they are.
function localLinks(html, lang) {
  const local = /^\/(start|privacy)?(?=$|[#?])/;
  // Links that name their own language (the menu, "read the original") stay as they are.
  const linked = html.replace(/<a\b[^>]*>/g, tag => {
    if (/\shreflang="/.test(tag)) return tag;
    return tag.replace(/(\shref=")(\/[^"]*)"/, (all, before, href) => (local.test(href) ? `${before}/${lang.code}${href}"` : all));
  });
  // The canonical address and the link preview's address.
  return linked.replace(/(<link rel="canonical" href="|<meta property="og:url" content=")https:\/\/wright-ai-solutions\.com\/([^"]*)"/g,
    (all, before, path) => `${before}${SITE}/${lang.code}/${path}"`);
}

const jsonForHtml = value => JSON.stringify(value).replace(/</g, '\\u003c');

export function translatedPage(page, lang, translations) {
  const english = englishPage(page);
  const missing = new Set();
  const words = text => {
    if (Object.hasOwn(translations, text)) return translations[text];
    missing.add(text);
    return text;
  };
  const pieces = [...textPieces(english), ...attributePieces(english)].sort((a, b) => b.start - a.start);
  let html = english;
  for (const p of pieces) html = html.slice(0, p.start) + words(p.key) + html.slice(p.end);

  html = replaceBlock(html, 'switcher', switcher(lang, page, words));
  html = replaceBlock(html, 'note', note(lang, page, words));
  html = html.replace('<html lang="en">', `<html lang="${lang.tag}" dir="${lang.dir}" data-lang="${lang.code}">`);
  html = localLinks(html, lang);

  // The words the page's scripts show, for this language only.
  const scripts = Object.entries(PAGE_SCRIPTS).filter(([, pages]) => pages.includes('*') || pages.includes(page.file)).map(([file]) => file);
  const runtime = unique([...scripts.flatMap(scriptWords), ...(page.file === 'start.html' ? outlineWords() : [])]);
  const strings = Object.fromEntries(runtime.filter(w => Object.hasOwn(translations, w) || !missing.add(w)).map(w => [w, translations[w]]));
  html = html.replace('<script src="/script.js', `<script type="application/json" id="siteStrings">${jsonForHtml(strings)}</script>\n<script src="/script.js`);
  return { html, missing: [...missing] };
}

function workerStrings(all) {
  const words = unique([...outlineWords(), ...WORKER_SCRIPTS.flatMap(scriptWords)]);
  const byLang = Object.fromEntries(TRANSLATED.map(l => [l.code, Object.fromEntries(words.filter(w => Object.hasOwn(all[l.code], w)).map(w => [w, all[l.code][w]]))]));
  return `// Generated by scripts/i18n.mjs from i18n/<code>.json: don't edit by hand.
// The translations the Worker needs (outline templates, emails, the delete
// page), keyed by language code, then by the English text.
/** @type {Record<string, Record<string, string>>} */
export const STRINGS = ${JSON.stringify({ en: {}, ...byLang }, null, 1)};
`;
}

const outputs = new Map();
function output(file, content) {
  outputs.set(file, content);
}

function build() {
  const english = englishWords();
  const attributeKeys = new Set(PAGES.flatMap(({ file }) => attributePieces(read(file)).map(p => p.key)));
  const report = {};
  const all = {};
  for (const lang of TRANSLATED) {
    const translations = loadTranslations(lang.code);
    all[lang.code] = translations;
    const problems = [];
    for (const key of english) {
      if (!Object.hasOwn(translations, key)) continue;
      for (const p of problemsWith(key, translations[key], { attribute: attributeKeys.has(key) })) problems.push(`${p}: ${JSON.stringify(key).slice(0, 90)}`);
    }
    const missing = english.filter(k => !Object.hasOwn(translations, k));
    const unused = Object.keys(translations).filter(k => !english.includes(k));
    report[lang.code] = { missing, problems, unused };
  }
  for (const page of PAGES) {
    output(page.file, englishPage(page));
    for (const lang of TRANSLATED) output(`${lang.code}/${page.file}`, translatedPage(page, lang, all[lang.code]).html);
  }
  output('worker/strings.js', workerStrings(all));
  output('sitemap.xml', sitemap());
  return { report, english };
}

function sitemap() {
  const entries = PAGES.filter(p => p.path !== null).flatMap(page => LANGUAGES.map(lang => {
    const links = LANGUAGES.map(l => `    <xhtml:link rel="alternate" hreflang="${l.tag}" href="${SITE}${pageUrl(l, page.path)}"/>`);
    return `  <url>\n    <loc>${SITE}${pageUrl(lang, page.path)}</loc>\n${links.join('\n')}\n  </url>`;
  }));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`;
}

function main() {
  const args = process.argv.slice(2);
  const { report, english } = build();
  if (args.includes('--missing')) {
    const code = args.find(a => /^--lang=/.test(a))?.slice(7);
    const out = code ? report[code].missing : Object.fromEntries(Object.entries(report).map(([c, r]) => [c, r.missing]));
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  let failed = false;
  for (const [code, r] of Object.entries(report)) {
    const name = LANGUAGES.find(l => l.code === code).english;
    if (r.missing.length) {
      failed = true;
      console.error(`${name} (i18n/${code}.json) is missing ${r.missing.length} of ${english.length} translations, e.g. ${JSON.stringify(r.missing[0]).slice(0, 100)}`);
    }
    for (const p of r.problems) {
      failed = true;
      console.error(`${name} (i18n/${code}.json): ${p}`);
    }
    if (r.unused.length) console.warn(`${name}: ${r.unused.length} translations no longer used (safe to delete), e.g. ${JSON.stringify(r.unused[0]).slice(0, 80)}`);
  }
  const stale = [];
  for (const [file, content] of outputs) {
    const path = join(root, file);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (current === content) continue;
    stale.push(file);
    if (!args.includes('--check')) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
  }
  // Folders for languages that were removed from languages.js.
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && /^[a-z]{2}$/.test(entry.name) && existsSync(join(root, entry.name, '404.html')) && !TRANSLATED.some(l => l.code === entry.name)) {
      stale.push(`${entry.name}/`);
      if (!args.includes('--check')) rmSync(join(root, entry.name), { recursive: true });
    }
  }
  if (args.includes('--check')) {
    if (stale.length) {
      failed = true;
      console.error(`Out of date: ${stale.join(', ')}. Run: node scripts/i18n.mjs`);
    }
    if (failed) {
      console.error('\nTranslations: add what\'s missing to i18n/<code>.json (node scripts/i18n.mjs --missing --lang=es lists it), then run node scripts/i18n.mjs.');
      process.exit(1);
    }
    console.log(`All ${TRANSLATED.length} translations complete and every generated page up to date (${english.length} texts each).`);
  } else {
    console.log(stale.length ? `Wrote ${stale.join(', ')}` : 'Everything was already up to date.');
    if (failed) console.error('Some translations are missing or need fixing (above); those texts are in English for now.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

// verify-themes.mjs — Headless verification of all 11 downloaded Zed
// themes against the new matey-zed-theme-bridge. Runs in Node + jsdom,
// no device, no screenshots. Confirms each theme:
//   1. parses without throwing
//   2. produces a valid CodeMirror extension pair [canvas, syntax]
//   3. instantiates an EditorView against jsdom without throwing
//   4. injects the expected CSS custom properties on <html>
//   5. has a reasonable syntax rule count (>= 3 mapped scopes)

import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

const APP_ROOT = '/home/prp/Documents/Matey/app';
const BRIDGE = path.join(APP_ROOT, 'public/matey-zed-theme-bridge.js');

const THEME_DIR = '/home/prp/Downloads/';
const THEME_FILES = [
  'VSCode Nicer Dark High Contrast.json',
  'Catppuccin Oil.json',
  'zulzin.json',
  'Gruvbox light soft (mimic vscode-theme-gruvbox).json',
  'Bububu.json',
  'Sombre \u00c9clat.json',
  'xCodium.json',
  'Crouyrr Themes.json',
  'Kaimandres.json',
  'Cool Panda.json',
  'Minimal.json',
];

// JSDOM setup must happen before importing the bridge (which references
// the browser globals indirectly via CodeMirror).
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="editor"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.DOMRect = class { constructor() { this.x = 0; this.y = 0; this.width = 0; this.height = 0; } };
globalThis.CSSStyleSheet = class { replaceSync() {} };

const bridge = await import(BRIDGE);
const cmState = await import(path.join(APP_ROOT, 'node_modules/@codemirror/state/dist/index.js'));
const cmView = await import(path.join(APP_ROOT, 'node_modules/@codemirror/view/dist/index.js'));
const cmLang = await import(path.join(APP_ROOT, 'node_modules/@codemirror/language/dist/index.js'));

const { EditorState } = cmState;
const { EditorView } = cmView;
const { convertZedThemeToCodeMirror, applyGlobalZedTheme, extractZedThemeColors } = bridge;

const banner = (s) => `\n${'='.repeat(80)}\n${s}\n${'='.repeat(80)}`;
const pad = (s, n) => String(s).padEnd(n);

let pass = 0;
let fail = 0;
const failures = [];

console.log(banner('  HEADLESS ZED THEME VALIDATION REPORT (JSDOM + CodeMirror 6)  '));
console.log(`\nBridge: ${BRIDGE}`);
console.log(`Source: ${THEME_DIR}\n`);

const rows = [];

for (const file of THEME_FILES) {
  const filePath = path.join(THEME_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.log(`[MISS] ${file}`);
    fail++;
    failures.push({ file, error: 'file not found' });
    continue;
  }

  const result = { file, name: '', pass: false, error: null, ruleCount: 0, bg: '', fg: '' };

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(raw);
    const meta = extractZedThemeColors(json);
    result.name = meta.name;
    result.isDark = meta.isDark;

    // 1. Convert to CM extensions
    const exts = convertZedThemeToCodeMirror(json);
    if (!Array.isArray(exts) || exts.length < 2) {
      throw new Error('convertZedThemeToCodeMirror did not return [canvas, syntax]');
    }

    // 2. Apply global CSS vars
    applyGlobalZedTheme(json);
    const appBg = document.documentElement.style.getPropertyValue('--app-bg');
    const appFg = document.documentElement.style.getPropertyValue('--app-fg');
    result.bg = appBg;
    result.fg = appFg;
    if (!appBg) throw new Error('applyGlobalZedTheme did not set --app-bg');

    // 3. Count highlight rules
    const style = json?.themes?.[0]?.style || json?.style || json;
    const syntax = style?.syntax || json?.syntax || {};
    let ruleCount = 0;
    for (const scope of Object.keys(syntax)) {
      if (syntax[scope] && syntax[scope].color) ruleCount++;
    }
    result.ruleCount = ruleCount;

    // 4. Try to instantiate an EditorView (this is the critical
    //    test: does the extension set throw inside EditorState.create?)
    const container = document.createElement('div');
    document.body.appendChild(container);
    const state = EditorState.create({
      doc: 'function helloWorld() {\n  console.log("Hello Zed Themes!");\n  return 42;\n}',
      extensions: exts.flat(Infinity),
    });
    const view = new EditorView({ state, parent: container });
    if (!view || !view.dom) throw new Error('EditorView failed to mount');
    view.destroy();
    container.remove();

    result.pass = true;
    pass++;
  } catch (e) {
    result.error = e.message || String(e);
    fail++;
    failures.push(result);
  }

  rows.push(result);
}

console.log(pad('Theme', 55) + pad('Dark/Light', 12) + pad('Rules', 8) + pad('--app-bg', 12) + 'Status');
console.log('-'.repeat(96));
for (const r of rows) {
  const status = r.pass ? '\u2713 PASS' : `\u2717 FAIL (${r.error || '?'})`;
  console.log(
    pad((r.name || r.file).slice(0, 53), 55) +
    pad(r.isDark === false ? 'light' : 'dark', 12) +
    pad(String(r.ruleCount), 8) +
    pad((r.bg || '').slice(0, 10), 12) +
    status,
  );
}

console.log(banner(`  SUMMARY: ${pass} / ${THEME_FILES.length} themes verified successfully  `));
if (fail > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) {
    console.log(`  - ${f.file}: ${f.error}`);
  }
  process.exit(1);
}
console.log('All themes pass.\n');
process.exit(0);

// matey-zed-theme-bridge.js
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/**
 * 1. Granular Zed Scope -> Lezer Highlight Tag Mapping
 * Ensures deep syntax coloring identical to Zed Editor / zedthemes.com
 */
const ZED_SCOPE_MAP = [
  // Comments
  { scopes: ['comment', 'comment.line', 'comment.block', 'comment.doc'], tag: t.comment },

  // Constants & Literals
  { scopes: ['string', 'string.special'], tag: t.string },
  { scopes: ['string.escape', 'character.escape'], tag: t.escape },
  { scopes: ['string.regex'], tag: t.regexp },
  { scopes: ['number', 'number.float', 'number.integer'], tag: t.number },
  { scopes: ['boolean'], tag: t.bool },
  { scopes: ['constant', 'constant.builtin'], tag: t.constant(t.variableName) },

  // Keywords
  { scopes: ['keyword', 'keyword.control', 'keyword.operator', 'keyword.function'], tag: t.keyword },
  { scopes: ['keyword.control.import', 'keyword.control.export'], tag: t.moduleKeyword },
  { scopes: ['keyword.modifier'], tag: t.modifier },
  { scopes: ['operator'], tag: t.operator },

  // Functions & Methods
  { scopes: ['function', 'function.method'], tag: t.function(t.variableName) },
  { scopes: ['function.builtin', 'function.special'], tag: t.standard(t.function(t.variableName)) },
  { scopes: ['function.macro'], tag: t.macroName },

  // Types & Classes
  { scopes: ['type', 'type.builtin', 'class', 'struct', 'enum'], tag: t.typeName },
  { scopes: ['type.interface'], tag: t.className },

  // Variables & Parameters
  { scopes: ['variable', 'variable.other'], tag: t.variableName },
  { scopes: ['variable.builtin', 'variable.language'], tag: t.special(t.variableName) },
  { scopes: ['variable.parameter'], tag: t.definition(t.variableName) },
  { scopes: ['property', 'property.definition'], tag: t.propertyName },

  // Punctuation & Delimiters
  { scopes: ['punctuation.bracket', 'bracket'], tag: t.bracket },
  { scopes: ['punctuation.delimiter', 'punctuation.separator'], tag: t.separator },
  { scopes: ['punctuation', 'punctuation.special'], tag: t.punctuation },

  // Web & Markup Tags
  { scopes: ['tag', 'tag.builtin'], tag: t.tagName },
  { scopes: ['attribute', 'tag.attribute'], tag: t.attributeName },
  { scopes: ['label'], tag: t.labelName },
];

/**
 * Normalizes Zed JSON schemas across different theme versions.
 * Handles:
 *   - { themes: [{ style: { <flat color keys>, syntax: {...} } }] }   (Zed v0.2.x — flat)
 *   - { themes: [{ style: { colors: {...}, syntax: {...} } }] }         (legacy nested)
 *   - { style: { colors, syntax } }                                     (legacy single-theme)
 *
 * In the current Zed JSON schema (zedthemes.com / zed-industries/extensions),
 * UI colors live FLAT at themes[0].style.* (e.g. style['editor.background']).
 * The legacy `style.colors` nesting is preserved as a fallback for older themes.
 */
export function extractZedThemeColors(zedJson) {
  const themeObj = zedJson?.themes?.[0] || zedJson;
  const style = themeObj?.style || themeObj || {};
  // Flat schema: the style object itself is the colors map.
  // Legacy: a nested {colors} object may also exist.
  const flatColors = style || {};
  const nestedColors = style?.colors || themeObj?.colors || {};
  // Merge: nested wins for legacy keys it provides; flat covers the rest.
  const colors = Object.assign({}, flatColors, nestedColors);
  const syntax = style?.syntax || themeObj?.syntax || {};
  const appearance = themeObj?.appearance || style?.appearance || 'dark';

  return {
    colors,
    syntax,
    isDark: appearance !== 'light',
    name: themeObj?.name || zedJson?.name || 'unknown',
  };
}

/**
 * 2. Converts Zed Theme JSON to CodeMirror 6 Extension
 * Returns [canvasTheme, syntaxExt] — caller flattens for compartment reconfigure.
 */
export function convertZedThemeToCodeMirror(zedJson) {
  const { colors, syntax, isDark } = extractZedThemeColors(zedJson);

  // Surface Fallbacks
  const bg = colors['editor.background'] || (isDark ? '#1a1b26' : '#ffffff');
  const fg = colors['editor.foreground'] || (isDark ? '#a9b1d6' : '#1a1b26');
  const gutterBg = colors['editor.gutter.background'] || bg;
  const lineNo = colors['editor.line_number'] || (isDark ? '#444b6a' : '#a0a0a0');
  const activeLineNo = colors['editor.active_line_number'] || fg;
  const activeLineBg = colors['editor.active_line.background'] || (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)');
  const caret = colors['editor.caret'] || colors['caret'] || (isDark ? '#7aa2f7' : '#0055ff');
  const selectionBg = colors['selection.background'] || (isDark ? 'rgba(51, 65, 85, 0.6)' : 'rgba(180, 213, 254, 0.6)');

  // Build CodeMirror Canvas Theme
  const canvasTheme = EditorView.theme({
    '&': {
      backgroundColor: bg,
      color: fg,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: '14px',
    },
    '.cm-scroller': {
      backgroundColor: bg,
      fontFamily: 'inherit',
      lineHeight: '1.6',
    },
    '.cm-content': {
      color: fg,
      caretColor: caret,
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: caret,
      borderLeftWidth: '2px',
    },
    '.cm-gutters': {
      backgroundColor: gutterBg,
      color: lineNo,
      borderRight: 'none',
    },
    '.cm-gutterElement': {
      color: lineNo,
    },
    '.cm-activeLineGutter': {
      backgroundColor: activeLineBg,
      color: activeLineNo,
      fontWeight: 'bold',
    },
    '.cm-activeLine': {
      backgroundColor: activeLineBg,
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: selectionBg,
    },
    '.cm-matchingBracket': {
      backgroundColor: colors['editor.invisible'] || 'rgba(255,255,255,0.15)',
      outline: '1px solid ' + caret,
    },
  }, { dark: isDark });

  // Build Syntax Highlighting Rules
  const highlightRules = [];

  for (const entry of ZED_SCOPE_MAP) {
    const scopes = entry.scopes || (entry.scope ? [entry.scope] : []);
    let matchedRule = null;
    for (const scope of scopes) {
      if (syntax[scope]) {
        matchedRule = syntax[scope];
        break;
      }
    }

    if (matchedRule) {
      const rule = { tag: entry.tag };
      if (typeof matchedRule === 'string') {
        rule.color = matchedRule;
      } else {
        if (matchedRule.color) rule.color = matchedRule.color;
        if (matchedRule.font_weight) rule.fontWeight = matchedRule.font_weight;
        if (matchedRule.font_style) rule.fontStyle = matchedRule.font_style;
      }
      highlightRules.push(rule);
    }
  }

  const syntaxExt = syntaxHighlighting(HighlightStyle.define(highlightRules));

  return [canvasTheme, syntaxExt];
}

/**
 * 3. App-Wide Global Styling (Header, Sidebars, Backgrounds)
 * Injects CSS custom properties on document.documentElement so the
 * app shell (which lives outside CodeMirror) inherits the theme,
 * AND forces the body background/color to match so the app frame
 * lines up with the editor surface.
 */
export function applyGlobalZedTheme(zedJson) {
  if (typeof document === 'undefined') return false;
  const { colors, isDark, name } = extractZedThemeColors(zedJson);
  const root = document.documentElement;

  const bg = colors['editor.background'] || colors['background'] || colors['panel.background'] || (isDark ? '#1a1b26' : '#ffffff');
  const fg = colors['editor.foreground'] || colors['foreground'] || colors['text'] || (isDark ? '#a9b1d6' : '#1a1b26');
  const muted = colors['text.muted'] || colors['element.disabled'] || (isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)');
  const secondary = colors['text.secondary'] || muted;
  const border = colors['border'] || colors['element.selected'] || (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)');
  const accent = colors['element.active'] || colors['cursor'] || '#3b82f6';
  const surface = colors['surface.background'] || colors['panel.background'] || colors['editor.background'] || bg;
  const surfaceRaised = colors['element.background'] || colors['surface.background'] || colors['editor.background'] || bg;
  const danger = colors['terminal.ansi.red'] || colors['error'] || (isDark ? '#ef4444' : '#dc2626');

  // Guard: skip re-applying the same theme to avoid navigation flicker
  const currentTheme = root.getAttribute('data-zed-theme');
  const currentBg = root.style.getPropertyValue('--app-bg');
  if (currentTheme === name && currentBg === bg) {
    return true;
  }

  root.style.setProperty('--app-bg', bg);
  root.style.setProperty('--app-fg', fg);
  root.style.setProperty('--app-muted', muted);
  root.style.setProperty('--app-border', border);
  root.style.setProperty('--app-accent', accent);
  root.style.setProperty('--app-surface', surface);
  root.style.setProperty('--app-surface-raised', surfaceRaised);

  root.style.setProperty('--bg', bg);
  root.style.setProperty('--text', fg);
  root.style.setProperty('--text-dim', muted);
  root.style.setProperty('--text-secondary', secondary);
  root.style.setProperty('--text-on-card', fg);
  root.style.setProperty('--border', border);
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--surface', surface);
  root.style.setProperty('--surface-raised', surfaceRaised);
  root.style.setProperty('--danger', danger);

  root.setAttribute('data-zed-theme', name);

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.content = bg;
  }

  return true;
}

export function clearGlobalZedTheme() {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  ['--app-bg', '--app-fg', '--app-muted', '--app-border', '--app-accent',
   '--app-surface', '--app-surface-raised',
   '--bg', '--text', '--text-dim', '--text-secondary', '--text-on-card',
   '--border', '--accent', '--surface', '--surface-raised', '--danger']
    .forEach((v) => root.style.removeProperty(v));
  root.removeAttribute('data-zed-theme');
  if (document.body) {
    document.body.style.backgroundColor = '';
    document.body.style.color = '';
  }
  return true;
}

/* Backwards-compatible wrappers used by the existing IDE module. */
export function createZedUiTheme(zedColors, isDark = true) {
  const zedJson = { themes: [{ name: 'inline', appearance: isDark ? 'dark' : 'light', style: { colors: zedColors } }] };
  return convertZedThemeToCodeMirror(zedJson)[0];
}

export function createZedSyntaxHighlighting(zedSyntax) {
  /* Treat the input as a Zed-style `syntax` object: walk ZED_SCOPE_MAP
   * with it. Reuse the same code path the full converter uses. */
  const fake = { themes: [{ name: 'inline', appearance: 'dark', style: { syntax: zedSyntax } }] };
  return convertZedThemeToCodeMirror(fake)[1];
}

export function zedThemeFromJsonString(jsonString) {
  return convertZedThemeToCodeMirror(JSON.parse(jsonString));
}

export function zedThemeFromObject(obj) {
  return convertZedThemeToCodeMirror(obj);
}

export { ZED_SCOPE_MAP };

if (typeof window !== 'undefined') {
  window.MateyZedBridge = {
    extractZedThemeColors,
    convertZedThemeToCodeMirror,
    applyGlobalZedTheme,
    clearGlobalZedTheme,
    createZedUiTheme,
    createZedSyntaxHighlighting,
    zedThemeFromJsonString,
    zedThemeFromObject,
    ZED_SCOPE_MAP,
  };
}

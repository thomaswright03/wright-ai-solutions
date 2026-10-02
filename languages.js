// The languages the site is published in, shared by the page scripts, the
// Worker and the page generator (scripts/i18n.mjs). English is the source:
// every other language is generated from the English pages and the
// translations in i18n/<code>.json. `code` is the URL folder (/es/start),
// `tag` the HTML lang and hreflang value, `name` the language in itself (for
// the switcher) and `english` its English name (for the AI prompt and Thomas).
export const LANGUAGES = [
  { code: 'en', tag: 'en', name: 'English', english: 'English', dir: 'ltr' },
  { code: 'es', tag: 'es', name: 'Español', english: 'Spanish', dir: 'ltr' },
  { code: 'fr', tag: 'fr', name: 'Français', english: 'French', dir: 'ltr' },
  { code: 'pt', tag: 'pt-BR', name: 'Português', english: 'Brazilian Portuguese', dir: 'ltr' },
  { code: 'zh', tag: 'zh-Hans', name: '简体中文', english: 'Simplified Chinese (Mandarin)', dir: 'ltr' },
  { code: 'tl', tag: 'tl', name: 'Tagalog', english: 'Tagalog', dir: 'ltr' },
  { code: 'vi', tag: 'vi', name: 'Tiếng Việt', english: 'Vietnamese', dir: 'ltr' },
  { code: 'ar', tag: 'ar', name: 'العربية', english: 'Arabic', dir: 'rtl' },
  { code: 'ko', tag: 'ko', name: '한국어', english: 'Korean', dir: 'ltr' },
  { code: 'ru', tag: 'ru', name: 'Русский', english: 'Russian', dir: 'ltr' },
  { code: 'ht', tag: 'ht', name: 'Kreyòl ayisyen', english: 'Haitian Creole', dir: 'ltr' },
];

export const CODES = LANGUAGES.map(l => l.code);

// The language for a code, or English for anything unknown.
export function languageFor(code) {
  return LANGUAGES.find(l => l.code === code) || LANGUAGES[0];
}

// A translated string: the English text looked up in a language's strings,
// falling back to the English. {name} placeholders are filled from vars.
export function translate(strings, text, vars = {}) {
  const found = strings && Object.hasOwn(strings, text) ? strings[text] : text;
  return found.replace(/\{(\w+)\}/g, (all, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : all));
}

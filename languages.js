// The languages the site is published in, shared by the page scripts, the
// Worker and the page generator (scripts/i18n.mjs). English is the source:
// every other language is generated from the English pages and the
// translations in i18n/<code>.json. `code` is the URL folder (/es/start),
// `tag` the HTML lang and hreflang value, `name` the language in itself (for
// the switcher), `english` its English name (for the AI prompt and Thomas) and
// `offer` the line an English page shows someone who picked this language
// before (script.js), in the language itself.
export const LANGUAGES = [
  { code: 'en', tag: 'en', name: 'English', english: 'English', dir: 'ltr', offer: 'View this page in English' },
  { code: 'es', tag: 'es', name: 'Español', english: 'Spanish', dir: 'ltr', offer: 'Ver esta página en español' },
  { code: 'fr', tag: 'fr', name: 'Français', english: 'French', dir: 'ltr', offer: 'Voir cette page en français' },
  { code: 'pt', tag: 'pt-BR', name: 'Português', english: 'Brazilian Portuguese', dir: 'ltr', offer: 'Ver esta página em português' },
  { code: 'zh', tag: 'zh-Hans', name: '简体中文', english: 'Simplified Chinese (Mandarin)', dir: 'ltr', offer: '以简体中文查看此页面' },
  { code: 'tl', tag: 'tl', name: 'Tagalog', english: 'Tagalog', dir: 'ltr', offer: 'Tingnan ang pahinang ito sa Tagalog' },
  { code: 'vi', tag: 'vi', name: 'Tiếng Việt', english: 'Vietnamese', dir: 'ltr', offer: 'Xem trang này bằng tiếng Việt' },
  { code: 'ar', tag: 'ar', name: 'العربية', english: 'Arabic', dir: 'rtl', offer: 'عرض هذه الصفحة بالعربية' },
  { code: 'ko', tag: 'ko', name: '한국어', english: 'Korean', dir: 'ltr', offer: '이 페이지를 한국어로 보기' },
  { code: 'ru', tag: 'ru', name: 'Русский', english: 'Russian', dir: 'ltr', offer: 'Открыть эту страницу на русском' },
  { code: 'ht', tag: 'ht', name: 'Kreyòl ayisyen', english: 'Haitian Creole', dir: 'ltr', offer: 'Gade paj sa a an kreyòl ayisyen' },
];

export const CODES = LANGUAGES.map(l => l.code);

// The language for a code, or English for anything unknown.
/** @param {string | null | undefined} code */
export function languageFor(code) {
  return LANGUAGES.find(l => l.code === code) || LANGUAGES[0];
}

// A translated string: the English text looked up in a language's strings,
// falling back to the English. {name} placeholders are filled from vars.
/**
 * @param {Record<string, string> | null | undefined} strings @param {string} text
 * @param {Record<string, string | number>} [vars] @returns {string}
 */
export function translate(strings, text, vars = {}) {
  const found = strings && Object.hasOwn(strings, text) ? strings[text] : text;
  return found.replace(/\{(\w+)\}/g, (all, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : all));
}

// What the pages' scripts use beyond TypeScript's standard DOM types, for the
// type check of the browser files (tsconfig.browser.json). Only the type
// checker reads this file; nothing here runs, and it isn't uploaded.

// start.js imports outlines.js with the shared cache-busting ?v= (README,
// "Caching"), which TypeScript can't resolve by itself. Bump the number here
// with the rest; CI checks it matches.
// List here whatever start.js imports from it.
declare module '*/outlines.js?v=15' {
  export const OUTLINES: typeof import('./outlines.js').OUTLINES;
  export const adFor: typeof import('./outlines.js').adFor;
  export const pickKind: typeof import('./outlines.js').pickKind;
}

// Cloudflare Turnstile's script, the bot check on /start.
interface Turnstile {
  render(container: string, options: Record<string, unknown>): string | undefined;
  reset(widget?: string): void;
}

// The Web Speech API's recognizer ("Talk instead" on /start): unprefixed, or
// webkit-prefixed in Chrome and Safari. TypeScript's DOM types leave it out.
interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
}

interface Window {
  turnstile?: Turnstile;
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
}

interface Document {
  // Chrome's check of the page's Permissions-Policy.
  featurePolicy?: { allowsFeature(feature: string): boolean };
}

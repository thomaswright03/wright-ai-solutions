// Lint for every script in the repo: the browser pages, the Worker, the tests
// and the tooling. `npm run lint` runs it, and CI requires it to pass with no
// warnings (`.github/workflows/ci.yml`, the "lint" job).
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'test-results/', 'playwright-report/', '.wrangler/'] },
  js.configs.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
    rules: {
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-shadow': 'error',
      'no-implicit-coercion': ['error', { allow: ['!!'] }],
      'no-param-reassign': 'error',
      'no-return-assign': 'error',
      'no-throw-literal': 'error',
      'no-useless-concat': 'error',
      'no-useless-return': 'error',
      'no-duplicate-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prefer-template': 'error',
      'object-shorthand': 'error',
      curly: ['error', 'multi-line'],
    },
  },
  // The pages' scripts run in the browser.
  {
    files: ['script.js', 'start.js', 'outlines.js', 'theme-init.js'],
    languageOptions: { globals: globals.browser },
  },
  // theme-init.js is a classic script, loaded before the page paints.
  { files: ['theme-init.js'], languageOptions: { sourceType: 'script' } },
  // The Worker runs on Cloudflare (web APIs, no Node).
  {
    files: ['worker/**/*.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  // Tests and tooling run in Node; tests also run code in the page.
  {
    files: ['tests/**/*.mjs', 'scripts/**/*.mjs', '*.config.{js,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-console': 'off' },
  },
];

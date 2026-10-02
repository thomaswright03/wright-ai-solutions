// The frame for the few pages the Worker writes itself (/forget and /admin):
// the site's own stylesheet, logo and footer, and no scripts beyond the theme.
import { escapeHtml as esc } from './http.js';

// Matches the ?v= the static pages use, so the stylesheet isn't served stale.
export const ASSET_VERSION = 11;

export function page({ title, body, wide = false, extraCss = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — Wright AI Solutions LLC</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<script src="/theme-init.js?v=${ASSET_VERSION}"></script>
<link rel="stylesheet" href="/fonts/fonts.css?v=${ASSET_VERSION}">
<link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}">
${extraCss ? `<link rel="stylesheet" href="${esc(extraCss)}?v=${ASSET_VERSION}">` : ''}
</head>
<body>
<header class="site-header">
  <div class="wrap header-inner">
    <a href="/" class="logo">
      <span class="logo-mark" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M13.5 2 4.5 13.5h6.2L9.5 22l9-11.5h-6.2z"/></svg></span> Wright AI Solutions
    </a>
  </div>
</header>
<main class="legal${wide ? ' admin' : ''}" id="main">
  <div class="wrap legal-inner">
${body}
  </div>
</main>
<footer class="site-footer">
  <div class="wrap footer-inner">
    <span>© ${new Date().getUTCFullYear()} Wright AI Solutions LLC. All rights reserved.</span>
    <div class="footer-contact">
      <a href="/privacy">Privacy</a>
      <a href="mailto:t@thomasewright.com">t@thomasewright.com</a>
    </div>
  </div>
</footer>
</body>
</html>`;
}

// On a translated page, the words this script shows come from the strings the
// page carries (scripts/i18n.mjs writes them in); English is the fallback.
const siteStrings = (() => {
  try { return JSON.parse(document.getElementById('siteStrings')?.textContent || '{}'); } catch (e) { return {}; }
})();
const t = (text, vars = {}) => (Object.hasOwn(siteStrings, text) ? siteStrings[text] : text)
  .replace(/\{(\w+)\}/g, (all, name) => (Object.hasOwn(vars, name) ? vars[name] : all));

const copyrightYear = document.getElementById('copyright-year');
if (copyrightYear) copyrightYear.textContent = new Date().getFullYear();

const navToggle = document.getElementById('navToggle');
const navMobile = document.getElementById('navMobile');

// The /start landing page has no section nav, so it has no menu to wire up.
if (navToggle && navMobile) {
  function closeMobileNav() {
    navMobile.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }

  function openMobileNav() {
    navMobile.classList.add('open');
    navToggle.setAttribute('aria-expanded', 'true');
  }

  navToggle.addEventListener('click', () => {
    const isOpen = navMobile.classList.contains('open');
    if (isOpen) closeMobileNav(); else openMobileNav();
  });

  navMobile.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMobileNav);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navMobile.classList.contains('open')) {
      closeMobileNav();
      navToggle.focus();
    }
  });

  document.addEventListener('click', (e) => {
    if (!navMobile.classList.contains('open')) return;
    if (navMobile.contains(e.target) || navToggle.contains(e.target)) return;
    closeMobileNav();
  });

  window.addEventListener('scroll', () => {
    if (navMobile.classList.contains('open')) closeMobileNav();
  }, { passive: true });
}

// Language menu: a <details> that opens and works without this script; this
// closes it on Escape or a click anywhere else, like the mobile menu.
const langMenu = document.querySelector('.lang-menu');
if (langMenu) {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && langMenu.open) {
      langMenu.open = false;
      langMenu.querySelector('summary').focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (langMenu.open && !langMenu.contains(e.target)) langMenu.open = false;
  });
}

const contactHint = document.getElementById('contactHint');
if (contactHint) {
  document.querySelectorAll('[data-copy]').forEach(el => {
    el.addEventListener('click', () => {
      const value = el.dataset.copy;
      const showManual = () => {
        contactHint.textContent = t('Copy this: {value}', { value });
      };
      if (!navigator.clipboard) { showManual(); return; }
      navigator.clipboard.writeText(value).then(() => {
        contactHint.textContent = t('Copied "{value}" to your clipboard, in case that didn\'t open a mail or phone app.', { value });
      }).catch(showManual);
    });
  });
}

// Theme toggle: cycles match-system -> light -> dark. theme-init.js applies the
// saved choice before paint; this keeps the button and storage in sync.
const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
  const themeOrder = ['system', 'light', 'dark'];
  const themeLabels = { system: t('match system'), light: t('light'), dark: t('dark') };

  const readTheme = () => {
    const current = document.documentElement.dataset.theme;
    return current === 'light' || current === 'dark' ? current : 'system';
  };

  const showTheme = (choice) => {
    const next = themeOrder[(themeOrder.indexOf(choice) + 1) % themeOrder.length];
    themeToggle.dataset.choice = choice;
    themeToggle.setAttribute('aria-label', t('Color theme: {choice}. Switch to {next}', { choice: themeLabels[choice], next: themeLabels[next] }));
    themeToggle.title = t('Color theme: {choice}', { choice: themeLabels[choice] });
  };

  themeToggle.addEventListener('click', () => {
    const choice = themeOrder[(themeOrder.indexOf(readTheme()) + 1) % themeOrder.length];
    if (choice === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = choice;
    try {
      if (choice === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', choice);
    } catch (e) { /* storage blocked: choice lasts for this page only */ }
    showTheme(choice);
  });

  showTheme(readTheme());
}

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReducedMotion) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.card, .work-item').forEach(el => {
    el.classList.add('reveal');
    observer.observe(el);
  });
}

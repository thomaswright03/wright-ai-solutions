const copyrightYear = document.getElementById('copyright-year');
if (copyrightYear) copyrightYear.textContent = new Date().getFullYear();

const navToggle = document.getElementById('navToggle');
const navMobile = document.getElementById('navMobile');

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

const contactHint = document.getElementById('contactHint');
if (contactHint) {
  document.querySelectorAll('[data-copy]').forEach(el => {
    el.addEventListener('click', () => {
      const value = el.dataset.copy;
      const showManual = () => {
        contactHint.textContent = `Copy this: ${value}`;
      };
      if (!navigator.clipboard) { showManual(); return; }
      navigator.clipboard.writeText(value).then(() => {
        contactHint.textContent = `Copied "${value}" to your clipboard, in case that didn't open a mail or phone app.`;
      }).catch(showManual);
    });
  });
}

// Theme toggle: cycles match-system -> light -> dark. theme-init.js applies the
// saved choice before paint; this keeps the button and storage in sync.
const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
  const themeOrder = ['system', 'light', 'dark'];
  const themeLabels = { system: 'match system', light: 'light', dark: 'dark' };

  const readTheme = () => {
    const current = document.documentElement.dataset.theme;
    return current === 'light' || current === 'dark' ? current : 'system';
  };

  const showTheme = (choice) => {
    const next = themeOrder[(themeOrder.indexOf(choice) + 1) % themeOrder.length];
    themeToggle.dataset.choice = choice;
    themeToggle.setAttribute('aria-label', `Color theme: ${themeLabels[choice]}. Switch to ${themeLabels[next]}`);
    themeToggle.title = `Color theme: ${themeLabels[choice]}`;
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

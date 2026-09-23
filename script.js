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
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(el.dataset.copy).then(() => {
        contactHint.textContent = `Copied "${el.dataset.copy}" to your clipboard, in case that didn't open a mail or phone app.`;
      }).catch(() => {});
    });
  });
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

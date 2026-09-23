// Runs in <head>, before first paint, so a saved theme choice never flashes.
// No saved choice means "follow the OS" (handled by the stylesheet).
try {
  var savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    document.documentElement.dataset.theme = savedTheme;
  }
} catch (e) { /* storage blocked: follow the OS */ }

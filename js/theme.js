(() => {
  let saved;
  try { saved = localStorage.getItem('codeverse-theme'); } catch (_) { /* Storage may be unavailable. */ }
  const theme = saved === 'light' || saved === 'dark' ? saved
    : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
})();

// Runs before first paint so a light-theme user never sees a dark flash. A file rather than
// an inline <script>, so the Content-Security-Policy can stay at script-src 'self'.
(function () {
  var theme;
  try {
    theme = localStorage.getItem('stakeflow-theme');
  } catch (e) {}
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.className = 't-' + theme;
})();

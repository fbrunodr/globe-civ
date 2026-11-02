// The top bar wraps to more lines on narrow windows; the panels under it
// (style.css: --topbar-h) follow its real height instead of a fixed one.
const bar = document.getElementById('topbar');
if (bar) {
  const fit = () => document.documentElement.style.setProperty('--topbar-h', `${bar.offsetHeight}px`);
  new ResizeObserver(fit).observe(bar);
  fit();
}

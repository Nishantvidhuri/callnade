const isMobile = () =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;

export function enterFullscreenOnMobile() {
  if (typeof document === 'undefined') return;
  if (!isMobile()) return;
  if (document.fullscreenElement) return;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
  if (!req) return;
  try {
    const result = req.call(el);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    /* user-gesture or permissions denied */
  }
}

export function exitFullscreen() {
  if (typeof document === 'undefined') return;
  if (!document.fullscreenElement) return;
  const exit =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.mozCancelFullScreen;
  if (!exit) return;
  try {
    const result = exit.call(document);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    /* ignore */
  }
}

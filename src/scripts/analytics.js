/**
 * Аналитика: цели Яндекс.Метрики + собственный журнал поиска на сервере
 * (запросы без результатов видны владельцу в админке).
 */
export function goal(name, params) {
  try {
    if (window.ym && window.__ymId) window.ym(window.__ymId, 'reachGoal', name, params);
  } catch {}
}

export function track(type, data = {}) {
  if (document.documentElement.dataset.static === '1') return; // на GitHub Pages сервера нет — только Метрика
  const body = JSON.stringify({ type, ...data, page: location.pathname });
  try {
    const blob = new Blob([body], { type: 'application/json' });
    if (!(navigator.sendBeacon && navigator.sendBeacon('/api/track', blob))) {
      fetch('/api/track', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
    }
  } catch {}
}

/** Клики по ссылкам с data-goal="phone_click" и т.п. */
export function initGoalLinks() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-goal]');
    if (el) goal(el.dataset.goal);
  });
}

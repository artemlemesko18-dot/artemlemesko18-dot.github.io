/** Мелкие общие помощники интерфейса: тосты, блокировка прокрутки, миниатюры товаров. */
import { icon } from '../lib/icons.js';
import { silhouette, TINT } from '../lib/silhouettes.js';
import { escapeHtml } from '../lib/format.js';

export { escapeHtml };

export function toast(message, action) {
  const root = document.querySelector('[data-toasts]');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${icon('circleCheck')}<span>${escapeHtml(message)}</span>`;
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { action.onClick(); remove(); });
    el.append(btn);
  }
  root.append(el);
  while (root.children.length > 2) root.firstElementChild.remove();
  const remove = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 260);
  };
  setTimeout(remove, 3200);
}

let locks = 0;
export function lockScroll(on) {
  locks = Math.max(0, locks + (on ? 1 : -1));
  document.body.classList.toggle('is-locked', locks > 0);
}

/** Миниатюра: фото или плейсхолдер-силуэт */
export function thumbHtml(p) {
  if (p.image) return `<img src="${escapeHtml(p.image)}" alt="" loading="lazy" decoding="async" width="112" height="112">`;
  return `<div class="ph ${TINT[p.category] || ''}">${silhouette(p.icon)}</div>`;
}

/** Держит фокус внутри открытого диалога */
export function trapFocus(container, e) {
  if (e.key !== 'Tab') return;
  const items = [...container.querySelectorAll('a[href], button:not([disabled]), input:not([type=hidden]):not([tabindex="-1"]), select, textarea, [tabindex="0"]')]
    .filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
  else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
}

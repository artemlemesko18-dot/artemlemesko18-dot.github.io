/**
 * Корзина: хранится в localStorage, пересчитывается мгновенно.
 * Состав: { [id товара]: количество } — штуки или кг (для развесных товаров).
 */
import { loadData, peekData, isStaticSite } from './data.js';
import { goal } from './analytics.js';
import { toast, lockScroll, thumbHtml, trapFocus, escapeHtml } from './ui.js';
import { icon } from '../lib/icons.js';
import { qtyStep, qtyText, lineEstimate, rub, priceText, statusLabel, isWeighed } from '../lib/format.js';

const KEY = 'vid-cart';
const listeners = new Set();
let state = read();

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  listeners.forEach((fn) => fn(state));
}

// Синхронизация между вкладками
window.addEventListener('storage', (e) => {
  if (e.key === KEY) { state = read(); listeners.forEach((fn) => fn(state)); }
});

// Единицы товара (штуки/кг): из загруженных данных или из кнопки на странице
const metaCache = {};
const metaOf = (id) => {
  if (metaCache[id]) return metaCache[id];
  const el = document.querySelector(`[data-cart-cta="${CSS.escape(id)}"]`);
  return el ? { sellBy: el.dataset.sell, unitLabel: el.dataset.unit, name: el.dataset.name } : null;
};
loadData()
  .then((data) => data.products.forEach((p) => { metaCache[p.id] = p; }))
  .catch(() => {});

export const cart = {
  get: (id) => state[id] || 0,
  entries: () => Object.entries(state),
  count: () => Object.keys(state).length,
  set(id, qty) {
    if (qty > 0) state[id] = Math.round(qty * 10) / 10;
    else delete state[id];
    save();
  },
  clear() { state = {}; save(); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

/** Добавить товар. meta — {sellBy, unitLabel, name}, если известно на странице. */
export function addToCart(id, meta) {
  const m = meta || metaOf(id) || { sellBy: 'piece' };
  const step = qtyStep(m);
  cart.set(id, cart.get(id) + (cart.get(id) ? step : 1));
  bumpBadge();
  goal('add_to_cart', { id });
  toast(`Добавлено: ${m.name || 'товар'}`, { label: 'Корзина', onClick: openCart });
}

function changeQty(id, dir) {
  const m = metaOf(id) || { sellBy: 'piece' };
  const step = qtyStep(m);
  const next = cart.get(id) + dir * step;
  const min = m.sellBy === 'weight' ? 0.5 : 1;
  cart.set(id, next < min ? 0 : next);
}

/* ---------- Кнопки на карточках ---------- */
function syncCtas() {
  document.querySelectorAll('[data-cart-cta]').forEach((el) => {
    const id = el.dataset.cartCta;
    const qty = cart.get(id);
    el.classList.toggle('in-cart', qty > 0);
    const out = el.querySelector('output');
    if (out && qty) out.textContent = qtyText({ sellBy: el.dataset.sell, unitLabel: el.dataset.unit }, qty);
  });
}

function syncBadge() {
  const n = cart.count();
  document.querySelectorAll('[data-cart-count]').forEach((b) => {
    b.textContent = String(n);
    b.classList.toggle('has-items', n > 0);
  });
  document.querySelectorAll('[data-cart-count-sr]').forEach((b) => { b.textContent = `Корзина, товаров: ${n}`; });
}

function bumpBadge() {
  document.querySelectorAll('[data-cart-count]').forEach((b) => {
    b.classList.remove('bump');
    void b.offsetWidth; // перезапуск анимации
    b.classList.add('bump');
  });
}

/* ---------- Панель корзины ---------- */
const drawer = () => document.querySelector('[data-cart-drawer]');
let lastFocus = null;

export function openCart() {
  const d = drawer();
  if (!d || d.classList.contains('is-open')) return;
  lastFocus = document.activeElement;
  showStep('cart');
  d.classList.add('is-open');
  d.setAttribute('aria-hidden', 'false');
  lockScroll(true);
  renderDrawer();
  setTimeout(() => d.querySelector('[data-cart-close].icon-btn')?.focus(), 50);
}

export function closeCart() {
  const d = drawer();
  if (!d || !d.classList.contains('is-open')) return;
  d.classList.remove('is-open');
  d.setAttribute('aria-hidden', 'true');
  lockScroll(false);
  lastFocus?.focus?.();
}

function showStep(step) {
  const d = drawer();
  d.querySelectorAll('.cart-step').forEach((el) => { el.hidden = el.dataset.step !== step; });
  d.querySelectorAll('[data-foot]').forEach((el) => { el.hidden = el.dataset.foot !== step; });
  if (step === 'form') setTimeout(() => d.querySelector('#o-name')?.focus(), 50);
}

/** Текст заказа — для Telegram и уведомлений */
export function orderText(data, extra = {}) {
  const lines = cart.entries()
    .map(([id, qty]) => {
      const p = data.byId[id];
      if (!p) return null;
      const est = lineEstimate(p, qty);
      return `• ${p.name} — ${qtyText(p, qty)}${est != null ? ` (≈ ${rub(est)})` : ''}`;
    })
    .filter(Boolean);
  const { total, unknown } = totals(data);
  return [
    'Здравствуйте! Хочу заказать:',
    ...lines,
    total ? `Итого примерно: ${rub(total)}${unknown ? ' + позиции с ценой по запросу' : ''}` : '',
    extra.name ? `Имя: ${extra.name}` : '',
    extra.phone ? `Телефон: ${extra.phone}` : '',
    extra.date ? `Желаемая дата: ${extra.date}` : '',
    extra.comment ? `Комментарий: ${extra.comment}` : '',
  ].filter(Boolean).join('\n');
}

function totals(data) {
  let total = 0;
  let unknown = 0;
  for (const [id, qty] of cart.entries()) {
    const p = data.byId[id];
    if (!p) continue;
    const est = lineEstimate(p, qty);
    if (est == null) unknown++;
    else total += est;
  }
  return { total, unknown };
}

async function renderDrawer() {
  const d = drawer();
  if (!d || !d.classList.contains('is-open')) return;
  const list = d.querySelector('[data-cart-lines]');
  const empty = d.querySelector('[data-cart-empty]');
  const foot = d.querySelector('[data-cart-foot]');

  let data;
  try {
    data = await loadData();
  } catch {
    list.innerHTML = '<li class="muted">Не удалось загрузить корзину. Обновите страницу.</li>';
    return;
  }
  // Удаляем из корзины товары, которых больше нет в каталоге
  for (const [id] of cart.entries()) if (!data.byId[id]) delete state[id];

  const entries = cart.entries();
  empty.hidden = entries.length > 0;
  foot.hidden = entries.length === 0;
  if (!entries.length) showStep('cart');

  list.innerHTML = entries
    .map(([id, qty]) => {
      const p = data.byId[id];
      const est = lineEstimate(p, qty);
      return `<li class="cart-line">
        <a class="cart-line__media" href="/catalog/${p.id}" tabindex="-1">${thumbHtml(p)}</a>
        <div>
          <div class="cart-line__top">
            <a class="cart-line__name" href="/catalog/${p.id}">${escapeHtml(p.name)}</a>
            <button type="button" class="icon-btn" style="width:36px;height:36px;margin:-6px -8px 0 0" data-remove="${p.id}" aria-label="Убрать ${escapeHtml(p.name)}">${icon('trash')}</button>
          </div>
          <div class="cart-line__sub">${escapeHtml(priceText(p))}${p.weightText ? ` · ${escapeHtml(p.weightText)}` : ''} · ${escapeHtml(statusLabel(p))}</div>
          <div class="cart-line__row">
            <div class="qty" role="group" aria-label="Количество">
              <button type="button" data-dec="${p.id}" aria-label="Меньше">${icon('minus')}</button>
              <output aria-live="polite">${escapeHtml(qtyText(p, qty))}</output>
              <button type="button" data-inc="${p.id}" aria-label="Больше">${icon('plus')}</button>
            </div>
            <span class="cart-line__sum">${est != null ? `≈ ${rub(est)}` : 'по запросу'}</span>
          </div>
        </div>
      </li>`;
    })
    .join('');

  const { total, unknown } = totals(data);
  d.querySelector('[data-cart-total]').textContent = rub(total);
  const weighed = entries.some(([id]) => isWeighed(data.byId[id]));
  d.querySelector('[data-cart-note]').textContent = [
    weighed ? 'Итог уточняется после взвешивания.' : '',
    unknown ? 'Цену позиций «по запросу» подтвержу лично.' : '',
  ].filter(Boolean).join(' ') || 'Наличие подтвержу перед получением.';

  const tg = d.querySelector('[data-tg-order]');
  tg.href = `https://t.me/${data.telegramUser}?text=${encodeURIComponent(orderText(data))}`;
}

/* ---------- Оформление заявки ---------- */
function digits(s) { return (s || '').replace(/\D/g, ''); }

async function submitOrder(form) {
  const err = form.querySelector('[data-form-error]');
  const btn = document.querySelector('[data-order-submit]');
  const fd = new FormData(form);
  const name = String(fd.get('name') || '').trim();
  const phone = String(fd.get('phone') || '').trim();
  const showError = (msg, field) => {
    err.innerHTML = msg;
    err.hidden = false;
    if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
  };
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  err.hidden = true;

  if (name.length < 2) return showError('Как к вам обращаться?', form.elements.name);
  if (digits(phone).length !== 11) return showError('Проверьте номер телефона — нужно 10 цифр после +7.', form.elements.phone);
  if (!form.elements.consent.checked) return showError('Нужно согласие на обработку персональных данных.', form.elements.consent);

  // без await, если данные уже есть: иначе браузер заблокирует открытие Telegram
  const data = peekData() || (await loadData());

  if (isStaticSite()) {
    const extra = { name, phone, date: String(fd.get('date') || ''), comment: String(fd.get('comment') || '').trim() };
    const tgUrl = `https://t.me/${data.telegramUser}?text=${encodeURIComponent(orderText(data, extra))}`;
    const win = window.open(tgUrl, '_blank');
    if (!win) location.href = tgUrl;
    goal('order_submit', { via: 'telegram' });
    cart.clear();
    form.reset();
    closeCart();
    openThanks(true);
    return;
  }

  const items = cart.entries().map(([id, qty]) => {
    const p = data.byId[id];
    return { id, name: p.name, qty, qtyText: qtyText(p, qty), estimate: lineEstimate(p, qty) };
  });
  const { total, unknown } = totals(data);
  const payload = {
    name,
    phone,
    date: String(fd.get('date') || ''),
    comment: String(fd.get('comment') || '').trim(),
    website: String(fd.get('website') || ''), // honeypot
    startedAt: Number(form.dataset.startedAt || 0),
    items,
    total: Math.round(total),
    hasUnknownPrices: unknown > 0,
  };

  btn.disabled = true;
  try {
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
    goal('order_submit', { total: payload.total });
    cart.clear();
    form.reset();
    closeCart();
    openThanks();
  } catch (e) {
    const tgUrl = `https://t.me/${data.telegramUser}?text=${encodeURIComponent(orderText(data, payload))}`;
    showError(
      `${escapeHtml(e.message.startsWith('HTTP') || e.message === 'Failed to fetch' ? 'Не получилось отправить заявку.' : e.message)} ` +
        `Отправьте её в <a href="${tgUrl}" target="_blank" rel="noopener">Telegram</a> — текст уже готов.`,
    );
  } finally {
    btn.disabled = false;
  }
}

function openThanks(viaTelegram = false) {
  const m = document.querySelector('[data-thanks]');
  m.querySelector('[data-thanks-text]').textContent = viaTelegram
    ? 'Заявка открылась в Telegram с готовым текстом — нажмите там «Отправить». Я отвечу и подтвержу наличие.'
    : 'Заявка у меня. Свяжусь с вами в ближайшее время, чтобы подтвердить наличие и договориться о получении.';
  m.classList.add('is-open');
  lockScroll(true);
  m.querySelector('[data-thanks-close]').focus();
}
function closeThanks() {
  const m = document.querySelector('[data-thanks]');
  if (!m.classList.contains('is-open')) return;
  m.classList.remove('is-open');
  lockScroll(false);
}

export function initCart() {
  const sync = () => { syncCtas(); syncBadge(); renderDrawer(); };
  cart.subscribe(sync);
  syncCtas();
  syncBadge();

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-add],[data-inc],[data-dec],[data-remove],[data-open-cart],[data-cart-close],[data-cart-next],[data-cart-back],[data-thanks-close],[data-tg-order]');
    if (!t) {
      if (e.target.matches('[data-thanks]')) closeThanks();
      return;
    }
    const ds = t.dataset;
    if (ds.add) addToCart(ds.add);
    else if (ds.inc) changeQty(ds.inc, 1);
    else if (ds.dec) changeQty(ds.dec, -1);
    else if (ds.remove) cart.set(ds.remove, 0);
    else if ('openCart' in ds) openCart();
    else if ('cartClose' in ds) closeCart();
    else if ('cartNext' in ds) {
      const form = document.querySelector('[data-order-form]');
      form.dataset.startedAt = String(Date.now());
      showStep('form');
    } else if ('cartBack' in ds) showStep('cart');
    else if ('thanksClose' in ds) closeThanks();
    else if ('tgOrder' in ds) goal('telegram_order');
  });

  document.addEventListener('keydown', (e) => {
    const d = drawer();
    if (d?.classList.contains('is-open')) {
      if (e.key === 'Escape') closeCart();
      else trapFocus(d.querySelector('.drawer__panel'), e);
    }
    if (e.key === 'Escape') closeThanks();
  });

  document.querySelector('[data-order-form]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitOrder(e.currentTarget);
  });
}

/**
 * Интерфейс живого поиска (combobox + listbox по WAI-ARIA).
 * Подключается к каждой форме [data-sbox]: в hero и в оверлее-палитре.
 */
import { getEngine, loadData } from './data.js';
import { goal, track } from './analytics.js';
import { addToCart } from './cart.js';
import { lockScroll, thumbHtml, trapFocus, escapeHtml } from './ui.js';
import { icon } from '../lib/icons.js';
import { priceText, statusLabel, statusTone, plural } from '../lib/format.js';

const RECENT_KEY = 'vid-recent';
const DEBOUNCE = 160;
const MAX_ROWS = 8;

/* ---------- Недавние запросы ---------- */
export function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 6); } catch { return []; }
}
export function saveRecent(q) {
  q = q.trim();
  if (q.length < 2) return;
  try {
    const list = [q, ...getRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {}
}
function clearRecent() {
  try { localStorage.removeItem(RECENT_KEY); } catch {}
}

/* ---------- Аналитика запросов: отправляем, когда пользователь перестал печатать ---------- */
const reported = new Set();
let reportTimer;
export function reportQuery(q, count, immediate = false) {
  clearTimeout(reportTimer);
  const send = () => {
    const key = q.trim().toLowerCase();
    if (key.length < 2 || reported.has(key)) return;
    reported.add(key);
    goal('search', { query: key, results: count });
    track(count ? 'search' : 'search_miss', { q: key, n: count });
    if (!count) goal('search_no_results', { query: key });
  };
  if (immediate) send();
  else reportTimer = setTimeout(send, 1400);
}

const searchUrl = (q) => `/search?q=${encodeURIComponent(q.trim())}`;

class SearchBox {
  constructor(form) {
    this.form = form;
    this.variant = form.dataset.sbox;
    this.input = form.querySelector('[role="combobox"]');
    this.panel = form.querySelector('[role="listbox"]');
    this.live = form.querySelector('[data-live]');
    this.options = [];
    this.active = -1;
    this.timer = null;
    this.seq = 0;
    this.bind();
  }

  bind() {
    const { input, form } = this;
    input.addEventListener('input', () => {
      form.classList.toggle('has-value', !!input.value);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.update(), DEBOUNCE);
    });
    input.addEventListener('focus', () => {
      getEngine().catch(() => {}); // прогрев индекса
      this.update();
    });
    input.addEventListener('keydown', (e) => this.onKey(e));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.go();
    });
    form.querySelector('[data-clear]')?.addEventListener('click', () => {
      input.value = '';
      form.classList.remove('has-value');
      input.focus();
      this.update();
    });
    // не теряем фокус в поле при клике по панели (клик при этом срабатывает)
    this.panel.addEventListener('mousedown', (e) => e.preventDefault());
    this.panel.addEventListener('click', (e) => this.onPanelClick(e));
    if (this.variant !== 'palette') {
      document.addEventListener('click', (e) => { if (!form.contains(e.target)) this.close(); });
      form.addEventListener('focusout', (e) => { if (!form.contains(e.relatedTarget)) this.close(); });
    }
  }

  open() {
    this.form.classList.add('is-open');
    this.input.setAttribute('aria-expanded', 'true');
  }
  close() {
    this.form.classList.remove('is-open');
    this.input.setAttribute('aria-expanded', 'false');
    this.setActive(-1);
  }

  async update() {
    const q = this.input.value.trim();
    const seq = ++this.seq;
    this.open();
    if (!q) return this.renderIdle();

    let ctx;
    try {
      ctx = await Promise.race([getEngine(), new Promise((r) => setTimeout(() => r(null), 120))]);
      if (!ctx) {
        this.renderSkeleton();
        ctx = await getEngine();
      }
    } catch {
      this.panel.innerHTML = `<div class="sempty"><p>Поиск временно недоступен. Нажмите Enter, чтобы открыть страницу результатов.</p></div>`;
      return;
    }
    if (seq !== this.seq) return; // пришёл более свежий ввод
    const results = ctx.engine.search(q);
    this.render(q, results, ctx);
    reportQuery(q, results.length);
  }

  renderSkeleton() {
    this.options = [];
    this.panel.innerHTML = Array.from({ length: 3 }, () => '<div class="sskeleton"><i></i><b><i></i><i></i></b></div>').join('');
  }

  async renderIdle() {
    let data;
    try { data = await loadData(); } catch { return this.close(); }
    const recent = getRecent();
    const popular = data.popular.map((id) => data.byId[id]).filter(Boolean);
    let html = '';
    if (recent.length) {
      html += `<div class="sgroup"><span>Недавние запросы</span><button type="button" data-clear-recent>Очистить</button></div>
        <div role="group" aria-label="Недавние запросы">${recent
          .map((q, i) => `<div class="squery" role="option" id="${this.input.id}-r${i}" data-query="${escapeHtml(q)}">${icon('history')}<span>${escapeHtml(q)}</span></div>`)
          .join('')}</div>`;
    }
    html += `<div class="sgroup"><span>Популярное</span></div>
      <div role="group" aria-label="Популярное">${popular.map((p, i) => this.rowHtml(p, i, null)).join('')}</div>`;
    html += `<div class="sgroup" style="margin-top:6px"><span>Часто ищут</span></div>
      <div class="chips" style="padding:4px 8px 8px">${data.popularQueries
        .map((q) => `<a class="chip" href="${searchUrl(q)}" data-query="${escapeHtml(q)}">${escapeHtml(q)}</a>`)
        .join('')}</div>`;
    this.panel.innerHTML = html;
    this.collectOptions();
    this.live.textContent = '';
  }

  rowHtml(p, i, core, terms) {
    const name = core && terms ? core.highlight(p.name, terms) : escapeHtml(p.name);
    return `<div class="sres" role="option" id="${this.input.id}-o${i}" data-href="/catalog/${p.id}" data-id="${p.id}" aria-selected="false">
      <div class="sres__media">${thumbHtml(p)}</div>
      <div><div class="sres__name">${name}</div>
        <div class="sres__meta"><span>${escapeHtml(priceText(p))}</span><span class="badge badge--${statusTone(p)}">${escapeHtml(statusLabel(p))}</span></div>
      </div>
      <button type="button" class="sres__add" tabindex="-1" data-sadd="${p.id}" aria-label="В корзину: ${escapeHtml(p.name)}">${icon('plus')}</button>
    </div>`;
  }

  render(q, results, { core, data }) {
    const total = results.length;
    if (!total) {
      this.options = [];
      this.panel.innerHTML = `<div class="sempty">
        ${icon('searchX')}
        <p><b>Ничего не нашлось.</b><br>Попробуйте «колбаса», «курица» или «паштет».</p>
        <div class="chips">${['колбаса', 'курица', 'паштет']
          .map((x) => `<button type="button" class="chip" data-query="${x}">${x}</button>`).join('')}</div>
        <a class="btn btn--ghost btn--sm" href="https://t.me/${data.telegramUser}?text=${encodeURIComponent(`Здравствуйте! Есть ли у вас «${q}»?`)}" target="_blank" rel="noopener" data-goal="telegram_click">${icon('send')}Спросить в Telegram</a>
      </div>`;
      this.live.textContent = 'Ничего не найдено';
      return;
    }
    const rows = results.slice(0, MAX_ROWS).map((r, i) => this.rowHtml(r.product, i, core, r.terms)).join('');
    this.panel.innerHTML = `${rows}
      <div class="sfoot">
        <a href="${searchUrl(q)}" data-all>Показать все результаты (${total})${icon('arrowRight')}</a>
        <div class="shints"><span><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> выбор</span><span><kbd class="kbd">Enter</kbd> открыть</span><span><kbd class="kbd">Esc</kbd> закрыть</span></div>
      </div>`;
    this.collectOptions();
    this.live.textContent = `Найдено ${total} ${plural(total, 'товар', 'товара', 'товаров')}`;
  }

  collectOptions() {
    this.options = [...this.panel.querySelectorAll('[role="option"]')];
    this.setActive(-1);
  }

  setActive(i) {
    this.options.forEach((el, k) => el.setAttribute('aria-selected', String(k === i)));
    this.active = i;
    const el = this.options[i];
    if (el) {
      this.input.setAttribute('aria-activedescendant', el.id);
      el.scrollIntoView({ block: 'nearest' });
    } else {
      this.input.removeAttribute('aria-activedescendant');
    }
  }

  onKey(e) {
    const n = this.options.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!this.form.classList.contains('is-open')) this.update();
      if (n) this.setActive((this.active + 1) % n);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) this.setActive(this.active <= 0 ? n - 1 : this.active - 1);
    } else if (e.key === 'Enter') {
      if (this.active >= 0 && this.options[this.active]) {
        e.preventDefault();
        this.choose(this.options[this.active]);
      }
    } else if (e.key === 'Escape') {
      if (this.variant === 'palette') return; // закроет палитра
      if (this.form.classList.contains('is-open')) {
        e.preventDefault();
        this.close();
      } else if (this.input.value) {
        this.input.value = '';
        this.form.classList.remove('has-value');
      }
    }
  }

  onPanelClick(e) {
    const add = e.target.closest('[data-sadd]');
    if (add) {
      e.preventDefault();
      loadData().then((data) => {
        const p = data.byId[add.dataset.sadd];
        addToCart(p.id, p);
        add.classList.add('is-added');
        add.innerHTML = icon('check');
      });
      return;
    }
    if (e.target.closest('[data-clear-recent]')) {
      clearRecent();
      this.renderIdle();
      this.input.focus();
      return;
    }
    if (e.target.closest('[data-all]')) {
      saveRecent(this.input.value);
      reportQuery(this.input.value, this.options.length, true);
      return;
    }
    const opt = e.target.closest('[role="option"], .chip[data-query], button[data-query]');
    if (opt) {
      e.preventDefault();
      this.choose(opt);
    }
  }

  choose(el) {
    if (el.dataset.query) {
      this.input.value = el.dataset.query;
      this.form.classList.add('has-value');
      this.input.focus();
      this.update();
      return;
    }
    const q = this.input.value.trim();
    if (q) {
      saveRecent(q);
      reportQuery(q, this.options.length, true);
      goal('search_click', { query: q, id: el.dataset.id });
      track('search_click', { q, id: el.dataset.id });
    }
    location.href = el.dataset.href;
  }

  go() {
    const q = this.input.value.trim();
    if (!q) return this.input.focus();
    saveRecent(q);
    location.href = searchUrl(q);
  }
}

/* ---------- Палитра поиска (оверлей) ---------- */
let paletteBox;
let paletteReturn;

export function openPalette(initial = '') {
  const pal = document.querySelector('[data-palette]');
  if (!pal || pal.classList.contains('is-open')) return;
  paletteReturn = document.activeElement;
  pal.classList.add('is-open');
  lockScroll(true);
  if (initial) paletteBox.input.value = initial;
  paletteBox.form.classList.toggle('has-value', !!paletteBox.input.value);
  paletteBox.input.focus();
  paletteBox.input.select();
  paletteBox.update();
}

export function closePalette() {
  const pal = document.querySelector('[data-palette]');
  if (!pal?.classList.contains('is-open')) return;
  pal.classList.remove('is-open');
  lockScroll(false);
  paletteReturn?.focus?.();
}

export function initSearch() {
  document.querySelectorAll('[data-sbox]').forEach((form) => {
    const box = new SearchBox(form);
    if (box.variant === 'palette') paletteBox = box;
  });

  const pal = document.querySelector('[data-palette]');
  pal?.addEventListener('click', (e) => {
    if (e.target === pal || e.target.closest('[data-palette-close]')) closePalette();
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-search]')) openPalette();
  });

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      openPalette();
    } else if ((e.key === '/' || e.key === '.') && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // «.» — та же клавиша, что «/», в русской раскладке
      e.preventDefault();
      openPalette();
    } else if (e.key === 'Escape' && pal?.classList.contains('is-open')) {
      closePalette();
    } else if (pal?.classList.contains('is-open')) {
      trapFocus(pal, e);
    }
  });
}

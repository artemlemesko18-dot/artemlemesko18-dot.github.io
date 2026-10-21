/** Точка входа клиентского JS: подключается на всех страницах из Base.astro. */
import { initCart } from './cart.js';
import { initSearch } from './search-ui.js';
import { initListing } from './listing.js';
import { initPhoneMasks, initContactForm } from './forms.js';
import { initGoalLinks } from './analytics.js';
import { lockScroll } from './ui.js';
import { loadData } from './data.js';

/* ---------- Тема ---------- */
function initTheme() {
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('vid-theme', next); } catch {}
    }),
  );
}

/* ---------- Шапка: стекло при прокрутке ---------- */
function initHeader() {
  const header = document.querySelector('[data-header]');
  if (!header) return;
  let ticking = false;
  const update = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 24);
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
}

/* ---------- Мобильное меню ---------- */
function initMenu() {
  const menu = document.querySelector('[data-menu]');
  const openBtn = document.querySelector('[data-menu-open]');
  if (!menu || !openBtn) return;
  const set = (open) => {
    menu.classList.toggle('is-open', open);
    openBtn.setAttribute('aria-expanded', String(open));
    lockScroll(open);
    (open ? menu.querySelector('[data-menu-close]') : openBtn).focus();
  };
  openBtn.addEventListener('click', () => set(true));
  menu.querySelector('[data-menu-close]').addEventListener('click', () => set(false));
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) { menu.classList.remove('is-open'); lockScroll(false); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('is-open')) set(false); });
}

/* ---------- Плавное появление блоков ---------- */
function initReveal() {
  const els = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach((el) => io.observe(el));
}

/* ---------- Дым в hero: пауза, когда hero не виден ---------- */
function initSmoke() {
  const smoke = document.querySelector('.smoke');
  if (!smoke || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(([e]) => {
    smoke.querySelectorAll('i').forEach((i) => { i.style.animationPlayState = e.isIntersecting ? 'running' : 'paused'; });
  }).observe(smoke);
}

/* ---------- Баннер cookies ---------- */
function initCookie() {
  const el = document.querySelector('[data-cookie]');
  if (!el) return;
  let seen = false;
  try { seen = localStorage.getItem('vid-cookie') === '1'; } catch {}
  if (seen) return;
  setTimeout(() => { el.hidden = false; }, 1200);
  el.querySelector('[data-cookie-ok]').addEventListener('click', () => {
    el.hidden = true;
    try { localStorage.setItem('vid-cookie', '1'); } catch {}
  });
}

/* ---------- Галерея на странице товара ---------- */
function initGallery() {
  const g = document.querySelector('[data-gallery]');
  if (!g) return;
  const main = g.querySelector('[data-gallery-main] img');
  g.querySelectorAll('[data-gallery-thumb]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (main) main.src = btn.dataset.galleryThumb;
      g.querySelectorAll('[data-gallery-thumb]').forEach((b) => b.setAttribute('aria-current', String(b === btn)));
    }),
  );
}

initTheme();
initHeader();
initMenu();
initReveal();
initSmoke();
initCookie();
initGallery();
initGoalLinks();
initPhoneMasks();
initContactForm();
initCart();
initSearch();
document.querySelectorAll('[data-listing]').forEach(initListing);

// Прогрев данных каталога, пока браузер свободен
(window.requestIdleCallback || ((fn) => setTimeout(fn, 1500)))(() => loadData().catch(() => {}));

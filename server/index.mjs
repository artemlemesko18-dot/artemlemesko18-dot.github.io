/**
 * Сервер «Вкус и Дело»: отдаёт собранный сайт и принимает заявки.
 * Без фреймворков — только Node.js (>= 20.12). Запуск: npm start
 *
 *   POST /api/order    — заявка из корзины → Telegram-бот + e-mail + журнал storage/orders.json
 *   POST /api/contact  — форма обратной связи → туда же
 *   POST /api/track    — поисковые запросы (для отчёта «чего не хватает в каталоге»)
 *   /admin             — админка владельца (пароль из ADMIN_PASSWORD)
 *
 * Настройки — в файле .env (см. .env.example).
 */
import http from 'node:http';
import { readFile, writeFile, mkdir, stat, readdir, rm, rename } from 'node:fs/promises';
import { existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lineEstimate, qtyText, rub } from '../src/lib/format.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch {}

const env = process.env;
const PORT = Number(env.PORT || 3000);
const HOST = env.HOST || '0.0.0.0';
const STORAGE = path.join(ROOT, 'storage');
const DATA = path.join(ROOT, 'src', 'data');
const PUBLIC = path.join(ROOT, 'public');
const ADMIN_DIR = path.join(ROOT, 'server', 'admin');
const POINTER = path.join(STORAGE, 'current-dist.txt');

await mkdir(STORAGE, { recursive: true });

/* ======================================================================
   Утилиты
   ====================================================================== */
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true }); // папку могли удалить при работающем сервере
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await rename(tmp, file);
}

function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'content-type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Слишком большой запрос'), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('Некорректный JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const clientIp = (req) =>
  (env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';

/** Ограничение частоты: не больше max запросов за windowMs с одного IP */
const buckets = new Map();
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  buckets.set(key, list);
  return list.length > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, list] of buckets) if (!list.some((t) => now - t < 3600_000)) buckets.delete(k);
}, 600_000).unref();

const clean = (s, max = 500) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/* ======================================================================
   Уведомления владельцу: Telegram-бот и e-mail
   ====================================================================== */
async function notifyTelegram(html) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chats = String(env.TELEGRAM_CHAT_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!token || !chats.length) return null;
  const results = await Promise.all(
    chats.map(async (chat_id) => {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id, text: html, parse_mode: 'HTML', disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error(`Telegram ${r.status}: ${await r.text()}`);
      return true;
    }),
  );
  return results.every(Boolean);
}

let mailer;
async function notifyEmail(subject, text) {
  if (!env.SMTP_HOST || !env.MAIL_TO) return null;
  if (!mailer) {
    const { default: nodemailer } = await import('nodemailer');
    mailer = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 465),
      secure: env.SMTP_SECURE !== '0',
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  await mailer.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, to: env.MAIL_TO, subject, text });
  return true;
}

/** Отправляет во все настроенные каналы. true — хотя бы один сработал, null — ни один не настроен. */
async function notifyOwner({ subject, html, text }) {
  const settled = await Promise.allSettled([notifyTelegram(html), notifyEmail(subject, text)]);
  let configured = false;
  let delivered = false;
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value !== null) { configured = true; delivered ||= !!s.value; }
    if (s.status === 'rejected') { configured = true; log('Ошибка уведомления:', s.reason?.message || s.reason); }
  }
  if (!configured) log('ВНИМАНИЕ: уведомления не настроены (TELEGRAM_BOT_TOKEN / SMTP_HOST). Заявка сохранена только в storage/.');
  return configured ? delivered : null;
}

async function appendLog(file, entry, keep = 2000) {
  const list = await readJson(file, []);
  list.push(entry);
  await writeJson(file, list.slice(-keep));
}

/* ======================================================================
   API: заявки, обратная связь, журнал поиска
   ====================================================================== */
function antiSpam(body) {
  if (clean(body.website)) return 'honeypot';
  const started = Number(body.startedAt || 0);
  // боты заполняют форму мгновенно; живой человек с автозаполнением — не быстрее ~1 с
  if (started && Date.now() - started < 1000) return 'too-fast';
  return null;
}

function validPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length === 11 && /^[78]/.test(d) ? `+7${d.slice(1)}` : null;
}

async function handleOrder(req, res) {
  const ip = clientIp(req);
  if (rateLimited(`order-any:${ip}`, 30, 10 * 60_000)) return send(res, 429, { ok: false, error: 'Слишком много запросов.' });
  const body = await readBody(req);
  const spam = antiSpam(body);
  if (spam) { log('Спам-заявка отклонена:', spam, ip); return send(res, 200, { ok: true }); }

  const name = clean(body.name, 60);
  const phone = validPhone(body.phone);
  if (name.length < 2) return send(res, 400, { ok: false, error: 'Укажите имя.' });
  if (!phone) return send(res, 400, { ok: false, error: 'Проверьте номер телефона.' });
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50) return send(res, 400, { ok: false, error: 'Корзина пуста.' });
  // лимит считаем только по корректным заявкам — опечатка в номере не блокирует покупателя
  if (rateLimited(`order:${ip}`, Number(env.ORDER_LIMIT || 5), 10 * 60_000)) {
    return send(res, 429, { ok: false, error: 'Слишком много заявок подряд. Попробуйте через несколько минут или напишите в Telegram.' });
  }

  // Пересчитываем по актуальному каталогу — не доверяем ценам из браузера
  const products = await readJson(path.join(DATA, 'products.json'), []);
  const byId = new Map(products.map((p) => [p.id, p]));
  let total = 0;
  let unknown = 0;
  const items = [];
  for (const it of body.items) {
    const p = byId.get(String(it.id));
    const qty = Math.min(100, Math.max(0, Number(it.qty) || 0));
    if (!p || !qty) continue;
    const est = lineEstimate(p, qty);
    if (est == null) unknown++; else total += est;
    items.push({ id: p.id, name: p.name, qty, qtyText: qtyText(p, qty), estimate: est == null ? null : Math.round(est) });
  }
  if (!items.length) return send(res, 400, { ok: false, error: 'Товары из корзины не найдены в каталоге. Обновите страницу.' });

  const order = {
    id: `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex')}`,
    createdAt: new Date().toISOString(),
    name,
    phone,
    date: clean(body.date, 20),
    comment: clean(body.comment, 1000),
    items,
    total: Math.round(total),
    hasUnknownPrices: unknown > 0,
    ip,
  };
  await appendLog(path.join(STORAGE, 'orders.json'), order);

  const lines = items.map((i) => `• ${i.name} — ${i.qtyText}${i.estimate != null ? ` (≈ ${rub(i.estimate)})` : ' (цена по запросу)'}`);
  const totalLine = `Итого ≈ ${rub(order.total)}${order.hasUnknownPrices ? ' + позиции с ценой по запросу' : ''}`;
  const delivered = await notifyOwner({
    subject: `Новая заявка ${order.id} — ${name}, ${phone}`,
    html: [
      `<b>🛒 Новая заявка ${order.id}</b>`,
      '',
      ...lines.map(esc),
      `<b>${esc(totalLine)}</b>`,
      '',
      `👤 ${esc(name)}`,
      `📞 <a href="tel:${phone}">${phone}</a>`,
      order.date ? `📅 Желаемая дата: ${esc(order.date)}` : null,
      order.comment ? `💬 ${esc(order.comment)}` : null,
    ].filter((l) => l !== null).join('\n'),
    text: [`Заявка ${order.id}`, '', ...lines, totalLine, '', `Имя: ${name}`, `Телефон: ${phone}`, order.date ? `Дата: ${order.date}` : '', order.comment ? `Комментарий: ${order.comment}` : ''].join('\n'),
  });
  if (delivered === false) {
    return send(res, 502, { ok: false, error: 'Заявка сохранена, но уведомление не дошло.' });
  }
  log('Заявка', order.id, name, phone, `${items.length} поз.`);
  send(res, 200, { ok: true, id: order.id });
}

async function handleContact(req, res) {
  const ip = clientIp(req);
  if (rateLimited(`contact:${ip}`, 3, 10 * 60_000)) return send(res, 429, { ok: false, error: 'Слишком много сообщений подряд.' });
  const body = await readBody(req);
  if (antiSpam(body)) return send(res, 200, { ok: true });
  const name = clean(body.name, 60);
  const phone = validPhone(body.phone);
  const message = clean(body.message, 2000);
  if (name.length < 2 || !phone || message.length < 3) return send(res, 400, { ok: false, error: 'Заполните имя, телефон и сообщение.' });
  if (!body.consent) return send(res, 400, { ok: false, error: 'Нужно согласие на обработку данных.' });
  const entry = { createdAt: new Date().toISOString(), type: 'contact', name, phone, message, ip };
  await appendLog(path.join(STORAGE, 'messages.json'), entry);
  const delivered = await notifyOwner({
    subject: `Сообщение с сайта — ${name}, ${phone}`,
    html: `<b>✉️ Сообщение с сайта</b>\n\n${esc(message)}\n\n👤 ${esc(name)}\n📞 <a href="tel:${phone}">${phone}</a>`,
    text: `${message}\n\nИмя: ${name}\nТелефон: ${phone}`,
  });
  if (delivered === false) return send(res, 502, { ok: false, error: 'Не удалось доставить сообщение.' });
  send(res, 200, { ok: true });
}

/* Журнал поиска копится в памяти и сбрасывается на диск раз в 10 секунд */
const SEARCH_FILE = path.join(STORAGE, 'searches.json');
const searchLog = await readJson(SEARCH_FILE, { queries: {}, misses: {}, clicks: {} });
let searchDirty = false;
setInterval(async () => {
  if (!searchDirty) return;
  searchDirty = false;
  await writeJson(SEARCH_FILE, searchLog).catch((e) => log('searches.json:', e.message));
}, 10_000).unref();

function bump(map, key, extra = {}) {
  const keys = Object.keys(map);
  if (!map[key] && keys.length >= 3000) return; // защита от разрастания
  map[key] = { ...(map[key] || {}), ...extra, count: (map[key]?.count || 0) + 1, last: new Date().toISOString() };
}

async function handleTrack(req, res) {
  const ip = clientIp(req);
  if (rateLimited(`track:${ip}`, 60, 60_000)) return send(res, 204, '');
  const body = await readBody(req, 4096).catch(() => ({}));
  const q = clean(body.q, 80).toLowerCase();
  if (q.length >= 2) {
    if (body.type === 'search') bump(searchLog.queries, q, { results: Number(body.n) || 0 });
    if (body.type === 'search_miss') { bump(searchLog.misses, q); bump(searchLog.queries, q, { results: 0 }); }
    if (body.type === 'search_click') bump(searchLog.clicks, `${q} → ${clean(body.id, 80)}`);
    searchDirty = true;
  }
  send(res, 204, '');
}

/* ======================================================================
   Админка: вход по паролю, редактирование данных, пересборка сайта
   ====================================================================== */
function checkAuth(req, res) {
  const pass = env.ADMIN_PASSWORD;
  if (!pass) {
    send(res, 503, 'Админка выключена: задайте ADMIN_PASSWORD в файле .env и перезапустите сервер.');
    return false;
  }
  const user = env.ADMIN_USER || 'admin';
  const [scheme, encoded] = String(req.headers.authorization || '').split(' ');
  const [u, p] = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString('utf8').split(/:(.*)/s) : [];
  const ok = (a, b) => {
    const x = Buffer.from(String(a || ''));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  };
  if (ok(u, user) && ok(p, pass)) return true;
  if (rateLimited(`auth:${clientIp(req)}`, 10, 10 * 60_000)) {
    send(res, 429, 'Слишком много попыток входа. Подождите 10 минут.');
    return false;
  }
  send(res, 401, 'Нужен вход', { 'www-authenticate': 'Basic realm="Vkus i Delo admin", charset="UTF-8"' });
  return false;
}

const build = { state: 'idle', startedAt: null, finishedAt: null, log: '' };

function startBuild() {
  if (build.state === 'running') return false;
  const outName = `dist-${Date.now()}`;
  Object.assign(build, { state: 'running', startedAt: new Date().toISOString(), finishedAt: null, log: '' });
  const astroBin = path.join(ROOT, 'node_modules', 'astro', 'astro.js');
  const child = spawn(process.execPath, [astroBin, 'build'], {
    cwd: ROOT,
    env: { ...env, ASTRO_OUT_DIR: `./${outName}`, ASTRO_TELEMETRY_DISABLED: '1' },
  });
  const onData = (d) => { build.log = (build.log + d.toString()).slice(-8000); };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('close', async (code) => {
    build.finishedAt = new Date().toISOString();
    if (code === 0 && existsSync(path.join(ROOT, outName, 'index.html'))) {
      distDir = path.join(ROOT, outName);
      gzCache.clear();
      await writeFile(POINTER, outName, 'utf8');
      build.state = 'done';
      log('Сайт пересобран:', outName);
      // старые версии удаляем чуть позже — вдруг их ещё кто-то докачивает
      setTimeout(() => cleanupDists(outName).catch(() => {}), 60_000);
    } else {
      build.state = 'error';
      log('Ошибка сборки, код', code);
      rm(path.join(ROOT, outName), { recursive: true, force: true }).catch(() => {});
    }
  });
  return true;
}

async function cleanupDists(keep) {
  for (const name of await readdir(ROOT)) {
    if (/^dist-\d+$/.test(name) && name !== keep) await rm(path.join(ROOT, name), { recursive: true, force: true });
  }
}

/** Проверка товаров перед сохранением: обязательные поля и уникальные id */
function validateProducts(list) {
  if (!Array.isArray(list)) return 'Ожидался список товаров';
  const ids = new Set();
  for (const p of list) {
    if (!p || typeof p !== 'object') return 'Пустой товар';
    if (!/^[a-z0-9-]{2,80}$/.test(p.id || '')) return `Неверный адрес (id) у «${p.name || '?'}»: только латиница, цифры и дефис`;
    if (ids.has(p.id)) return `Повторяется id «${p.id}»`;
    ids.add(p.id);
    if (!clean(p.name)) return `У товара ${p.id} нет названия`;
    if (!['in_stock', 'soon', 'preorder'].includes(p.status)) return `Неверный статус у «${p.name}»`;
    if (p.price != null && !(Number(p.price) >= 0)) return `Неверная цена у «${p.name}»`;
  }
  return null;
}

async function handleUpload(req, res) {
  const body = await readBody(req, 20 * 1024 * 1024);
  const m = /^data:image\/(png|jpe?g|webp|avif|gif|heic|heif);base64,(.+)$/s.exec(String(body.dataUrl || ''));
  if (!m) return send(res, 400, { ok: false, error: 'Поддерживаются фото JPG, PNG, WebP, AVIF' });
  const base = String(body.name || 'photo').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'photo';
  const kind = body.kind === 'hero' ? 'hero' : 'products';
  const dir = path.join(PUBLIC, 'images', kind);
  await mkdir(dir, { recursive: true });
  const file = `${base}-${Date.now().toString(36)}.webp`;
  const { default: sharp } = await import('sharp');
  await sharp(Buffer.from(m[2], 'base64'))
    .rotate()
    .resize({ width: kind === 'hero' ? 2000 : 1400, height: kind === 'hero' ? 1400 : 1400, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(path.join(dir, file));
  send(res, 200, { ok: true, url: `/images/${kind}/${file}` });
}

async function handleAdminApi(req, res, url) {
  const route = `${req.method} ${url.pathname.replace('/api/admin', '')}`;
  const files = {
    products: path.join(DATA, 'products.json'),
    site: path.join(DATA, 'site.json'),
    categories: path.join(DATA, 'categories.json'),
    synonyms: path.join(DATA, 'synonyms.json'),
  };
  switch (route) {
    case 'GET /data':
      return send(res, 200, {
        products: await readJson(files.products, []),
        site: await readJson(files.site, {}),
        categories: await readJson(files.categories, []),
        synonyms: await readJson(files.synonyms, {}),
      });
    case 'PUT /products': {
      const list = await readBody(req, 2 * 1024 * 1024);
      const err = validateProducts(list);
      if (err) return send(res, 400, { ok: false, error: err });
      await writeJson(files.products, list);
      return send(res, 200, { ok: true });
    }
    case 'PUT /site': {
      const s = await readBody(req, 512 * 1024);
      if (!s || typeof s !== 'object' || !s.name) return send(res, 400, { ok: false, error: 'Некорректные настройки' });
      await writeJson(files.site, s);
      return send(res, 200, { ok: true });
    }
    case 'PUT /synonyms': {
      const s = await readBody(req, 512 * 1024);
      if (!Array.isArray(s.groups) || typeof s.oneWay !== 'object') return send(res, 400, { ok: false, error: 'Некорректный словарь' });
      await writeJson(files.synonyms, s);
      return send(res, 200, { ok: true });
    }
    case 'POST /upload':
      return handleUpload(req, res);
    case 'GET /orders':
      return send(res, 200, (await readJson(path.join(STORAGE, 'orders.json'), [])).reverse());
    case 'GET /messages':
      return send(res, 200, (await readJson(path.join(STORAGE, 'messages.json'), [])).reverse());
    case 'GET /searches':
      return send(res, 200, searchLog);
    case 'POST /build':
      return send(res, 200, { ok: startBuild(), build });
    case 'GET /build':
      return send(res, 200, build);
    default:
      return send(res, 404, { ok: false, error: 'Нет такого метода' });
  }
}

/* ======================================================================
   Статика: собранный сайт
   ====================================================================== */
/** Какую сборку отдавать: из админки (storage/current-dist.txt) или dist/ — берём более свежую */
function pickDist() {
  const candidates = [path.join(ROOT, 'dist')];
  if (existsSync(POINTER)) candidates.push(path.join(ROOT, readFileSync(POINTER, 'utf8').trim()));
  return candidates
    .filter((d) => existsSync(path.join(d, 'index.html')))
    .sort((a, b) => statSync(path.join(b, 'index.html')).mtimeMs - statSync(path.join(a, 'index.html')).mtimeMs)[0];
}

let distDir = pickDist();
if (!distDir) {
  console.error('Не найдена собранная версия сайта. Сначала выполните: npm run build');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.xml', '.txt', '.svg', '.webmanifest']);
const gzCache = new Map();

async function resolveFile(base, pathname) {
  const rel = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  if (rel.startsWith('..')) return null;
  const full = path.join(base, rel);
  if (!full.startsWith(base)) return null;
  const tries = path.extname(full) ? [full] : [`${full}.html`, path.join(full, 'index.html')];
  for (const f of tries) {
    try {
      const s = await stat(f);
      if (s.isFile()) return { file: f, size: s.size, mtime: s.mtimeMs };
    } catch {}
  }
  return null;
}

async function serveStatic(req, res, url, status = 200) {
  let { pathname } = url;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    res.writeHead(301, { location: pathname.replace(/\/+$/, '') + url.search });
    return res.end();
  }
  if (pathname === '/') pathname = '/index';
  let found = await resolveFile(distDir, pathname);
  // свежезагруженные через админку фото доступны сразу, ещё до пересборки
  if (!found && pathname.startsWith('/images/')) found = await resolveFile(PUBLIC, pathname);
  if (!found) {
    const nf = await resolveFile(distDir, '/404.html');
    if (nf && status !== 404) return sendFile(req, res, nf, 404);
    return send(res, 404, 'Not found');
  }
  return sendFile(req, res, found, status, pathname);
}

async function sendFile(req, res, { file, mtime }, status, pathname = '') {
  const ext = path.extname(file).toLowerCase();
  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'SAMEORIGIN',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'cache-control': pathname.startsWith('/_astro/')
      ? 'public, max-age=31536000, immutable'
      : ext === '.html' || ext === '.json' ? 'no-cache' : 'public, max-age=86400',
  };
  if (env.FORCE_HTTPS === '1') headers['strict-transport-security'] = 'max-age=31536000';

  let body = await readFile(file);
  if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    const key = `${file}:${mtime}`;
    if (!gzCache.has(key)) gzCache.set(key, zlib.gzipSync(body, { level: 9 }));
    body = gzCache.get(key);
    headers['content-encoding'] = 'gzip';
    headers.vary = 'Accept-Encoding';
  }
  headers['content-length'] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

/* ======================================================================
   Маршрутизация
   ====================================================================== */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (env.FORCE_HTTPS === '1' && req.headers['x-forwarded-proto'] === 'http') {
      res.writeHead(301, { location: `https://${req.headers.host}${req.url}` });
      return res.end();
    }
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'POST' && url.pathname === '/api/order') return await handleOrder(req, res);
      if (req.method === 'POST' && url.pathname === '/api/contact') return await handleContact(req, res);
      if (req.method === 'POST' && url.pathname === '/api/track') return await handleTrack(req, res);
      if (url.pathname.startsWith('/api/admin/')) {
        if (!checkAuth(req, res)) return;
        return await handleAdminApi(req, res, url);
      }
      return send(res, 404, { ok: false, error: 'Not found' });
    }
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      if (!checkAuth(req, res)) return;
      const name = url.pathname === '/admin' || url.pathname === '/admin/' ? 'index.html' : url.pathname.slice(7);
      const found = await resolveFile(ADMIN_DIR, `/${name}`);
      return found ? sendFile(req, res, found, 200) : send(res, 404, 'Not found');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return await serveStatic(req, res, url);
  } catch (e) {
    log('Ошибка запроса', req.method, url.pathname, e.message);
    if (!res.headersSent) send(res, e.status || 500, { ok: false, error: e.status ? e.message : 'Внутренняя ошибка сервера' });
  }
});

server.listen(PORT, HOST, () => {
  log(`«Вкус и Дело» работает: http://localhost:${PORT}  (сайт: ${path.basename(distDir)})`);
  if (!env.TELEGRAM_BOT_TOKEN && !env.SMTP_HOST) log('Подсказка: настройте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env, чтобы получать заявки.');
  if (!env.ADMIN_PASSWORD) log('Подсказка: задайте ADMIN_PASSWORD в .env, чтобы включить админку /admin.');
});

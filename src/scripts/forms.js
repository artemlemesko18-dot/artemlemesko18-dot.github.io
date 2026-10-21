/** Маска телефона +7 и форма обратной связи на странице «Контакты». */
import { goal } from './analytics.js';

function formatPhone(raw) {
  let d = raw.replace(/\D/g, '');
  // «+7…» или привычная «8…» в начале — это код страны
  if (raw.trim().startsWith('+7') || /^[78]/.test(d)) d = d.slice(1);
  d = d.slice(0, 10);
  if (!d) return '';
  let s = `+7 (${d.slice(0, 3)}`;
  if (d.length >= 3) s += ')';
  if (d.length > 3) s += ` ${d.slice(3, 6)}`;
  if (d.length > 6) s += `-${d.slice(6, 8)}`;
  if (d.length > 8) s += `-${d.slice(8, 10)}`;
  return s;
}

export function initPhoneMasks() {
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.matches?.('[data-phone-mask]')) return;
    if (e.inputType && e.inputType.startsWith('delete')) return; // не мешаем стирать
    el.value = formatPhone(el.value);
  });
  document.addEventListener('blur', (e) => {
    const el = e.target;
    if (el.matches?.('[data-phone-mask]')) el.value = formatPhone(el.value);
  }, true);
}

export function initContactForm() {
  const form = document.querySelector('[data-contact-form]');
  if (!form) return;
  const started = Date.now();
  const status = form.querySelector('[data-form-status]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.startedAt = started;
    payload.consent = !!form.elements.consent.checked;
    status.hidden = false;
    status.className = 'field-error';
    if (String(payload.name || '').trim().length < 2) { status.textContent = 'Как к вам обращаться?'; return; }
    if (String(payload.phone || '').replace(/\D/g, '').length !== 11) { status.textContent = 'Проверьте номер телефона.'; return; }
    if (String(payload.message || '').trim().length < 3) { status.textContent = 'Напишите пару слов о вопросе.'; return; }
    if (!payload.consent) { status.textContent = 'Нужно согласие на обработку персональных данных.'; return; }

    // GitHub Pages: сервера нет — открываем Telegram с готовым сообщением
    if (document.documentElement.dataset.static === '1') {
      const text = `${String(payload.message).trim()}\n\nИмя: ${String(payload.name).trim()}\nТелефон: ${payload.phone}`;
      const url = `https://t.me/${form.dataset.tg}?text=${encodeURIComponent(text)}`;
      if (!window.open(url, '_blank')) location.href = url;
      goal('contact_submit', { via: 'telegram' });
      status.className = 'note';
      status.textContent = 'Сообщение открылось в Telegram — нажмите там «Отправить».';
      return;
    }

    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || 'Ошибка');
      goal('contact_submit');
      form.reset();
      status.className = 'note';
      status.textContent = 'Спасибо! Сообщение отправлено — отвечу в ближайшее время.';
    } catch (err) {
      status.innerHTML = `Не получилось отправить. Напишите, пожалуйста, в <a href="https://t.me/${form.dataset.tg}" target="_blank" rel="noopener">Telegram</a> или позвоните.`;
    } finally {
      btn.disabled = false;
    }
  });
}

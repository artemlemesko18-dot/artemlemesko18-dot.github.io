/**
 * Набор линейных иконок Lucide (lucide.dev). Импортируем по одной — в сборку
 * попадают только используемые. Чтобы добавить иконку: импорт + строка в ICONS.
 */
import search from 'lucide-static/dist/esm/icons/search.js';
import bag from 'lucide-static/dist/esm/icons/shopping-bag.js';
import phone from 'lucide-static/dist/esm/icons/phone.js';
import send from 'lucide-static/dist/esm/icons/send.js';
import menu from 'lucide-static/dist/esm/icons/menu.js';
import x from 'lucide-static/dist/esm/icons/x.js';
import sun from 'lucide-static/dist/esm/icons/sun.js';
import moon from 'lucide-static/dist/esm/icons/moon.js';
import plus from 'lucide-static/dist/esm/icons/plus.js';
import minus from 'lucide-static/dist/esm/icons/minus.js';
import arrowRight from 'lucide-static/dist/esm/icons/arrow-right.js';
import arrowUpRight from 'lucide-static/dist/esm/icons/arrow-up-right.js';
import flame from 'lucide-static/dist/esm/icons/flame.js';
import leaf from 'lucide-static/dist/esm/icons/leaf.js';
import chefHat from 'lucide-static/dist/esm/icons/chef-hat.js';
import pkg from 'lucide-static/dist/esm/icons/package.js';
import calendar from 'lucide-static/dist/esm/icons/calendar-days.js';
import clock from 'lucide-static/dist/esm/icons/clock.js';
import check from 'lucide-static/dist/esm/icons/check.js';
import sparkles from 'lucide-static/dist/esm/icons/sparkles.js';
import mapPin from 'lucide-static/dist/esm/icons/map-pin.js';
import message from 'lucide-static/dist/esm/icons/message-circle.js';
import trash from 'lucide-static/dist/esm/icons/trash-2.js';
import sliders from 'lucide-static/dist/esm/icons/sliders-horizontal.js';
import chevronDown from 'lucide-static/dist/esm/icons/chevron-down.js';
import chevronRight from 'lucide-static/dist/esm/icons/chevron-right.js';
import history from 'lucide-static/dist/esm/icons/history.js';
import trending from 'lucide-static/dist/esm/icons/trending-up.js';
import info from 'lucide-static/dist/esm/icons/info.js';
import scale from 'lucide-static/dist/esm/icons/scale.js';
import handHeart from 'lucide-static/dist/esm/icons/hand-heart.js';
import enter from 'lucide-static/dist/esm/icons/corner-down-left.js';
import searchX from 'lucide-static/dist/esm/icons/search-x.js';
import badgeCheck from 'lucide-static/dist/esm/icons/badge-check.js';
import hourglass from 'lucide-static/dist/esm/icons/hourglass.js';
import circleCheck from 'lucide-static/dist/esm/icons/circle-check.js';
import listChecks from 'lucide-static/dist/esm/icons/list-checks.js';
import users from 'lucide-static/dist/esm/icons/users.js';
import house from 'lucide-static/dist/esm/icons/house.js';
import utensils from 'lucide-static/dist/esm/icons/utensils.js';
import bell from 'lucide-static/dist/esm/icons/bell.js';
import copy from 'lucide-static/dist/esm/icons/copy.js';
import mail from 'lucide-static/dist/esm/icons/mail.js';

const RAW = {
  search, bag, phone, send, menu, x, sun, moon, plus, minus, arrowRight, arrowUpRight, flame, leaf,
  chefHat, pkg, calendar, clock, check, sparkles, mapPin, message, trash, sliders, chevronDown,
  chevronRight, history, trending, info, scale, handHeart, enter, searchX, badgeCheck, hourglass,
  circleCheck, listChecks, users, house, utensils, bell, copy, mail,
};

/** Чистим SVG от лишнего и делаем линии тоньше — так иконки выглядят аккуратнее. */
const ICONS = Object.fromEntries(
  Object.entries(RAW).map(([k, svg]) => [
    k,
    svg
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s*\n\s*/g, ' ')
      .replace(/class="[^"]*"/, '')
      .replace(/width="24"\s+height="24"/, '')
      .replace('stroke-width="2"', 'stroke-width="1.75"')
      .replace('<svg', '<svg aria-hidden="true" focusable="false" class="icon"')
      .trim(),
  ]),
);

export function icon(name) {
  return ICONS[name] || '';
}

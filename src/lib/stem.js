/**
 * Компактный стеммер Портера для русского языка (алгоритм Snowball).
 * Приводит слово к основе: «колбаски» → «колбаск», «копчёная» → «копчен».
 * Без lookbehind в регулярках — чтобы работать и в старых Safari.
 */

const VOWEL = /[аеиоуыэюя]/;

const GERUND_1 = /(ившись|ывшись|ивши|ывши|ив|ыв)$/;
const GERUND_2 = /([ая])(вшись|вши|в)$/;
const REFLEXIVE = /(ся|сь)$/;
const ADJECTIVE = /(ими|ыми|его|ого|ему|ому|ее|ие|ые|ое|ей|ий|ый|ой|ем|им|ым|ом|их|ых|ую|юю|ая|яя|ою|ею)$/;
const PARTICIPLE_1 = /(ивш|ывш|ующ)$/;
const PARTICIPLE_2 = /([ая])(ем|нн|вш|ющ|щ)$/;
const VERB_1 = /(ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю)$/;
const VERB_2 = /([ая])(ла|на|ете|йте|ли|й|л|ем|н|ло|но|ет|ют|ны|ть|ешь|нно)$/;
const NOUN = /(иями|ями|ами|иях|ией|иям|ием|ев|ов|ие|ье|еи|ии|ей|ой|ий|ям|ем|ам|ом|ах|ях|ию|ью|ия|ья|а|е|и|й|о|у|ы|ь|ю|я)$/;
const SUPERLATIVE = /(ейше|ейш)$/;
const DERIVATIONAL = /(ость|ост)$/;

/** Заменяет окончание; возвращает null, если ничего не изменилось. */
function strip(word, re, keepGroup = false) {
  const next = word.replace(re, keepGroup ? '$1' : '');
  return next === word ? null : next;
}

/** R2 по Snowball: область после второй пары «гласная+согласная». */
function r2Start(word) {
  let found = 0;
  for (let i = 1; i < word.length; i++) {
    if (!VOWEL.test(word[i]) && VOWEL.test(word[i - 1])) {
      found++;
      if (found === 2) return i + 1;
    }
  }
  return word.length;
}

export function stem(input) {
  const word = input.toLowerCase().replace(/ё/g, 'е');
  if (word.length < 3 || !/^[а-я]+$/.test(word)) return word;

  // RV — часть слова после первой гласной
  const m = /^(.*?[аеиоуыэюя])(.*)$/.exec(word);
  if (!m || !m[2]) return word;
  const head = m[1];
  let rv = m[2];

  // Шаг 1
  let next = strip(rv, GERUND_1) ?? strip(rv, GERUND_2, true);
  if (next !== null) {
    rv = next;
  } else {
    rv = strip(rv, REFLEXIVE) ?? rv;
    next = strip(rv, ADJECTIVE);
    if (next !== null) {
      rv = strip(next, PARTICIPLE_1) ?? strip(next, PARTICIPLE_2, true) ?? next;
    } else {
      next = strip(rv, VERB_1) ?? strip(rv, VERB_2, true);
      rv = next ?? strip(rv, NOUN) ?? rv;
    }
  }

  // Шаг 2
  rv = strip(rv, /и$/) ?? rv;

  // Шаг 3: словообразовательный суффикс -ость в R2
  const full = head + rv;
  if (DERIVATIONAL.test(full) && full.length - full.match(DERIVATIONAL)[0].length >= r2Start(full)) {
    rv = rv.replace(DERIVATIONAL, '');
  }

  // Шаг 4
  next = strip(rv, /ь$/);
  if (next !== null) {
    rv = next;
  } else {
    rv = strip(rv, SUPERLATIVE) ?? rv;
    rv = rv.replace(/нн$/, 'н');
  }

  return head + rv;
}

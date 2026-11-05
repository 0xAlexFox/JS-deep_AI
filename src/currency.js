import { RATES_BASE_CURRENCY } from './config.js';
import { normalizeCurrency } from './money.js';

// Любой курс в таблице означает количество единиц валюты за 1 USD.
function getBaseRate(currency, rates) {
  if (currency === RATES_BASE_CURRENCY) return 1;
  const rate = rates?.[currency];
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Нет корректного курса для валюты ${currency}.`);
  }
  return rate;
}

// Кросс-курс для таблицы интерфейса: сколько целевой валюты за 1 исходную.
export function getExchangeRate(fromCurrency, toCurrency, rates) {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  if (from === to) return 1;
  const rate = getBaseRate(to, rates) / getBaseRate(from, rates);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Некорректный курс ${from} → ${to}.`);
  }
  return rate;
}

// Превращаем десятичную запись курса в точную дробь из целых чисел.
// Например, 0.145 -> 145 / 1000. BigInt — целое число без погрешности Number.
// Поддерживаем и научную запись, например 5e-7, которую может вернуть toString.
function rateFraction(value) {
  const [coefficient, exponent = '0'] = value.toString().split('e');
  const [whole, fraction = ''] = coefficient.split('.');
  const digits = BigInt(whole + fraction);
  const scale = fraction.length - Number(exponent);
  return scale >= 0
    ? { numerator: digits, denominator: 10n ** BigInt(scale) }
    : { numerator: digits * 10n ** BigInt(-scale), denominator: 1n };
}

// Сумма уже в целых сотых долях одной валюты. Промежуточный результат в USD
// НЕ округляем: единственное округление выполняется после перевода в цель.
export function convertCurrencyCents(amountCents, fromCurrency, toCurrency, rates) {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new Error('Для конвертации нужна безопасная неотрицательная сумма в сотых долях.');
  }
  if (from === to || amountCents === 0) return amountCents;

  // Сначала делим на курс исходной валюты, затем умножаем на курс целевой.
  // Например, 100 USD при EUR=0.8 станут 80 EUR;
  // 100 EUR при EUR=0.8 и GBP=0.5 станут 62.50 GBP.
  const sourceRate = rateFraction(getBaseRate(from, rates));
  const targetRate = rateFraction(getBaseRate(to, rates));
  const numerator = BigInt(amountCents) * targetRate.numerator * sourceRate.denominator;
  const denominator = targetRate.denominator * sourceRate.numerator;
  // Округление положительной дроби до ближайшего целого, половина — вверх.
  // Целочисленная формула не превращает условные 14.5 в 14.499999999999998.
  const converted = (2n * numerator + denominator) / (2n * denominator);
  if (converted > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Сумма после конвертации ${from} в ${to} слишком велика.`);
  }
  return Number(converted);
}

// Прежний частный случай остаётся доступным, но теперь использует общую формулу.
export function convertToUsdCents(amountCents, currency, rates) {
  return convertCurrencyCents(amountCents, currency, RATES_BASE_CURRENCY, rates);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { getExchangeRate, convertCurrencyCents } from '../src/domain/currency.js';
import { calculateDailyRevenue } from '../src/domain/revenue.js';

const source1 = { transactions: [{ type: 'paid', amount: 100, currency: 'USD' }] };
const source2 = ['300 EUR', '50 GBP', '400 AED'];
const rates = { USD: 1, EUR: 0.8, GBP: 0.5, AED: 4 };

for (const [currency, total] of [['USD', 675], ['EUR', 540], ['GBP', 337.5], ['AED', 2700]]) {
  test(`Четыре исходные валюты пересчитываются в ${currency}`, () => {
    assert.deepEqual(calculateDailyRevenue(source1, source2, rates, currency), { total, currency });
  });
}

test('Кросс-курсы работают в обоих направлениях и нормализуют регистр', () => {
  assert.equal(getExchangeRate('USD', 'eur', rates), 0.8);
  assert.equal(getExchangeRate('EUR', 'USD', rates), 1.25);
  assert.equal(getExchangeRate('EUR', 'GBP', rates), 0.625);
  assert.equal(getExchangeRate('GBP', 'EUR', rates), 1.6);
});

test('Своя валюта не требует конвертации или наличия курса', () => {
  assert.equal(getExchangeRate('EUR', 'EUR', {}), 1);
  assert.equal(convertCurrencyCents(12345, 'eur', 'EUR', {}), 12345);
});

test('Промежуточная сумма в USD не округляется', () => {
  assert.equal(convertCurrencyCents(1, 'EUR', 'GBP', { EUR: 3, GBP: 2 }), 1);
});

test('Половина сотой доли округляется вверх без погрешности плавающей точки', () => {
  assert.equal(convertCurrencyCents(100, 'USD', 'EUR', { EUR: 0.145 }), 15);
  assert.equal(convertCurrencyCents(100, 'USD', 'EUR', { EUR: 0.1449999999999999 }), 14);
});

test('Точное округление сохраняет границу безопасных целых чисел', () => {
  assert.equal(convertCurrencyCents(Number.MAX_SAFE_INTEGER, 'USD', 'EUR', { EUR: 1 }), Number.MAX_SAFE_INTEGER);
});

test('Поддерживаются курсы в научной записи', () => {
  assert.equal(convertCurrencyCents(10000000, 'USD', 'EUR', { EUR: 5e-7 }), 5);
});

test('Пустая выручка и нулевые продажи поддерживают выбранную цель', () => {
  assert.deepEqual(calculateDailyRevenue({ transactions: [] }, [], {}, 'eur'), {
    total: 0, currency: 'EUR',
  });
  assert.equal(convertCurrencyCents(0, 'ZZZ', 'EUR', {}), 0);
});

for (const targetRate of [undefined, 0, -1, Infinity, NaN, '0.8']) {
  test(`Некорректный курс целевой валюты отклоняется: ${String(targetRate)}`, () => {
    assert.throws(() => calculateDailyRevenue({ transactions: [] }, ['100 USD'], {
      EUR: targetRate,
    }, 'EUR'), /курса.*EUR/);
  });
}

test('Переполнение после перевода в другую цель отклоняется', () => {
  assert.throws(() => convertCurrencyCents(Number.MAX_SAFE_INTEGER, 'USD', 'EUR', {
    EUR: 2,
  }), /после конвертации/);
});

test('Сумма в сотых долях и код цели проверяются', () => {
  assert.throws(() => convertCurrencyCents(-1, 'USD', 'EUR', rates), /неотрицательная/);
  assert.throws(() => convertCurrencyCents(1.5, 'USD', 'EUR', rates), /сотых долях/);
  assert.throws(() => calculateDailyRevenue(source1, source2, rates, 'EU'), /трёхбуквенным кодом/);
});

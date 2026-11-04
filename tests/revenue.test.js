import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDailyRevenue, calculateRevenueByCurrency } from '../src/revenue.js';

const emptySource = { transactions: [] };
const paid = (amount, currency = 'USD') => ({ type: 'paid', amount, currency });

// Только тесты используют фиксированные данные. Приложение берёт их с серверов.
const serverSource1 = {
  transactions: [
    paid(100), { type: 'pending', amount: 50, currency: 'USD' },
    paid(880), paid(130), { type: 'rejected', amount: 560, currency: 'USD' },
    paid(230, 'EUR'), paid(530, 'EUR'),
    { type: 'rejected', amount: 430, currency: 'EUR' },
  ],
};
const serverSource2 = [
  '300 usd', '200 eur', '150 usd', '200 usd', '450 eur',
  '400 usd', '670 usd', '190 usd', '500 eur',
];

test('Данные предыдущего задания: 2160 USD', () => {
  assert.deepEqual(calculateDailyRevenue({ transactions: [
    paid(100), { type: 'pending', amount: 50 }, paid(880), paid(130),
    { type: 'rejected', amount: 560 },
  ] }, ['300 USD', '150 USD', '200 USD', '400 USD']), {
    total: 2160, currency: 'USD',
  });
});

test('Новые данные: валюты не смешиваются до конвертации', () => {
  assert.deepEqual(calculateRevenueByCurrency(serverSource1, serverSource2), {
    USD: 3020, EUR: 1910,
  });
});

test('Новые данные: все оплаченные продажи пересчитываются в USD', () => {
  // Курс здесь намеренно фиксирован: тест должен давать одинаковый ответ каждый день.
  assert.deepEqual(calculateDailyRevenue(serverSource1, serverSource2, { EUR: 0.8 }), {
    total: 5407.5, currency: 'USD',
  });
});

test('300 EUR при курсе 0.8 EUR за доллар превращаются в 375 USD', () => {
  assert.deepEqual(calculateDailyRevenue(emptySource, ['300 eur'], { EUR: 0.8 }), {
    total: 375, currency: 'USD',
  });
});

test('Поддерживаются другие валюты, если сервис предоставил их курсы', () => {
  assert.deepEqual(calculateDailyRevenue({ transactions: [paid(100)] }, [
    '300 EUR', '100 GBP', '10000 JPY',
  ], { EUR: 0.8, GBP: 0.5, JPY: 100 }), { total: 775, currency: 'USD' });
});

test('Пустые источники возвращают 0 USD', () => {
  assert.deepEqual(calculateDailyRevenue(emptySource, []), { total: 0, currency: 'USD' });
  assert.deepEqual(calculateRevenueByCurrency(emptySource, []), {});
});

test('Неоплаченные транзакции не требуют корректной суммы, валюты или курса', () => {
  assert.deepEqual(calculateDailyRevenue({ transactions: [
    { type: 'pending', amount: 'bad', currency: 'ZZZ' },
    { type: 'rejected', amount: -5, currency: null },
  ] }, ['100 usd']), { total: 100, currency: 'USD' });
});

test('Один источник, лишние пробелы и разный регистр валют', () => {
  assert.deepEqual(calculateDailyRevenue(emptySource, [' 12.50   eUr ', '7.25 EUR'], {
    EUR: 0.5,
  }), { total: 39.5, currency: 'USD' });
  assert.deepEqual(calculateDailyRevenue({ transactions: [paid(75, ' usd ')] }, []), {
    total: 75, currency: 'USD',
  });
});

test('Нулевые продажи не требуют курса', () => {
  assert.deepEqual(calculateDailyRevenue({ transactions: [paid(0, 'EUR')] }, ['0 GBP']), {
    total: 0, currency: 'USD',
  });
});

test('Дроби и погрешность умножения не накапливаются в сумме', () => {
  assert.deepEqual(calculateDailyRevenue({ transactions: [paid(0.1)] }, ['0.20 USD']), {
    total: 0.3, currency: 'USD',
  });
  assert.deepEqual(calculateDailyRevenue(emptySource, ['0.29 USD', '0.01 USD']), {
    total: 0.3, currency: 'USD',
  });
});

test('Округляется сумма валютной группы, а не каждая продажа отдельно', () => {
  assert.deepEqual(calculateDailyRevenue(emptySource, ['0.01 EUR', '0.01 eur', '0.01 EUR'], {
    EUR: 0.8,
  }), { total: 0.04, currency: 'USD' });
});

test('Расчёт не изменяет входные данные и таблицу курсов', () => {
  const before = structuredClone([serverSource1, serverSource2]);
  const rates = Object.freeze({ EUR: 0.8 });
  calculateDailyRevenue(serverSource1, serverSource2, rates);
  assert.deepEqual([serverSource1, serverSource2], before);
});

for (const [name, source1, source2, message] of [
  ['нет первого источника', null, [], /Ожидаются объект/],
  ['нет массива транзакций', {}, [], /Ожидаются объект/],
  ['второй источник не массив', emptySource, null, /Ожидаются объект/],
  ['повреждённая транзакция', { transactions: [null] }, [], /Транзакция должна быть объектом/],
  ['массив вместо транзакции', { transactions: [[]] }, [], /Транзакция должна быть объектом/],
  ['не строка', emptySource, [300], /должна быть строкой/],
  ['нет валюты', emptySource, ['300'], /Ожидается строка/],
  ['лишняя часть строки', emptySource, ['300 USD extra'], /Ожидается строка/],
  ['не число', emptySource, ['abc USD'], /десятичным числом/],
  ['шестнадцатеричная запись', emptySource, ['0x10 USD'], /десятичным числом/],
  ['экспоненциальная запись', emptySource, ['1e3 USD'], /десятичным числом/],
  ['лишние дробные знаки в строке', emptySource, ['1.234 USD'], /десятичным числом/],
  ['лишние дробные знаки в числе', { transactions: [paid(1.234)] }, [], /не более двух/],
  ['отрицательная сумма', emptySource, ['-10 USD'], /неотрицательным/],
  ['строка вместо суммы', { transactions: [paid('100')] }, [], /конечным числом/],
  ['бесконечная сумма', { transactions: [paid(Infinity)] }, [], /конечным числом/],
  ['NaN вместо суммы', { transactions: [paid(NaN)] }, [], /конечным числом/],
  ['неверный код валюты', emptySource, ['10 US'], /трёхбуквенным кодом/],
  ['слишком большая цена', { transactions: [paid(Number.MAX_VALUE)] }, [], /безопасный диапазон/],
  ['переполнение одной валюты', emptySource, ['50000000000000 USD', '50000000000000 USD'], /безопасный диапазон/],
]) {
  test(`Отклоняются некорректные данные: ${name}`, () => {
    assert.throws(() => calculateDailyRevenue(source1, source2), message);
  });
}

for (const rate of [undefined, 0, -1, NaN, Infinity, '0.8']) {
  test(`Отсутствующий или некорректный курс отклоняется: ${String(rate)}`, () => {
    assert.throws(() => calculateDailyRevenue(emptySource, ['10 EUR'], { EUR: rate }), /курса.*EUR/);
  });
}

test('Проверяется диапазон после конвертации', () => {
  assert.throws(() => calculateDailyRevenue(emptySource, ['100 EUR'], {
    EUR: Number.MIN_VALUE,
  }), /после конвертации/);
});

test('Проверяется общая сумма после объединения конвертированных валют', () => {
  assert.throws(() => calculateDailyRevenue(emptySource, [
    '50000000000000 USD', '50000000000000 EUR',
  ], { EUR: 1 }), /Общая выручка превышает/);
});

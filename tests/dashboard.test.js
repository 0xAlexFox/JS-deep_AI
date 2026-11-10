import test from 'node:test';
import assert from 'node:assert/strict';
import { watch } from 'vue';
import { loadRevenueReport } from '../src/services/reports.js';
import { useRevenueReport } from '../src/composables/useRevenueReport.js';
import { loadExchangeRates } from '../src/services/api.js';
import { RATES_URL } from '../src/config.js';

const updatedAt = '2026-11-05T00:00:00.000Z';
const ratePayload = {
  result: 'success', base_code: 'USD', rates: { USD: 1, EUR: 0.8 },
  time_last_update_unix: Date.parse(updatedAt) / 1000,
};
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });

test('Отчёт содержит общий итог, отдельные валюты, курсы и дату поставщика', async () => {
  const payloads = new Map([
    ['/api/finance1', { transactions: [
      { type: 'paid', amount: 100, currency: 'USD' },
      { type: 'pending', amount: 999, currency: 'EUR' },
    ] }],
    ['/api/finance2', ['300 eur']],
    [RATES_URL, ratePayload],
  ]);
  const report = await loadRevenueReport({ fetchImpl: async (url, options) => {
    assert.equal(options.headers['x-api-key'], undefined);
    assert.ok(payloads.has(url));
    return json(payloads.get(url));
  } });
  assert.deepEqual(report, {
    result: { total: 475, currency: 'USD' },
    totalsByCurrency: { USD: 100, EUR: 300 },
    totalsInCents: new Map([['USD', 10000], ['EUR', 30000]]),
    rates: { USD: 1, EUR: 0.8 }, updatedAt,
  });
});

test('Ошибка одного источника не превращается в частичный отчёт', async () => {
  await assert.rejects(loadRevenueReport({
    fetchImpl: async (url) => {
      if (url === '/api/finance1') return json({ transactions: [] });
      if (url === '/api/finance2') return json({}, 500);
      return json(ratePayload);
    },
  }), /HTTP 500/);
});

test('Отсутствующий курс также отклоняет отчёт целиком', async () => {
  await assert.rejects(loadRevenueReport({ fetchImpl: async (url) => {
    if (url === '/api/finance1') return json({ transactions: [{ type: 'paid', amount: 100, currency: 'USD' }] });
    if (url === '/api/finance2') return json(['300 AED']);
    return json(ratePayload);
  } }), /курса.*AED/);
});

test('Пустой отчёт остаётся корректным результатом, а не ошибкой', async () => {
  const report = await loadRevenueReport({ fetchImpl: async (url) => {
    if (url === '/api/finance1') return json({ transactions: [] });
    if (url === '/api/finance2') return json([]);
    return json(ratePayload);
  } });
  assert.deepEqual(report.result, { total: 0, currency: 'USD' });
  assert.deepEqual(report.totalsByCurrency, {});
});

test('Дата обновления берётся из Unix-времени поставщика', async () => {
  const snapshot = await loadExchangeRates({ fetchImpl: async () => json(ratePayload) });
  assert.equal(snapshot.updatedAt, updatedAt);
});

test('Поддерживается строковая дата поставщика, если Unix-время не передано', async () => {
  const { time_last_update_unix, ...payload } = ratePayload;
  const snapshot = await loadExchangeRates({ fetchImpl: async () => json({
    ...payload, time_last_update_utc: 'Thu, 05 Nov 2026 00:00:00 +0000',
  }) });
  assert.equal(snapshot.updatedAt, updatedAt);
});

for (const metadata of [{}, { time_last_update_utc: null }, { time_last_update_utc: 'bad date' },
  { time_last_update_unix: 0 }, { time_last_update_unix: 1e100 }]) {
  test(`Неверная или отсутствующая дата не заменяется выдуманной: ${JSON.stringify(metadata)}`, async () => {
    const { time_last_update_unix, ...payload } = ratePayload;
    const snapshot = await loadExchangeRates({ fetchImpl: async () => json({ ...payload, ...metadata }) });
    assert.equal(snapshot.updatedAt, null);
    assert.deepEqual(snapshot.rates, ratePayload.rates);
  });
}

// Наблюдаем за реальным реактивным состоянием Vue, без DOM и глобального fetch.
function harness(loadReport) {
  const events = [];
  const logger = {
    log: (...args) => events.push(['log', ...args]),
    error: (...args) => events.push(['console-error', ...args]),
  };
  const state = useRevenueReport({ logger, loadReport });
  watch(state.status, (status) => {
    if (status === 'loading') events.push(['loading']);
    if (status === 'ready') events.push(['ready', state.report.value]);
    if (status === 'error') events.push(['error', state.error.value]);
  }, { flush: 'sync' });
  watch(state.report, (report) => {
    if (report && state.status.value === 'ready') events.push(['ready', report]);
  }, { flush: 'sync' });
  return { events, ...state };
}
const exampleReport = {
  result: { total: 475, currency: 'USD' },
  totalsByCurrency: { USD: 100, EUR: 300 },
  totalsInCents: new Map([['USD', 10000], ['EUR', 30000]]),
  rates: { USD: 1, EUR: 0.8 }, updatedAt,
};

test('При успехе: загрузка, отрисовка результата, одна строка в консоль', async () => {
  const { events, refresh } = harness(async () => exampleReport);
  await refresh();
  assert.deepEqual(events, [
    ['loading'], ['ready', exampleReport], ['log', 'Выручка за день:', exampleReport.result],
  ]);
});

test('При ошибке показывается интерфейс ошибки без успешного результата', async () => {
  const error = new Error('Сервер недоступен');
  const { events, refresh } = harness(async () => { throw error; });
  await refresh();
  assert.deepEqual(events, [
    ['loading'], ['error', error], ['console-error', 'Не удалось рассчитать выручку за день:', error.message],
  ]);
});

test('Двойное обновление не создаёт параллельных загрузок', async () => {
  let resolve;
  let calls = 0;
  const pending = new Promise((done) => { resolve = done; });
  const { events, refresh } = harness(() => { calls += 1; return pending; });
  const first = refresh();
  await refresh();
  assert.equal(calls, 1);
  assert.deepEqual(events, [['loading']]);
  resolve(exampleReport);
  await first;
  assert.equal(events[1][0], 'ready');
});

test('После ошибки повторная попытка может успешно загрузить отчёт', async () => {
  let attempts = 0;
  const { events, refresh } = harness(async () => {
    if (++attempts === 1) throw new Error('Временная ошибка');
    return exampleReport;
  });
  await refresh();
  await refresh();
  assert.equal(attempts, 2);
  assert.deepEqual(events.map(([state]) => state), ['loading', 'error', 'console-error', 'loading', 'ready', 'log']);
});

test('Неудачное обновление после успешного отчёта тоже показывает ошибку', async () => {
  let attempts = 0;
  const { events, refresh } = harness(async () => {
    if (++attempts === 2) throw new Error('Ошибка обновления');
    return exampleReport;
  });
  await refresh();
  await refresh();
  assert.deepEqual(events.map(([state]) => state), ['loading', 'ready', 'log', 'loading', 'error', 'console-error']);
});

test('Смена USD → EUR и обратно пересчитывает отчёт без новой загрузки', async () => {
  let calls = 0;
  const { events, refresh, changeCurrency } = harness(async () => { calls += 1; return exampleReport; });
  await refresh();
  changeCurrency('eur');
  assert.deepEqual(events.at(-2)[1].result, { total: 380, currency: 'EUR' });
  assert.deepEqual(events.at(-2)[1].totalsByCurrency, { USD: 100, EUR: 300 });
  changeCurrency('USD');
  assert.deepEqual(events.at(-2)[1].result, { total: 475, currency: 'USD' });
  assert.equal(calls, 1);
});

test('Нельзя выбрать валюту без платежей, даже если её курс есть', async () => {
  const report = { ...exampleReport, rates: { ...exampleReport.rates, GBP: 0.5 } };
  const { events, refresh, changeCurrency } = harness(async () => report);
  await refresh();
  changeCurrency('GBP');
  assert.equal(events.at(-2)[0], 'error');
  assert.match(events.at(-2)[1].message, /есть в оплаченных продажах/);
  // После ошибочного выбора можно вернуться к прежней валюте без fetch.
  changeCurrency('USD');
  assert.deepEqual(events.at(-2)[1].result, { total: 475, currency: 'USD' });
});

test('Выбранная валюта сохраняется после обновления продаж', async () => {
  const requestedTargets = [];
  const { events, refresh, changeCurrency } = harness(async (target) => {
    requestedTargets.push(target);
    return exampleReport;
  });
  await refresh();
  changeCurrency('EUR');
  await refresh();
  assert.deepEqual(events.at(-2)[1].result, { total: 380, currency: 'EUR' });
  assert.deepEqual(requestedTargets, ['USD', 'EUR']);
});

test('Загрузчик сразу рассчитывает предпочтительную валюту, если она есть в продажах', async () => {
  const report = await loadRevenueReport({ fetchImpl: async (url) => {
    if (url === '/api/finance1') return json({ transactions: [{ type: 'paid', amount: 100, currency: 'USD' }] });
    if (url === '/api/finance2') return json(['300 EUR']);
    return json(ratePayload);
  } }, 'EUR');
  assert.deepEqual(report.result, { total: 380, currency: 'EUR' });
});

test('Если выбранная валюта исчезла из платежей, выбирается доступная', async () => {
  let calls = 0;
  const { events, refresh, changeCurrency } = harness(async () => ++calls === 1 ? exampleReport : {
    result: { total: 50, currency: 'AED' },
    totalsByCurrency: { AED: 50 }, totalsInCents: new Map([['AED', 5000]]),
    rates: { USD: 1, AED: 4 }, updatedAt,
  });
  await refresh();
  changeCurrency('EUR');
  await refresh();
  assert.deepEqual(events.at(-2)[1].result, { total: 50, currency: 'AED' });
  assert.deepEqual(Object.keys(events.at(-2)[1].totalsByCurrency), ['AED']);
});

test('Переключение во время загрузки не изменяет состояние', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const { events, refresh, changeCurrency } = harness(() => pending);
  const first = refresh();
  changeCurrency('EUR');
  assert.deepEqual(events, [['loading']]);
  resolve(exampleReport);
  await first;
  assert.deepEqual(events.at(-2)[1].result, { total: 475, currency: 'USD' });
});

test('После неудачного обновления нельзя пересчитать устаревшие продажи', async () => {
  let calls = 0;
  const { events, refresh, changeCurrency } = harness(async () => {
    if (++calls === 2) throw new Error('Сервер недоступен');
    return exampleReport;
  });
  await refresh();
  await refresh();
  const before = events.length;
  changeCurrency('EUR');
  assert.equal(events.length, before);
});

test('Пересчёт использует исходные центы, даже если прежний итог округлился до нуля', async () => {
  const report = {
    result: { total: 0, currency: 'USD' },
    totalsByCurrency: { USD: 0, EUR: 0.01, GBP: 0 },
    totalsInCents: new Map([['USD', 0], ['EUR', 1], ['GBP', 0]]),
    rates: { USD: 1, EUR: 3, GBP: 2 }, updatedAt,
  };
  const { events, refresh, changeCurrency } = harness(async () => report);
  await refresh();
  changeCurrency('GBP');
  assert.deepEqual(events.at(-2)[1].result, { total: 0.01, currency: 'GBP' });
  changeCurrency('USD');
  assert.deepEqual(events.at(-2)[1].result, { total: 0, currency: 'USD' });
  assert.equal(report.totalsInCents.get('EUR'), 1);
});

test('Если USD отсутствует в платежах, начальная цель берётся из их валют', async () => {
  const report = await loadRevenueReport({ fetchImpl: async (url) => {
    if (url === '/api/finance1') return json({ transactions: [
      { type: 'pending', amount: 100, currency: 'USD' },
      { type: 'paid', amount: 20, currency: 'EUR' },
    ] });
    if (url === '/api/finance2') return json(['30 eur']);
    return json(ratePayload);
  } });
  assert.deepEqual([...report.totalsInCents.keys()], ['EUR']);
  assert.deepEqual(report.result, { total: 50, currency: 'EUR' });
});

test('Список доступных валют не ограничен USD/EUR', async () => {
  const report = await loadRevenueReport({ fetchImpl: async (url) => {
    if (url === '/api/finance1') return json({ transactions: [
      { type: 'paid', amount: 100, currency: 'USD' },
      { type: 'pending', amount: 100, currency: 'JPY' },
    ] });
    if (url === '/api/finance2') return json(['300 eur', '50 gbp', '400 aed']);
    return json({ ...ratePayload, rates: { USD: 1, EUR: 0.8, GBP: 0.5, AED: 4 } });
  } });
  assert.deepEqual([...report.totalsInCents.keys()], ['USD', 'EUR', 'GBP', 'AED']);
  const { events, refresh, changeCurrency } = harness(async () => report);
  await refresh();
  changeCurrency('AED');
  assert.deepEqual(events.at(-2)[1].result, { total: 2700, currency: 'AED' });
});

test('После ошибки диапазона при конвертации можно вернуть прежнюю цель без загрузки', async () => {
  let requests = 0;
  const report = {
    result: { total: 40000000000000, currency: 'USD' },
    totalsByCurrency: { USD: 40000000000000, EUR: 0 },
    totalsInCents: new Map([['USD', 4000000000000000], ['EUR', 0]]),
    rates: { USD: 1, EUR: 2 }, updatedAt,
  };
  const { events, refresh, changeCurrency } = harness(async () => { requests += 1; return report; });
  await refresh();
  changeCurrency('EUR');
  assert.equal(events.at(-2)[0], 'error');
  assert.match(events.at(-2)[1].message, /безопасный диапазон/);
  changeCurrency('USD');
  assert.deepEqual(events.at(-2)[1].result, report.result);
  assert.equal(requests, 1);
});

test('Закрытие экрана игнорирует ошибку отменённого запроса и запрещает новую загрузку', async () => {
  let reject;
  let calls = 0;
  const { events, refresh, dispose } = harness(() => {
    calls += 1;
    return new Promise((resolve, fail) => { reject = fail; });
  });
  const pending = refresh();
  dispose();
  reject(new Error('Запрос отменён'));
  await pending;
  await refresh();
  assert.deepEqual(events, [['loading']]);
  assert.equal(calls, 1);
});

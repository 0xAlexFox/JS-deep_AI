import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson, loadFinanceSources, loadUsdRates } from '../src/api.js';
import { FINANCE_URLS, RATES_URL } from '../src/config.js';
import { calculateDailyRevenue } from '../src/revenue.js';

const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
const validRates = { result: 'success', base_code: 'USD', rates: { USD: 1, EUR: 0.8 } };

test('Браузер: два локальных API без ключа, отдельный сервис курсов, расчёт', async () => {
  const requests = [];
  const payloads = new Map([
    [FINANCE_URLS[0], { transactions: [
      { type: 'paid', amount: 100, currency: 'USD' },
      { type: 'pending', amount: 500, currency: 'USD' },
    ] }],
    [FINANCE_URLS[1], ['300 eur']],
    [RATES_URL, validRates],
  ]);
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    assert.ok(payloads.has(url), `Неожиданный адрес: ${url}`);
    return jsonResponse(payloads.get(url));
  };

  const [[source1, source2], rates] = await Promise.all([
    loadFinanceSources({ fetchImpl }), loadUsdRates({ fetchImpl }),
  ]);
  assert.deepEqual(calculateDailyRevenue(source1, source2, rates), {
    total: 475, currency: 'USD',
  });
  assert.equal(requests.length, 3);
  for (const { url, options } of requests) {
    assert.equal(options.headers['x-api-key'], undefined);
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test('Порядок источников сохраняется при ответах в обратном порядке', async () => {
  const resolvers = new Map();
  const pending = loadFinanceSources({
    fetchImpl: (url) => new Promise((resolve) => resolvers.set(url, resolve)),
  });
  resolvers.get(FINANCE_URLS[1])(jsonResponse(['20 usd']));
  resolvers.get(FINANCE_URLS[0])(jsonResponse({ transactions: [] }));
  assert.deepEqual(await pending, [{ transactions: [] }, ['20 usd']]);
});

for (const status of [401, 404, 429, 500]) {
  test(`HTTP ${status} не принимается за успешную загрузку`, async () => {
    await assert.rejects(fetchJson(FINANCE_URLS[0], {
      fetchImpl: async () => jsonResponse({}, status),
    }), new RegExp(`HTTP ${status}`));
  });
}

test('Сетевая ошибка содержит адрес проблемного запроса', async () => {
  await assert.rejects(fetchJson(FINANCE_URLS[0], {
    fetchImpl: async () => { throw new Error('Нет соединения'); },
  }), /finance1: Нет соединения/);
});

test('Некорректный JSON отклоняется с пояснением', async () => {
  await assert.rejects(fetchJson(FINANCE_URLS[0], {
    fetchImpl: async () => new Response('<html>Ошибка сервера</html>'),
  }), /Не удалось прочитать JSON/);
});

test('Запрос прерывается по тайм-ауту', async () => {
  await assert.rejects(fetchJson(FINANCE_URLS[0], {
    timeoutMs: 10,
    fetchImpl: (url, { signal }) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(jsonResponse({})), 1000);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(signal.reason);
      }, { once: true });
    }),
  }), /Не удалось загрузить.*finance1/);
});

test('Ошибка одного источника отклоняет общую загрузку вместо частичного итога', async () => {
  await assert.rejects(loadFinanceSources({
    fetchImpl: async (url) => url === FINANCE_URLS[0]
      ? jsonResponse({ transactions: [] }) : jsonResponse({}, 500),
  }), /HTTP 500.*finance2/);
});

for (const payload of [
  null,
  { ...validRates, result: 'error' },
  { ...validRates, base_code: 'EUR' },
  { ...validRates, rates: null },
  { ...validRates, rates: [] },
  { ...validRates, rates: { EUR: 0.8 } },
  { ...validRates, rates: { USD: 2, EUR: 0.8 } },
]) {
  test(`Некорректный ответ сервиса курсов отклоняется: ${JSON.stringify(payload)}`, async () => {
    await assert.rejects(loadUsdRates({
      fetchImpl: async () => jsonResponse(payload),
    }), /ожидаются курсы относительно USD/);
  });
}

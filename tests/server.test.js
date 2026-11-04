import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadServerConfig, UPSTREAM_URLS } from '../server/config.js';
import { createFinanceMiddleware } from '../server/finance-proxy.js';

// В тестах используется вымышленное значение, не настоящий ключ из .env.local.
const testKey = 'local-test-key';
const directory = mkdtempSync(join(tmpdir(), 'finance-config-'));
let fixtureNumber = 0;

function configFrom(content, env = {}) {
  const envPath = join(directory, `${fixtureNumber++}.env`);
  if (content !== null) writeFileSync(envPath, content);
  return loadServerConfig({ envPath, env });
}

test('Секрет читается из локального файла без изменения process.env', () => {
  const beforeEnv = { ...process.env };
  assert.deepEqual(configFrom(`FINANCE_API_KEY=${testKey}\nPORT=5175`), {
    apiKey: testKey, port: 5175,
  });
  assert.deepEqual({ ...process.env }, beforeEnv);
});

test('Без локального файла и ключа запуск запрещён с инструкцией', () => {
  assert.throws(() => configFrom(null), /Скопируй .env.example в .env.local/);
});

test('Пустой образец настроек не позволяет запустить API', () => {
  assert.throws(() => configFrom('FINANCE_API_KEY=\nPORT=5173'), /Не задан FINANCE_API_KEY/);
});

test('Переменные окружения имеют приоритет над локальным файлом', () => {
  assert.deepEqual(configFrom('FINANCE_API_KEY=other-test-key\nPORT=5173', {
    FINANCE_API_KEY: testKey, PORT: '5174',
  }), { apiKey: testKey, port: 5174 });
});

test('Ключ можно передать через окружение без .env.local', () => {
  assert.deepEqual(configFrom(null, { FINANCE_API_KEY: testKey }), {
    apiKey: testKey, port: 5173,
  });
});

test('Пустой ключ в окружении не подменяется ключом из файла', () => {
  assert.throws(() => configFrom(`FINANCE_API_KEY=${testKey}`, { FINANCE_API_KEY: '' }), /Не задан/);
});

test('Запрещён ключ с клиентским префиксом VITE_ в файле и окружении', () => {
  assert.throws(() => configFrom(`FINANCE_API_KEY=${testKey}\nVITE_FINANCE_API_KEY=bad`), /без префикса VITE_/);
  assert.throws(() => configFrom(null, { VITE_FINANCE_API_KEY: 'bad' }), /без префикса VITE_/);
});

for (const port of ['0', '80', '65536', 'abc', '5173.5', '']) {
  test(`Некорректный порт отклоняется: ${JSON.stringify(port)}`, () => {
    assert.throws(() => configFrom(null, { FINANCE_API_KEY: testKey, PORT: port }), /PORT должен/);
  });
}

test('Перевод строки в ключе запрещён', () => {
  assert.throws(() => configFrom(null, { FINANCE_API_KEY: 'first\nsecond' }), /Не задан/);
});

test('Обработчик нельзя создать без ключа', () => {
  assert.throws(() => createFinanceMiddleware({ apiKey: '' }), /требуется FINANCE_API_KEY/);
});

// Один локальный HTTP-сервер на весь файл. Тесты идут последовательно,
// внешних запросов не делают и не заменяют globalThis.fetch.
let server;
let port;
let middleware;
let calls;
let upstreamFetch;

before(async () => {
  server = createServer((request, response) => {
    middleware(request, response, () => {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Не API' }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

beforeEach(() => {
  calls = [];
  upstreamFetch = async () => new Response(JSON.stringify({ transactions: [] }));
  middleware = createFinanceMiddleware({
    apiKey: testKey,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return upstreamFetch(url, options);
    },
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(directory, { recursive: true });
});

function request(path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ hostname: '127.0.0.1', port, path, method, headers }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({
        status: response.statusCode, headers: response.headers, body, json: JSON.parse(body),
      }));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

for (const path of Object.keys(UPSTREAM_URLS)) {
  test(`Ключ добавляется только во внешний запрос ${path}`, async () => {
    const originalFetch = globalThis.fetch;
    const payload = path.endsWith('1') ? { transactions: [] } : ['300 aed'];
    upstreamFetch = async () => new Response(JSON.stringify(payload));
    const result = await request(path, {
      headers: { Origin: `http://127.0.0.1:${port}`, 'x-api-key': 'untrusted-client-value' },
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.json, payload);
    assert.equal(result.headers['x-api-key'], undefined);
    assert.equal(result.headers['access-control-allow-origin'], undefined);
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.ok(!result.body.includes(testKey));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, UPSTREAM_URLS[path]);
    assert.equal(calls[0].options.headers['x-api-key'], testKey);
    assert.equal(calls[0].options.redirect, 'error');
    assert.ok(calls[0].options.signal instanceof AbortSignal);
    assert.equal(globalThis.fetch, originalFetch);
  });
}

for (const path of ['/api', '/api/other', '/api/finance1?url=https://example.com', '/api/finance2/']) {
  test(`Нельзя выбрать произвольный адрес через ${path}`, async () => {
    assert.equal((await request(path)).status, 404);
    assert.equal(calls.length, 0);
  });
}

test('Запросы вне /api передаются следующему обработчику', async () => {
  assert.deepEqual((await request('/page')).json, { error: 'Не API' });
  assert.equal(calls.length, 0);
});

for (const headers of [
  { Host: 'evil.example' },
  { Origin: 'https://evil.example' },
  { Origin: 'null' },
  { Origin: 'http://localhost:999' },
  { 'Sec-Fetch-Site': 'cross-site' },
]) {
  test(`Запрещены внешние Host/Origin: ${JSON.stringify(headers)}`, async () => {
    assert.equal((await request('/api/finance1', { headers })).status, 403);
    assert.equal(calls.length, 0);
  });
}

test('Методы кроме GET не обращаются к учебному API', async () => {
  const result = await request('/api/finance1', { method: 'POST' });
  assert.equal(result.status, 405);
  assert.equal(result.headers.allow, 'GET');
  assert.equal(calls.length, 0);
});

test('Ошибка учебного сервера не пересылает его тело и заголовки', async () => {
  upstreamFetch = async () => new Response(testKey, {
    status: 401, headers: { 'x-api-key': testKey },
  });
  const result = await request('/api/finance1');
  assert.equal(result.status, 502);
  assert.match(result.json.error, /HTTP 401/);
  assert.equal(result.headers['x-api-key'], undefined);
  assert.ok(!result.body.includes(testKey));
});

test('Сетевая ошибка, содержащая ключ, не раскрывается браузеру', async () => {
  upstreamFetch = async () => { throw new Error(`Secret: ${testKey}`); };
  const result = await request('/api/finance1');
  assert.equal(result.status, 502);
  assert.ok(!result.body.includes(testKey));
});

test('Неверный JSON не раскрывает внутреннее сообщение ошибки', async () => {
  upstreamFetch = async () => new Response(`Secret: ${testKey}`);
  const result = await request('/api/finance1');
  assert.equal(result.status, 502);
  assert.ok(!result.body.includes(testKey));
});

test('Тайм-аут возвращает 504 и понятное сообщение без ключа', async () => {
  upstreamFetch = async () => { throw new DOMException(testKey, 'TimeoutError'); };
  const result = await request('/api/finance1');
  assert.equal(result.status, 504);
  assert.match(result.json.error, /не ответил вовремя/);
  assert.ok(!result.body.includes(testKey));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectSnapshot } from '../.agents/skills/finance-api-audit/scripts/inspect.mjs';
import { capture } from '../.agents/skills/finance-api-audit/scripts/audit.mjs';
import { renderMarkdown } from '../.agents/skills/finance-api-audit/scripts/report.mjs';

const now = '2026-11-13T10:00:00.000Z';
const registry = {
  source: 'https://www.six-group.com/test-public-reference', publishedAt: '2026-09-17', retrievedAt: now,
  codes: { USD: { minorUnits: 2 }, EUR: { minorUnits: 2 }, AED: { minorUnits: 2 }, JPY: { minorUnits: 0 }, XXX: { minorUnits: null } },
};
const ok = (data) => ({ ok: true, status: 200, contentType: 'application/json', data });
const snapshot = () => ({
  finance1: ok({ transactions: [{ type: 'paid', amount: 1, currency: 'USD' }] }),
  finance2: ok(['2 EUR']),
  rates: ok({ result: 'success', base_code: 'USD', rates: { USD: 1, EUR: 0.8 }, time_last_update_unix: Date.parse(now)/1000 }),
});
const inspect = (value, ref = registry) => inspectSnapshot(value, ref, { now });
const rules = (report) => report.findings.map((item) => item.rule);

test('Аудитор: корректный снимок не получает выдуманные замечания', () => {
  const report = inspect(snapshot());
  assert.deepEqual(report.findings, []);
  assert.equal(report.complete, true);
  assert.deepEqual(report.currencies, ['EUR', 'USD']);
});

test('Аудитор: регистр, пробелы и смешанные варианты валют выявляются раздельно', () => {
  const input = snapshot();
  input.finance1.data.transactions[0].currency = ' usd ';
  input.finance2.data = ['2 USD'];
  const report = inspect(input);
  for (const rule of ['currency_case', 'currency_space', 'currency_mixed']) assert.ok(rules(report).includes(rule));
  assert.equal(report.summary.error, 0);
  assert.equal(report.findings[0].examples[0].path, '$.transactions[0].currency');
});

test('Аудитор: неизвестный ISO-код не становится известным из-за наличия курса', () => {
  const input = snapshot();
  input.finance2.data = ['2 ZZZ']; input.rates.data.rates.ZZZ = 3;
  assert.ok(rules(inspect(input)).includes('currency_unknown'));
  assert.ok(!rules(inspect(input)).includes('missing_rate'));
});

test('Аудитор: отсутствие курса известной валюты не называется несуществующей валютой', () => {
  const input = snapshot(); delete input.rates.data.rates.EUR;
  const report = inspect(input);
  assert.ok(!rules(report).includes('currency_unknown'));
  assert.equal(report.findings.find((item) => item.rule === 'missing_rate').severity, 'error');
});

test('Аудитор: единственная валюта и нулевые суммы не требуют обязательной конвертации', () => {
  const input = snapshot();
  input.finance1.data.transactions = [];
  input.finance2.data = ['2 EUR']; delete input.rates.data.rates.EUR;
  assert.equal(inspect(input).findings.find((item) => item.rule === 'missing_rate').severity, 'warning');
  input.finance2.data = ['0 EUR'];
  assert.ok(!rules(inspect(input)).includes('missing_rate'));
});

test('Аудитор: специальные ISO-коды не объявляются несуществующими', () => {
  const input = snapshot(); input.finance2.data = ['0 XXX'];
  const report = inspect(input);
  assert.ok(rules(report).includes('currency_special'));
  assert.ok(!rules(report).includes('currency_unknown'));
});

test('Аудитор: неоплаченные записи не проверяются как учтённые продажи', () => {
  const input = snapshot();
  input.finance1.data.transactions.push({ type: 'pending', amount: 'bad', currency: 'bad' });
  assert.deepEqual(inspect(input).findings, []);
  input.finance1.data.transactions[1].type = ' Paid ';
  const finding = inspect(input).findings.find((item) => item.rule === 'status');
  assert.equal(finding.severity, 'error');
});

test('Аудитор: собирает все нарушения схемы и сумм, не останавливаясь на первом', () => {
  const input = snapshot();
  input.finance1.data.transactions = [null, { type: 'paid', amount: -1, currency: 'USD' }, { type: 'paid', amount: 1.365, currency: 'USD' }];
  input.finance2.data = [42, '2,5 EUR', '3 UNKNOWN'];
  const report = inspect(input);
  for (const rule of ['schema', 'amount', 'string_format', 'currency_format']) assert.ok(rules(report).includes(rule));
  assert.equal(report.findings.find((item) => item.rule === 'amount').count, 2);
});

test('Аудитор: ограничение итоговой суммы совпадает с денежным модулем приложения', () => {
  const input = snapshot();
  input.finance1.data.transactions = [{ type: 'paid', amount: 40000000000000, currency: 'USD' }];
  input.finance2.data = ['40000000000000 USD'];
  assert.ok(rules(inspect(input)).includes('range'));
});

test('Аудитор: учитывает разрядность валюты и не придумывает дубли строк', () => {
  const input = snapshot(); input.finance2.data = ['1.25 JPY', '1.25 JPY']; input.rates.data.rates.JPY = 100;
  const report = inspect(input);
  assert.ok(rules(report).includes('minor_units'));
  assert.ok(!rules(report).includes('duplicate_id'));
});

test('Аудитор: ID и персональные поля не попадают в отчёт; секрет в плохом поле скрывается', () => {
  const secret = 'synthetic-secret-never-real';
  const input = snapshot();
  input.finance1.data.transactions = [
    { id: 'private-id', customer: 'private-person', type: 'paid', amount: 1, currency: secret },
    { id: 'private-id', type: 'paid', amount: 2, currency: 'USD' },
  ];
  const report = inspectSnapshot(input, registry, { now, secrets: [secret] });
  const content = JSON.stringify(report) + renderMarkdown(report);
  for (const value of [secret, 'private-id', 'private-person']) assert.ok(!content.includes(value));
  assert.ok(rules(report).includes('duplicate_id'));
});

test('Аудитор: недоступный источник не превращается в пустой корректный массив', () => {
  const input = snapshot(); input.finance2 = { ok: false, status: 503, failure: 'private-server-text' };
  const report = inspect(input);
  assert.equal(report.complete, false);
  assert.equal(report.sources.find((source) => source.name === 'finance2').records, null);
  assert.ok(!JSON.stringify(report).includes('private-server-text'));
});

test('Аудитор: отсутствие/устаревание справочника и устаревшие курсы обозначают ограничение', () => {
  assert.equal(inspect(snapshot(), {}).complete, false);
  const ref = { ...registry, retrievedAt: '2020-01-01T00:00:00Z' };
  assert.ok(rules(inspect(snapshot(), ref)).includes('reference'));
  const input = snapshot(); input.rates.data.time_last_update_unix = Date.parse('2020-01-01')/1000;
  assert.ok(rules(inspect(input)).includes('rates_stale'));
});

test('Аудитор: один тип нарушения хранит счётчик и не более пяти примеров', () => {
  const input = snapshot(); input.finance2.data = Array(12).fill('1 eur');
  const finding = inspect(input).findings.find((item) => item.rule === 'currency_case');
  assert.equal(finding.count, 12); assert.equal(finding.examples.length, 5);
  assert.equal(finding.examples[0].path, '$[0]'); // В finance2 элемент - строка, свойства currency у него нет.
});

test('Загрузка аудита: ключ, запрет редиректа и подавление тела HTTP-ошибки', async () => {
  const secret = 'synthetic-test-key';
  const response = await capture('https://cpa-server-vtel.onrender.com/api/finance1', {
    apiKey: secret,
    fetchImpl: async (url, options) => {
      assert.equal(options.headers['x-api-key'], secret);
      assert.equal(options.redirect, 'error');
      return new Response(secret, { status: 401 });
    },
  });
  assert.equal(response.status, 401);
  assert.ok(!JSON.stringify(response).includes(secret));
  await capture('https://open.er-api.com/v6/latest/USD', {
    fetchImpl: async (url, options) => {
      assert.deepEqual(options.headers, {});
      return new Response('{}');
    },
  });
});

test('Загрузка аудита: некорректный JSON и большой ответ не сохраняются как успешные', async () => {
  const invalid = await capture('https://example.invalid', { fetchImpl: async () => new Response('<html>bad</html>') });
  assert.equal(invalid.ok, false);
  const large = await capture('https://example.invalid', { fetchImpl: async () => new Response('x'.repeat(2*1024*1024+1)) });
  assert.equal(large.ok, false);
  assert.ok(!JSON.stringify(large).includes('xxxx'));
});

test('CLI: offline-отчёт не выдаётся за живой аудит и не перезаписывается', () => {
  const directory = resolve('.local/finance-api-audit-results/test-'+randomUUID());
  mkdirSync(directory, { recursive: true });
  const fixture = resolve(directory, 'fixture.json');
  writeFileSync(fixture, JSON.stringify({ ...snapshot(), mode: 'live' }));
  const args = ['.agents/skills/finance-api-audit/scripts/audit.mjs', '--input', fixture, '--out', directory];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, FINANCE_API_KEY: '' } });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(readFileSync(resolve(directory, 'report.json')));
  assert.equal(report.mode, 'offline');
  assert.match(readFileSync(resolve(directory, 'report.md'), 'utf8'), /локальный снимок/);
  const duplicate = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(duplicate.status, 2);
});

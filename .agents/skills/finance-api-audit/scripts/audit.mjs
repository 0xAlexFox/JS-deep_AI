import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { inspectSnapshot } from './inspect.mjs';
import { renderMarkdown } from './report.mjs';

const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const MAX_BYTES = 2 * 1024 * 1024;

// Удалённые адреса берутся только из настроек проекта; CLI не принимает
// произвольный endpoint и не позволяет переслать ключ другому получателю.
export async function capture(url, { apiKey, fetchImpl = globalThis.fetch, timeoutMs = 60000 } = {}) {
  const started = performance.now();
  try {
    const response = await fetchImpl(url, {
      method: 'GET', headers: apiKey ? { 'x-api-key': apiKey } : {},
      redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    });
    const status = response.status;
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, status, failure: `HTTP ${status}; тело ошибки намеренно не сохранено.` };
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); return { ok: false, status, failure: 'Ответ превышает лимит 2 МБ.' }; }
      chunks.push(Buffer.from(value));
    }
    const buffer = Buffer.concat(chunks);
    let data;
    try { data = JSON.parse(buffer.toString('utf8')); }
    catch { return { ok: false, status, failure: 'Тело ответа не является корректным JSON.' }; }
    return {
      ok: true, status, contentType: response.headers.get('content-type'), data,
      durationMs: Math.round(performance.now() - started),
      sha256: createHash('sha256').update(buffer).digest('hex'),
    };
  } catch {
    // error.message может содержать URL, ключ или произвольные данные сервера.
    return { ok: false, failure: 'Сетевая ошибка, запрет редиректа или тайм-аут; подробности не сохранены для защиты секрета.' };
  }
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log('Из корня проекта: node .agents/skills/finance-api-audit/scripts/audit.mjs --live [--out .local/…]\nИли --input локальный-снимок.json. По умолчанию сеть не используется.'); return;
  }
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--live') options.live = true;
    else if (['--input', '--out'].includes(key) && args[i + 1] && !args[i + 1].startsWith('--')) options[key.slice(2)] = args[++i];
    else throw new Error('Неверные аргументы; используйте --help.');
  }
  if (Boolean(options.live) === Boolean(options.input)) throw new Error('Укажите ровно один режим: --live или --input.');
  const registry = JSON.parse(await readFile(new URL('../assets/iso4217.json', import.meta.url), 'utf8'));
  let snapshot;
  let secrets = [];
  if (options.live) {
    const { loadServerConfig, UPSTREAM_URLS } = await import(pathToFileURL(resolve(projectRoot, 'server/config.js')));
    const { RATES_URL } = await import(pathToFileURL(resolve(projectRoot, 'src/config.js')));
    const { apiKey } = loadServerConfig();
    secrets = [apiKey];
    const [finance1, finance2, rates] = await Promise.all([
      capture(UPSTREAM_URLS['/api/finance1'], { apiKey }),
      capture(UPSTREAM_URLS['/api/finance2'], { apiKey }),
      capture(RATES_URL), // Ключ финансового API не передаётся провайдеру курсов.
    ]);
    snapshot = { mode: 'live', finance1, finance2, rates };
  } else snapshot = { ...JSON.parse(await readFile(resolve(options.input), 'utf8')), mode: 'offline' };
  const report = inspectSnapshot(snapshot, registry, { secrets });
  const stamp = report.checkedAt.replace(/[:.]/g, '-');
  const directory = resolve(projectRoot, options.out ?? `.local/finance-api-audit-results/${stamp}`);
  const allowed = resolve(projectRoot, '.local') + '/';
  if (!directory.startsWith(allowed)) throw new Error('Отчёты разрешено сохранять только внутри .local/.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const actualRoot = await realpath(resolve(projectRoot, '.local'));
  if (!(await realpath(directory)).startsWith(actualRoot + '/')) throw new Error('Вывод через внешнюю символическую ссылку запрещён.');
  await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await writeFile(resolve(directory, 'report.md'), renderMarkdown(report), { flag: 'wx', mode: 0o600 });
  console.log(`Отчёт: ${directory}/report.md\nОшибок: ${report.summary.error}; предупреждений: ${report.summary.warning}; полнота: ${report.complete ? 'полная' : 'ограничена'}.`);
  // Код 0 означает создание отчёта, а не отсутствие проблем в API.
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => { console.error('Аудит не завершён. Проверьте режим, локальные настройки, справочник и путь вывода; секреты и сырые ответы не печатаются.'); process.exitCode = 2; });
}

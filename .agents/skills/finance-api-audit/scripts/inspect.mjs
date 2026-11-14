import { toCents, addCents } from '../../../../src/domain/money.js';

const rules = {
  transport: ['error', 'Источник не проверен', 'Данные этого источника не получены; вывод об отсутствии проблем невозможен.', 'Проверить доступность, HTTP-статус, авторизацию и корректность JSON. Не передавать ключ в отчёт.'],
  content_type: ['warning', 'Ответ JSON имеет неподходящий Content-Type', 'Некоторые клиенты могут неверно обработать ответ.', 'Возвращать application/json с подходящей кодировкой.'],
  schema: ['error', 'Неверная структура ответа или записи', 'Клиент отклонит отчёт либо не сможет надёжно разобрать запись.', 'Согласовать и соблюдать схему: transactions с объектами для finance1, массив строк для finance2.'],
  status: ['warning', 'Неоднозначный статус оплаты', 'Клиент учитывает только точное значение paid; иначе продажа может не попасть в итог.', 'Согласовать enum статусов; передавать канонические значения без пробелов и смены регистра.'],
  amount: ['error', 'Сумма несовместима с текущим контрактом клиента', 'Отчёт отклоняется: нужны конечные неотрицательные числа с максимум двумя знаками и безопасным диапазоном.', 'Проверить тип, знак, точность и диапазон. Если API допускает возвраты или 3 знака, согласовать изменение контракта с frontend.'],
  range: ['error', 'Сумма валютной группы превышает диапазон клиента', 'Даже корректные отдельные продажи могут дать непредставимый денежный итог.', 'Согласовать лимиты и точный формат больших денежных сумм.'],
  currency_format: ['error', 'Некорректный формат кода валюты', 'Клиент ожидает трёхбуквенный код; отчёт отклоняется.', 'Передавать строковый код из согласованного справочника.'],
  currency_case: ['warning', 'Код валюты не в верхнем регистре', 'Наш клиент нормализует код, но другие потребители могут разделить одну валюту на несколько групп.', 'Нормализовать коды на сервере, например usd → USD.'],
  currency_space: ['warning', 'Пробелы вокруг кода валюты', 'Клиент удаляет крайние пробелы; сырой контракт остаётся неоднородным.', 'Передавать код без окружающих пробелов.'],
  currency_mixed: ['warning', 'Одна валюта представлена разными вариантами', 'Потребители без нормализации могут получить раздельные суммы.', 'Использовать одно каноническое представление во всех источниках.'],
  currency_unknown: ['warning', 'Код отсутствует в текущем справочнике ISO 4217', 'Нельзя подтвердить, что это действующий ISO-код. Это может быть исторический код или собственное расширение API.', 'Уточнить валюту и дату платежа; исправить опечатку либо документировать собственный/исторический код. Не подменять валюту автоматически.'],
  currency_special: ['warning', 'Специальный код вместо обычной денежной валюты', 'Код зарегистрирован, но может обозначать отсутствие валюты, тестирование, металл или расчётную единицу.', 'Подтвердить допустимость такого кода для реальных платежей; не считать его несуществующим.'],
  minor_units: ['warning', 'Дробная сумма требует согласования с ISO-разрядностью', 'Правило клиента «максимум 2 знака» не заменяет правила конкретной валюты.', 'Уточнить минимальную денежную единицу и правила округления; не округлять входные данные молча.'],
  string_format: ['error', 'Неверный формат продажи во втором источнике', 'Клиент ожидает строку вида 300 USD с обычной десятичной записью.', 'Согласовать формат суммы и валюты; не использовать экспоненту, запятую или символ валюты вместо кода.'],
  string_space: ['warning', 'Нестандартные пробелы в строке продажи', 'Клиент принимает лишние пробелы, но формат ответа остаётся неоднородным.', 'Передавать сумму и код через один обычный пробел без крайних пробелов.'],
  duplicate_id: ['warning', 'Повторяется идентификатор транзакции', 'Возможно повторное включение записи; совпадение само по себе ещё не доказывает дубль платежа.', 'Проверить уникальность ID и объяснить допустимые повторы; не удалять записи по совпадению суммы.'],
  rates_schema: ['error', 'Сервис курсов вернул несовместимый ответ', 'Клиент ожидает успешный ответ и положительные курсы относительно USD, с USD = 1.', 'Проверить контракт сервиса курсов; это отдельный источник, а не подтверждённый дефект API продаж.'],
  missing_rate: ['warning', 'Нет пригодного курса валюты', 'При конвертации ненулевой суммы в другую валюту итог может быть недоступен. Это не доказывает, что валюты не существует.', 'Добавить курс или согласовать поддерживаемые валюты и поведение при отсутствии курса.'],
  rates_date: ['warning', 'Нет корректной даты обновления курсов', 'Нельзя подтвердить актуальность снимка курсов.', 'Возвращать корректное время обновления и документировать частоту обновлений.'],
  rates_stale: ['warning', 'Курсы обновлены более 72 часов назад', 'Снимок заметно старше ожидаемого ежедневного обновления; порог является правилом этого аудита.', 'Проверить расписание и состояние обновления курсов.'],
  reference: ['warning', 'Справочник валют не подтверждён или устарел', 'Проверка существования ISO-кодов ограничена; отсутствие проблем в этой части не подтверждается.', 'Обновить справочник из официального списка SIX и повторить аудит.'],
  limit: ['warning', 'Аудит ограничен первыми 10000 записями', 'Остальные записи не проверены.', 'Выполнить аудит порциями с согласованной пагинацией.'],
};

// Сохраняем только разрешённые значения и JSON-пути. Исходные записи, ID,
// заголовки, поля клиентов и тела ошибок сервера в результат не попадают.
export function inspectSnapshot(snapshot, registry, { now = new Date().toISOString(), secrets = [] } = {}) {
  const findings = new Map();
  const sources = [];
  const variants = new Map();
  const totals = new Map();
  const safe = (value) => {
    let text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
    for (const secret of secrets.filter(Boolean)) text = text.split(secret).join('[REDACTED]');
    return text.replace(/[\u0000-\u001f]/g, ' ').slice(0, 100);
  };
  function add(rule, source, path, evidence = '', severity) {
    const [defaultSeverity, title, impact, recommendation] = rules[rule];
    const key = `${source}:${rule}`;
    if (!findings.has(key)) findings.set(key, {
      rule, source, severity: severity ?? defaultSeverity, title, impact, recommendation,
      count: 0, examples: [],
    });
    const item = findings.get(key);
    if (severity === 'error') item.severity = 'error';
    item.count++;
    if (item.examples.length < 5) item.examples.push({ path, evidence: safe(evidence) });
  }
  const registryReady = registry?.codes && typeof registry.codes === 'object'
    && !Array.isArray(registry.codes) && registry.codes.USD?.minorUnits === 2;
  const referenceAge = Date.parse(now) - Date.parse(registry?.retrievedAt);
  if (!registryReady || !Number.isFinite(referenceAge) || referenceAge > 30 * 86400000 || referenceAge < -86400000) {
    add('reference', 'reference', '$', registryReady ? 'Снимок справочника старше 30 дней или дата неверна.' : 'Нет проверенного справочника.');
  }

  const special = new Set(['XXX', 'XTS', 'XAU', 'XAG', 'XPT', 'XPD', 'XDR', 'XBA', 'XBB', 'XBC', 'XBD', 'XUA', 'XSU']);
  function currency(raw, source, path, amount) {
    if (typeof raw !== 'string' || !/^[A-Za-z]{3}$/.test(raw.trim())) {
      add('currency_format', source, path, raw); return null;
    }
    const code = raw.trim().toUpperCase();
    if (raw !== raw.trim()) add('currency_space', source, path, raw);
    if (raw.trim() !== code) add('currency_case', source, path, raw);
    if (!variants.has(code)) variants.set(code, new Map());
    const map = variants.get(code);
    if (!map.has(raw)) map.set(raw, `${source}:${path}`);
    const entry = registryReady ? registry.codes[code] : null;
    if (registryReady && !entry) add('currency_unknown', source, path, code);
    if (entry && (special.has(code) || entry.minorUnits === null)) add('currency_special', source, path, code);
    if (entry && Number.isInteger(entry.minorUnits) && entry.minorUnits < 2 && typeof amount === 'number'
        && Number.isFinite(amount) && Number(amount.toFixed(entry.minorUnits)) !== amount) {
      add('minor_units', source, path, `${code}: сумма содержит дробь меньше принятой денежной единицы.`);
    }
    return code;
  }
  function amount(raw, source, path) {
    try { return toCents(raw); }
    catch { add('amount', source, path, raw); return null; }
  }
  function sale(rawAmount, rawCurrency, source, path, scalar = false) {
    const cents = amount(rawAmount, source, scalar ? path : `${path}.amount`);
    const code = currency(rawCurrency, source, scalar ? path : `${path}.currency`, rawAmount);
    if (code && cents !== null) {
      try { totals.set(code, addCents(totals.get(code) ?? 0, cents)); }
      catch { add('range', source, path, code); }
    }
  }
  function response(name) {
    const item = snapshot[name];
    const meta = {
      name, ok: item?.ok === true, status: Number.isInteger(item?.status) ? item.status : null,
      records: null, checked: 0, paid: 0,
      durationMs: Number.isFinite(item?.durationMs) ? item.durationMs : null,
      sha256: typeof item?.sha256 === 'string' && /^[a-f0-9]{64}$/.test(item.sha256) ? item.sha256 : null,
    };
    sources.push(meta);
    if (!meta.ok) { add('transport', name, '$', item?.status ? `HTTP ${meta.status}; содержимое ответа не включено.` : 'Получение источника не подтверждено; сеть, тайм-аут или формат JSON.'); return [null, meta]; }
    if (item.contentType && !/^application\/(?:[\w.+-]+\+)?json\b/i.test(item.contentType)) add('content_type', name, '$', 'Content-Type не соответствует JSON.');
    return [item.data, meta];
  }
  const [first, firstMeta] = response('finance1');
  if (firstMeta.ok) {
    if (!first || typeof first !== 'object' || Array.isArray(first) || !Array.isArray(first.transactions)) add('schema', 'finance1', '$', 'Ожидается объект с массивом transactions.');
    else {
      firstMeta.records = first.transactions.length;
      if (firstMeta.records > 10000) add('limit', 'finance1', '$.transactions');
      const ids = new Map();
      first.transactions.slice(0, 10000).forEach((record, index) => {
        firstMeta.checked++;
        const path = `$.transactions[${index}]`;
        if (!record || typeof record !== 'object' || Array.isArray(record)) { add('schema', 'finance1', path, 'Ожидается объект транзакции.'); return; }
        if (typeof record.type !== 'string' || !record.type.trim() || record.type !== record.type.trim().toLowerCase()) {
          add('status', 'finance1', `${path}.type`, record.type,
            typeof record.type === 'string' && record.type.trim().toLowerCase() === 'paid' ? 'error' : undefined);
        }
        if (['string', 'number'].includes(typeof record.id)) {
          const key = `${typeof record.id}:${record.id}`;
          if (ids.has(key)) add('duplicate_id', 'finance1', `${path}.id`, `Совпадение с ${ids.get(key)}; значение ID скрыто.`);
          else ids.set(key, `${path}.id`);
        }
        // Неоплаченные записи не объявляем дефектными по сумме/валюте:
        // они не входят в контракт расчёта. Неоднозначный paid проверяем отдельно.
        if (record.type !== 'paid') return;
        firstMeta.paid++;
        sale(record.amount, record.currency, 'finance1', path);
      });
    }
  }
  const [second, secondMeta] = response('finance2');
  if (secondMeta.ok) {
    if (!Array.isArray(second)) add('schema', 'finance2', '$', 'Ожидается массив строк.');
    else {
      secondMeta.records = second.length;
      if (second.length > 10000) add('limit', 'finance2', '$');
      second.slice(0, 10000).forEach((record, index) => {
        secondMeta.checked++;
        const path = `$[${index}]`;
        if (typeof record !== 'string') { add('schema', 'finance2', path, 'Ожидается строка продажи.'); return; }
        const parts = record.trim().split(/\s+/);
        if (parts.length !== 2 || !/^-?\d+(?:\.\d{1,2})?$/.test(parts[0])) {
          add('string_format', 'finance2', path, 'Строка не соответствует десятичной сумме и коду валюты.');
          // Если код извлекается однозначно, проверяем его и при плохой сумме.
          if (parts.length === 2) currency(parts[1], 'finance2', path, NaN);
          return;
        }
        if (record !== `${parts[0]} ${parts[1]}`) add('string_space', 'finance2', path, 'Крайние пробелы или нестандартный разделитель.');
        secondMeta.paid++;
        sale(Number(parts[0]), parts[1], 'finance2', path, true);
      });
    }
  }
  for (const [code, map] of variants) {
    if (map.size > 1) add('currency_mixed', 'finance APIs', '$', `${code}: ${[...map.keys()].join(', ')}`);
  }
  const [rates, ratesMeta] = response('rates');
  if (ratesMeta.ok) {
    if (rates?.result !== 'success' || rates.base_code !== 'USD' || !rates.rates
        || typeof rates.rates !== 'object' || Array.isArray(rates.rates) || rates.rates.USD !== 1) add('rates_schema', 'rates', '$');
    else {
      for (const [code, cents] of totals) {
        if (code === 'USD' || cents === 0) continue;
        const value = rates.rates[code];
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
          add('missing_rate', 'rates', `$.rates.${code}`, code, totals.size > 1 ? 'error' : 'warning');
        }
      }
      const updated = typeof rates.time_last_update_unix === 'number' && rates.time_last_update_unix > 0
        ? rates.time_last_update_unix * 1000 : Date.parse(rates.time_last_update_utc);
      if (!Number.isFinite(updated) || updated > Date.parse(now) + 300000) add('rates_date', 'rates', '$.time_last_update');
      else if (Date.parse(now) - updated > 72 * 3600000) add('rates_stale', 'rates', '$.time_last_update', new Date(updated).toISOString());
    }
  }
  const items = [...findings.values()];
  return {
    version: 1, checkedAt: now, mode: snapshot.mode ?? 'offline',
    complete: sources.every((source) => source.ok) && !items.some((item) => ['limit', 'reference'].includes(item.rule)),
    sources, currencies: [...variants.keys()].sort(),
    reference: { source: registry?.source ?? null, publishedAt: registry?.publishedAt ?? null, retrievedAt: registry?.retrievedAt ?? null },
    summary: Object.fromEntries(['error', 'warning'].map((level) => [level, items.filter((item) => item.severity === level).length])),
    findings: items,
  };
}

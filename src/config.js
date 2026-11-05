// Публичные настройки браузера. Секретных значений в этом файле нет.
// Ключ добавляет только локальный сервер, который обращается к внешнему API.
export const FINANCE_URLS = [
  '/api/finance1',
  '/api/finance2',
];

// База таблицы курсов постоянная, а начальную целевую валюту можно сменить в UI.
export const RATES_BASE_CURRENCY = 'USD';
export const DEFAULT_TARGET_CURRENCY = 'USD';

// Курсы относительно USD: например, rates.EUR — сколько евро стоит 1 доллар.
// Документация: https://www.exchangerate-api.com/docs/free
export const RATES_URL = 'https://open.er-api.com/v6/latest/USD';

// Ограничиваем ожидание: при недоступном сервере запрос не должен висеть бесконечно.
// Даём минуту, поскольку учебный сервер на Render может запускаться не сразу.
export const REQUEST_TIMEOUT_MS = 60_000;

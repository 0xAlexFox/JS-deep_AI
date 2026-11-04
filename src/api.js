import {
  FINANCE_URLS,
  RATES_URL,
  TARGET_CURRENCY,
  REQUEST_TIMEOUT_MS,
} from './config.js';

// Общая функция для GET-запросов. fetchImpl можно заменить в тестах:
// так проверки не зависят от доступности серверов и текущих курсов.
export async function fetchJson(url, {
  headers = {},
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`Не удалось загрузить ${url}: ${error.message}`, { cause: error });
  }

  // fetch сам не считает HTTP 401, 404 и 500 исключениями, поэтому проверяем ok.
  if (!response.ok) {
    throw new Error(`Ошибка HTTP ${response.status} при загрузке ${url}.`);
  }

  try {
    return await response.json();
  } catch (error) {
    // Тайм-аут также действует во время чтения тела ответа.
    throw new Error(`Не удалось прочитать JSON от ${url}: ${error.message}`, { cause: error });
  }
}

export async function loadFinanceSources(options = {}) {
  // Браузер обращается к локальным адресам без ключа. Заголовок x-api-key
  // добавляется серверным обработчиком и не попадает в запросы браузера.
  // Promise.all сохраняет порядок источников независимо от порядка ответов.
  return Promise.all(FINANCE_URLS.map((url) => fetchJson(url, options)));
}

export async function loadUsdRates(options = {}) {
  // Ключ продаж сюда не передаём: это другой сервис, не требующий авторизации.
  const data = await fetchJson(RATES_URL, options);

  // Одного HTTP 200 недостаточно: сервис может сообщить об ошибке внутри JSON.
  if (data?.result !== 'success' || data.base_code !== TARGET_CURRENCY
      || !data.rates || typeof data.rates !== 'object' || Array.isArray(data.rates)
      || data.rates.USD !== 1) {
    throw new Error('Сервис курсов вернул некорректные данные: ожидаются курсы относительно USD.');
  }

  return data.rates;
}

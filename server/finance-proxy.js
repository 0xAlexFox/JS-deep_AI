import { UPSTREAM_URLS } from './config.js';
import { REQUEST_TIMEOUT_MS } from '../src/config.js';

function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(data));
}

// Серверный обработчик для Vite dev и preview. Браузер не получает apiKey:
// он обращается к /api/finance1, а этот код добавляет ключ во внешний запрос.
export function createFinanceMiddleware({
  apiKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) {
    throw new Error('Для серверного обработчика требуется FINANCE_API_KEY.');
  }

  return async function financeMiddleware(request, response, next) {
    const path = request.url?.split('?')[0];
    if (path !== '/api' && !path?.startsWith('/api/')) {
      next();
      return;
    }

    // Только локальные Host и Origin. Посторонний сайт не должен использовать
    // наш сервер как посредника с ключом; произвольные внешние URL не принимаются.
    const port = request.socket.localPort;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    const origin = request.headers.origin;
    if (!hosts.includes(request.headers.host)
        || (origin !== undefined && !hosts.some((host) => origin === `http://${host}`))
        || request.headers['sec-fetch-site'] === 'cross-site') {
      sendJson(response, 403, { error: 'Запрос разрешён только с локальной страницы приложения.' });
      return;
    }

    if (!Object.hasOwn(UPSTREAM_URLS, path) || request.url !== path) {
      sendJson(response, 404, { error: 'Неизвестный адрес API.' });
      return;
    }
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      sendJson(response, 405, { error: 'Поддерживается только GET.' });
      return;
    }

    try {
      const upstream = await fetchImpl(UPSTREAM_URLS[path], {
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(timeoutMs),
        // Не пересылаем ключ другому адресу, даже если внешний API ответил редиректом.
        redirect: 'error',
      });
      if (!upstream.ok) {
        // Не пересылаем тело ошибки и заголовки внешнего сервера: они могут
        // содержать внутренние сведения. Возвращаем только статус и пояснение.
        sendJson(response, 502, { error: `Учебный сервер вернул HTTP ${upstream.status}.` });
        return;
      }
      sendJson(response, 200, await upstream.json());
    } catch (error) {
      const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
      // Не логируем error.message: внешняя ошибка потенциально может содержать ключ.
      sendJson(response, timedOut ? 504 : 502, {
        error: timedOut ? 'Учебный сервер не ответил вовремя.' : 'Не удалось получить данные учебного сервера.',
      });
    }
  };
}

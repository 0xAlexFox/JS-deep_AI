import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

// Этот модуль выполняется только в Node.js, а не в браузере.
const localEnvPath = fileURLToPath(new URL('../.env.local', import.meta.url));

// Пользователь не выбирает адрес сервера через запрос: разрешены ровно два API.
export const UPSTREAM_URLS = {
  '/api/finance1': 'https://cpa-server-vtel.onrender.com/api/finance1',
  '/api/finance2': 'https://cpa-server-vtel.onrender.com/api/finance2',
};

export function loadServerConfig({ envPath = localEnvPath, env = process.env } = {}) {
  let localEnv = {};
  try {
    // parseEnv разбирает файл в отдельный объект, не изменяя process.env.
    localEnv = parseEnv(readFileSync(envPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error('Не удалось прочитать локальные настройки .env.local.');
    }
  }

  // Префикс VITE_ раскрыл бы значение браузеру. Не допускаем такую настройку.
  if (Object.hasOwn(env, 'VITE_FINANCE_API_KEY') || Object.hasOwn(localEnv, 'VITE_FINANCE_API_KEY')) {
    throw new Error('Используй FINANCE_API_KEY без префикса VITE_: ключ нужен только серверу.');
  }

  // Переменные окружения имеют приоритет. Пустой ключ тоже является ошибкой.
  const apiKey = (env.FINANCE_API_KEY ?? localEnv.FINANCE_API_KEY)?.trim();
  if (!apiKey || /[\r\n]/.test(apiKey)) {
    throw new Error('Не задан FINANCE_API_KEY. Скопируй .env.example в .env.local и укажи ключ.');
  }

  const portText = env.PORT ?? localEnv.PORT ?? '5173';
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('PORT должен быть целым числом от 1024 до 65535.');
  }

  // Значение apiKey не печатается и не экспортируется в клиентские настройки.
  return { apiKey, port };
}

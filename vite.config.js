import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { loadServerConfig } from './server/config.js';
import { createFinanceMiddleware } from './server/finance-proxy.js';

// Конфигурация Vite выполняется в Node.js. Секрет остаётся в серверном коде:
// мы не используем для него ни VITE_*, ни define, ни import.meta.env в браузере.
export default defineConfig(({ command }) => {
  // Сборка не требует ключа; dev и preview без настроек завершатся с пояснением.
  const config = command === 'serve' ? loadServerConfig() : null;

  const localApi = {
    name: 'local-finance-api',
    configureServer(server) {
      server.middlewares.use(createFinanceMiddleware(config));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createFinanceMiddleware(config));
    },
  };

  return {
    plugins: [vue(), localApi],
    server: {
      host: '127.0.0.1',
      port: config?.port ?? 5173,
      strictPort: true,
      fs: {
        // Сохраняем стандартные запреты Vite и дополнительно закрываем
        // локальные файлы, серверные модули и конфигурацию от HTTP-запросов.
        deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local/**', '**/*.local', '**/server/**', '**/vite.config.*'],
      },
    },
    preview: {
      host: '127.0.0.1',
      port: config?.port ?? 5173,
      strictPort: true,
    },
  };
});

import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// Компонентные тесты изолированы от dev-сервера и настоящих API/секретов.
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['tests/components/**/*.test.js'],
    fileParallelism: false,
    maxWorkers: 1,
  },
});

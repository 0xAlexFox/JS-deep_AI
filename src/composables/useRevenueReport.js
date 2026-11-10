import { computed, readonly, ref, shallowReadonly, shallowRef } from 'vue';
import { DEFAULT_TARGET_CURRENCY } from '../config.js';
import { normalizeCurrency } from '../domain/money.js';
import { calculateTotalInCurrency } from '../domain/revenue.js';
import { chooseTarget, loadRevenueReport } from '../services/reports.js';

// Composable хранит состояние экрана. Компоненты получают данные и вызывают
// действия, а Vue сам обновляет разметку — ручных querySelector здесь нет.
export function useRevenueReport({
  loadReport = (target, options) => loadRevenueReport(options, target), logger = console,
} = {}) {
  const status = ref('idle');
  // shallowRef оставляет Map и снимок курсов обычными объектами без deep proxy.
  const report = shallowRef(null);
  const error = shallowRef(null);
  const selectedCurrency = ref(DEFAULT_TARGET_CURRENCY);
  const conversionFailed = ref(false);
  let pending = null;
  let disposed = false;

  const currencies = computed(() => [...(report.value?.totalsInCents.keys() ?? [])]);
  const loading = computed(() => status.value === 'idle' || status.value === 'loading');
  const canChangeCurrency = computed(() => !loading.value && currencies.value.length > 0);

  function applyCurrency(source, target) {
    const result = calculateTotalInCurrency(source.totalsInCents, source.rates, target);
    report.value = { ...source, result };
    selectedCurrency.value = target;
    error.value = null;
    conversionFailed.value = false;
    status.value = 'ready';
    logger.log('Выручка за день:', result);
  }

  function fail(cause, conversion) {
    error.value = cause instanceof Error ? cause : new Error('Неизвестная ошибка.');
    conversionFailed.value = conversion;
    status.value = 'error';
    logger.error(conversion ? 'Не удалось изменить целевую валюту:' : 'Не удалось рассчитать выручку за день:', error.value.message);
  }

  async function refresh() {
    if (status.value === 'loading' || disposed) return; // Не запускаем вторую загрузку поверх первой.
    report.value = null; // Устаревший отчёт не выдаём за свежий.
    error.value = null;
    conversionFailed.value = false;
    status.value = 'loading';
    const request = new AbortController();
    pending = request;
    try {
      const loaded = await loadReport(selectedCurrency.value, { signal: request.signal });
      if (disposed || request.signal.aborted) return;
      applyCurrency(loaded, chooseTarget([...loaded.totalsInCents.keys()], selectedCurrency.value));
    } catch (cause) {
      if (!disposed && !request.signal.aborted) fail(cause, false);
    } finally {
      if (pending === request) pending = null;
    }
  }

  function changeCurrency(value) {
    if (disposed || loading.value || !report.value) return;
    try {
      const target = normalizeCurrency(value);
      if (!report.value.totalsInCents.has(target)) {
        throw new Error('Выбери валюту, которая есть в оплаченных продажах.');
      }
      if (target === selectedCurrency.value && !conversionFailed.value) return;
      // Каждый раз берём исходные целые центы и тот же снимок курсов, без fetch.
      applyCurrency(report.value, target);
    } catch (cause) {
      fail(cause, true); // Сохраняем данные, чтобы можно было выбрать другую валюту.
    }
  }

  function dispose() {
    disposed = true;
    pending?.abort(); // Закрытый экран не оставляет запросы и запоздавшие обновления.
  }

  return {
    status: readonly(status), report: shallowReadonly(report), error: shallowReadonly(error),
    selectedCurrency: readonly(selectedCurrency), conversionFailed: readonly(conversionFailed),
    currencies, loading, canChangeCurrency, refresh, changeCurrency, dispose,
  };
}

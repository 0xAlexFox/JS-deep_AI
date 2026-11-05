import { loadFinanceSources, loadExchangeRates } from './api.js';
import { collectTotalsInCents, calculateTotalInCurrency } from './revenue.js';
import { DEFAULT_TARGET_CURRENCY } from './config.js';
import { normalizeCurrency } from './money.js';

function chooseTarget(currencies, preferred = DEFAULT_TARGET_CURRENCY) {
  if (currencies.includes(preferred)) return preferred;
  if (currencies.includes(DEFAULT_TARGET_CURRENCY)) return DEFAULT_TARGET_CURRENCY;
  return currencies[0] ?? DEFAULT_TARGET_CURRENCY;
}

// Загрузка и расчёты отделены от DOM. При ошибке не возвращаем частичный отчёт.
export async function loadRevenueReport(options = {}, preferredCurrency = DEFAULT_TARGET_CURRENCY) {
  const [[source1, source2], { rates, updatedAt }] = await Promise.all([
    loadFinanceSources(options), loadExchangeRates(options),
  ]);
  const totalsInCents = collectTotalsInCents(source1, source2);
  const target = chooseTarget([...totalsInCents.keys()], preferredCurrency);
  return {
    result: calculateTotalInCurrency(totalsInCents, rates, target),
    totalsByCurrency: Object.fromEntries(Array.from(totalsInCents, ([currency, cents]) => [currency, cents / 100])),
    // Оставляем точные исходные группы для последующих переключений без запросов.
    totalsInCents,
    rates,
    updatedAt,
  };
}

// Контроллер связывает загрузку с состояниями интерфейса.
// Передача view и loadReport параметрами позволяет тестировать его без браузера.
export function createDashboardController({
  view,
  loadReport = (target) => loadRevenueReport({}, target),
  logger = console,
}) {
  let loading = false;
  let currentReport = null;
  let selectedCurrency = DEFAULT_TARGET_CURRENCY;
  let conversionFailed = false;

  function showInCurrency(report, currency) {
    const result = calculateTotalInCurrency(report.totalsInCents, report.rates, currency);
    const nextReport = { ...report, result };
    view.showReport(nextReport);
    selectedCurrency = currency;
    currentReport = nextReport;
    conversionFailed = false;
    logger.log('Выручка за день:', result);
  }

  async function refresh() {
    // Защита от двойного клика и перезаписи новых данных запоздавшим ответом.
    if (loading) return;
    loading = true;
    currentReport = null;
    conversionFailed = false;
    view.showLoading();
    try {
      const report = await loadReport(selectedCurrency);
      // Сохраняем выбор после обновления, если эта валюта всё ещё есть в продажах.
      const target = chooseTarget([...report.totalsInCents.keys()], selectedCurrency);
      showInCurrency(report, target);
    } catch (error) {
      view.showError(error);
      logger.error('Не удалось рассчитать выручку за день:', error.message);
    } finally {
      // После ошибки тоже разрешаем повторную попытку.
      loading = false;
    }
  }

  function changeCurrency(value) {
    if (loading || !currentReport) return;
    try {
      const target = normalizeCurrency(value);
      if (!currentReport.totalsInCents.has(target)) {
        throw new Error('Выбери валюту, которая есть в оплаченных продажах.');
      }
      if (target === selectedCurrency && !conversionFailed) return;
      // Используем сохранённые продажи и тот же снимок курсов, без fetch.
      showInCurrency(currentReport, target);
    } catch (error) {
      conversionFailed = true;
      view.showError(error, { allowCurrencyChange: true });
      logger.error('Не удалось изменить целевую валюту:', error.message);
    }
  }

  return { refresh, changeCurrency };
}

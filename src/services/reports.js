import { loadFinanceSources, loadExchangeRates } from './api.js';
import { collectTotalsInCents, calculateTotalInCurrency } from '../domain/revenue.js';
import { DEFAULT_TARGET_CURRENCY } from '../config.js';

export function chooseTarget(currencies, preferred = DEFAULT_TARGET_CURRENCY) {
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

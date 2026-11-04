import './style.css';
import { loadFinanceSources, loadUsdRates } from './api.js';
import { calculateDailyRevenue } from './revenue.js';

// Единственная точка входа: старый расчёт из script.js теперь разделён на модули,
// а вместо фиксированных данных main получает реальные ответы серверов.
async function main() {
  // Оба источника и курсы независимы, поэтому загружаем их параллельно.
  // await ждёт завершения Promise.all. Если хотя бы один запрос не удался,
  // расчёт не выполняется: частичную выручку нельзя выдавать за полную.
  const [[source1, source2], rates] = await Promise.all([
    loadFinanceSources(),
    loadUsdRates(),
  ]);

  const result = calculateDailyRevenue(source1, source2, rates);
  console.log('Выручка за день:', result);
}

// catch перехватывает ошибки загрузки, формата данных и расчёта.
// При успехе выводится только итог, без сообщений о завершении запросов и тестах.
main().catch((error) => {
  console.error('Не удалось рассчитать выручку за день:', error.message);
});

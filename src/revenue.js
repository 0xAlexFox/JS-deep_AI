import { TARGET_CURRENCY } from './config.js';
import { normalizeCurrency, toCents, addCents } from './money.js';
import { convertToUsdCents } from './currency.js';

// Сначала собираем отдельные суммы валют. Map хранит пары «валюта -> центы»:
// например, USD -> 302000 и EUR -> 191000. Их ещё нельзя складывать друг с другом.
function collectTotalsInCents(source1, source2) {
  if (!Array.isArray(source1?.transactions) || !Array.isArray(source2)) {
    throw new Error('Ожидаются объект с массивом transactions и массив строк.');
  }

  const totals = new Map();

  // Оба источника используют одну проверку суммы и нормализацию валюты.
  // Вложенная функция видит totals внешней функции — это замыкание.
  function addSale(amount, rawCurrency) {
    const currency = normalizeCurrency(rawCurrency);
    const cents = toCents(amount);
    // ?? 0 означает: если такая валюта ещё не встречалась, начинаем сумму с нуля.
    totals.set(currency, addCents(totals.get(currency) ?? 0, cents));
  }

  for (const transaction of source1.transactions) {
    if (transaction === null || typeof transaction !== 'object' || Array.isArray(transaction)) {
      throw new Error('Транзакция должна быть объектом.');
    }

    // Неоплаченные транзакции пропускаем целиком: ни сумма, ни валюта
    // таких транзакций не должны участвовать в расчёте или требовать курса.
    if (transaction.type !== 'paid') {
      continue;
    }
    addSale(transaction.amount, transaction.currency);
  }

  for (const sale of source2) {
    if (typeof sale !== 'string') {
      throw new Error('Продажа из второго источника должна быть строкой.');
    }

    // trim удаляет крайние пробелы, split делит по одному или нескольким пробелам.
    // Деструктуризация записывает сумму и валюту в отдельные переменные.
    const parts = sale.trim().split(/\s+/);
    if (parts.length !== 2) {
      throw new Error("Ожидается строка в формате '300 USD'.");
    }
    const [amountText, currency] = parts;
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(amountText)) {
      throw new Error('Сумма в строке должна быть десятичным числом с не более чем двумя знаками после точки.');
    }

    // Только после проверки формата превращаем строку в число.
    // Это не позволяет Number принять запись вроде 0x10 или 1e3.
    addSale(Number(amountText), currency);
  }

  return totals;
}

// Часть 3 задания: результат БЕЗ конвертации, отдельная сумма для каждой валюты.
// Эту функцию можно вызвать для проверки, но основной запуск её не печатает.
export function calculateRevenueByCurrency(source1, source2) {
  const totals = collectTotalsInCents(source1, source2);
  // Array.from превращает Map в массив пар; Object.fromEntries — пары в объект.
  return Object.fromEntries(Array.from(totals, ([currency, cents]) => [currency, cents / 100]));
}

// Часть 4: передаём загруженную таблицу курсов и получаем общий итог в USD.
// Расчёт не делает запросов и не меняет входные данные — его удобно тестировать.
export function calculateDailyRevenue(source1, source2, rates = {}) {
  const totals = collectTotalsInCents(source1, source2);
  let totalUsdCents = 0;

  for (const [currency, cents] of totals) {
    // Нулевая продажа не увеличивает итог и не нуждается в курсе.
    if (cents === 0) {
      continue;
    }
    const converted = convertToUsdCents(cents, currency, rates);
    totalUsdCents = addCents(totalUsdCents, converted);
  }

  // При пустых источниках также возвращаем 0 USD: целевая валюта задана явно.
  return { total: totalUsdCents / 100, currency: TARGET_CURRENCY };
}

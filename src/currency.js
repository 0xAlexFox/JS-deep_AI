import { TARGET_CURRENCY } from './config.js';

// amountCents уже содержит сумму только одной валюты.
export function convertToUsdCents(amountCents, currency, rates) {
  // Доллары не требуют конвертации и наличия курса в таблице.
  if (currency === TARGET_CURRENCY) {
    return amountCents;
  }

  const rate = rates?.[currency];
  if (!Number.isFinite(rate) || rate <= 0) {
    // Не подставляем курс 1 и не пропускаем продажи при отсутствии курса.
    throw new Error(`Нет корректного курса для валюты ${currency}.`);
  }

  // ВАЖНО: таблица отвечает на вопрос «сколько EUR за 1 USD».
  // Поэтому при переводе EUR -> USD ДЕЛИМ, а не умножаем.
  // Учебный пример: при курсе 0.8 EUR за 1 USD, 300 EUR / 0.8 = 375 USD.
  // Так как обе суммы в сотых долях, делить на 100 здесь не требуется.
  // Округляем итог каждой валютной группы до ближайшего цента USD один раз.
  const usdCents = Math.round(amountCents / rate);
  if (!Number.isSafeInteger(usdCents)) {
    throw new Error(`Сумма после конвертации ${currency} в USD слишком велика.`);
  }
  return usdCents;
}

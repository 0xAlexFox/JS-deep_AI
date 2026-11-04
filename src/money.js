// Приводим к одному виду и USD из первого источника, и usd из второго.
export function normalizeCurrency(value) {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value.trim().toUpperCase())) {
    throw new Error('Валюта должна быть трёхбуквенным кодом, например USD.');
  }
  return value.trim().toUpperCase();
}

// Для учебного решения оставляем правило предыдущей работы: максимум два знака
// после точки. Внутри считаем в целых сотых долях валюты (центах для USD/EUR).
export function toCents(amount) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Сумма продажи должна быть неотрицательным конечным числом.');
  }

  // Math.round устраняет погрешность умножения вроде 0.29 * 100.
  // Обратное деление не позволяет молча округлить исходную цену 1.234 до 1.23.
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents) || cents / 100 !== amount) {
    throw new Error('Сумма должна иметь не более двух знаков после точки и помещаться в безопасный диапазон центов.');
  }
  return cents;
}

export function addCents(total, cents) {
  const sum = total + cents;
  if (!Number.isSafeInteger(sum)) {
    throw new Error('Общая выручка превышает безопасный диапазон центов.');
  }
  return sum;
}

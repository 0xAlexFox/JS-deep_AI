import { FINANCE_URLS, RATES_URL, RATES_BASE_CURRENCY } from '../config.js';

// Публичное описание подключений. Здесь нет серверных настроек и ключа.
// Примеры показывают формат, а не реальные платежи или текущие котировки.
export const dataSources = [
  {
    id: 'finance1', number: '01', name: 'Первый источник продаж',
    endpoint: FINANCE_URLS[0], description: 'Транзакции со статусами',
    rule: 'Только оплаченные', ruleDescription: 'Учитываем записи со статусом paid',
    example: JSON.stringify({ transactions: [{ type: 'paid', amount: 300, currency: 'USD' }] }, null, 2),
    exampleNote: 'Пример структуры. Ожидающие и отклонённые платежи не увеличивают выручку.',
  },
  {
    id: 'finance2', number: '02', name: 'Второй источник продаж',
    endpoint: FINANCE_URLS[1], description: 'Сумма и валюта в каждой строке',
    rule: 'Все записи', ruleDescription: 'Каждая строка считается оплаченной продажей',
    example: JSON.stringify(['300 usd', '120 eur'], null, 2),
    exampleNote: 'Пример структуры. Коды usd и USD приводятся к одному виду перед расчётом.',
  },
  {
    id: 'rates', number: '03', name: 'Курсы валют',
    endpoint: RATES_URL.replace(/^https:\/\//, ''), description: 'ExchangeRate-API',
    rule: `База — ${RATES_BASE_CURRENCY}`, ruleDescription: 'Курсы обновляются ежедневно',
    example: JSON.stringify({ result: 'success', base_code: RATES_BASE_CURRENCY, rates: { USD: 1, EUR: 0.9 } }, null, 2),
    exampleNote: 'Пример структуры, курс условный. В отчёте используются загруженные курсы и дата поставщика.',
  },
];

export const calculationSteps = [
  { title: 'Получаем продажи', description: 'Из двух источников' },
  { title: 'Группируем по валютам', description: 'Суммируем каждую валюту отдельно' },
  { title: 'Пересчитываем итог', description: 'По выбранной целевой валюте' },
];

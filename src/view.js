import { getExchangeRate } from './currency.js';

// Intl форматирует суммы с двумя знаками, а курсы — с нужными значащими цифрами.
const moneyFormat = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const rateFormat = new Intl.NumberFormat('ru-RU', { maximumSignificantDigits: 7 });
const currencyNames = new Intl.DisplayNames(['ru'], { type: 'currency' });
const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Moscow',
});

export function createDashboardView(root) {
  const document = root.ownerDocument;
  const find = (selector) => root.querySelector(selector);
  const refreshButton = find('#refresh-button');
  const retryButton = find('#retry-button');
  const reportPanel = find('#report-panel');
  const loadingPanel = find('#loading-panel');
  const errorPanel = find('#error-panel');
  const status = find('#load-status');
  const currencyList = find('#currency-list');
  const ratesBody = find('#rates-body');
  const currencySelect = find('#target-currency');

  // Данные записываем через textContent: даже HTML из ответа станет обычным
  // текстом, а не исполняемым кодом. innerHTML для серверных значений не используем.
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }

  function setState(state, text) {
    const busy = state === 'loading';
    root.dataset.state = state;
    root.setAttribute('aria-busy', String(busy));
    refreshButton.disabled = busy;
    currencySelect.disabled = state !== 'ready' || !currencySelect.value;
    find('#refresh-label').textContent = busy ? 'Обновляем…' : 'Обновить данные';
    status.textContent = text;
    reportPanel.hidden = state !== 'ready';
    loadingPanel.hidden = !busy;
    errorPanel.hidden = state !== 'error';
  }

  function showCurrencyOptions(totals, target) {
    currencySelect.replaceChildren();
    const currencies = Object.keys(totals);
    if (currencies.length === 0) {
      const option = element('option', '', 'Нет платежей');
      option.value = '';
      currencySelect.append(option);
      return;
    }
    for (const currency of currencies) {
      const option = element('option', '', currency);
      option.value = currency;
      currencySelect.append(option);
    }
    currencySelect.value = target;
  }

  function showCurrencies(totals, target) {
    currencyList.replaceChildren();
    const entries = Object.entries(totals);
    if (entries.length === 0) {
      currencyList.append(element('li', 'empty-message', `Оплаченных продаж пока нет. Общая выручка — 0 ${target}.`));
      return;
    }
    // Карточки строятся по данным: AED, GBP и другие валюты не требуют
    // отдельной разметки или ручного добавления в список.
    for (const [currency, amount] of entries) {
      const card = element('li', 'currency-card', '');
      const heading = element('div', 'currency-card-heading', '');
      heading.append(element('span', 'currency-code', currency),
        element('span', 'currency-name', currencyNames.of(currency)));
      const value = element('p', 'currency-value', moneyFormat.format(amount));
      value.append(element('span', 'currency-unit', currency));
      card.append(heading, value, element('p', 'currency-note', currency === target
        ? 'Целевая валюта отчёта' : 'Учтено в общей выручке после пересчёта'));
      currencyList.append(card);
    }
  }

  function formatConversion(from, to, rates) {
    try {
      return `${rateFormat.format(getExchangeRate(from, to, rates))} ${to}`;
    } catch {
      // У нулевой продажи курс может отсутствовать: расчёт её не конвертирует.
      return 'Нет курса';
    }
  }

  function showRates(totals, rates, target) {
    ratesBody.replaceChildren();
    const currencies = new Set([target, ...Object.keys(totals)]);
    for (const currency of currencies) {
      const row = document.createElement('tr');
      const label = element('th', 'rate-currency', currency);
      label.scope = 'row';
      label.append(element('span', 'rate-name', currencyNames.of(currency)));
      row.append(label,
        element('td', 'rate-value', formatConversion(currency, target, rates)),
        element('td', 'rate-value reverse-rate', formatConversion(target, currency, rates)));
      ratesBody.append(row);
    }
  }

  return {
    onRefresh(handler) {
      refreshButton.addEventListener('click', handler);
      retryButton.addEventListener('click', handler);
    },
    onCurrencyChange(handler) {
      currencySelect.addEventListener('change', (event) => handler(event.target.value));
    },
    showLoading() {
      // Скрываем прежний отчёт, чтобы не выдавать его за свежий во время загрузки.
      setState('loading', 'Получаем продажи и курсы валют');
    },
    showReport({ result, totalsByCurrency, rates, updatedAt }) {
      find('#total-value').textContent = moneyFormat.format(result.total);
      find('#total-currency').textContent = result.currency;
      find('#total-caption-text').textContent = `Все учтённые валюты пересчитаны в ${result.currency}`;
      find('#currency-section-label').textContent = `До пересчёта в ${result.currency}`;
      find('#rate-target-heading').textContent = `Обратный курс: 1 ${result.currency}`;
      find('#rate-table-caption').textContent = `Курсы для пересчёта выручки в ${result.currency}`;
      find('#report-footer-text').textContent = `Продажи из двух источников · Итог в ${result.currency}`;
      showCurrencyOptions(totalsByCurrency, result.currency);
      showCurrencies(totalsByCurrency, result.currency);
      showRates(totalsByCurrency, rates, result.currency);
      const updated = find('#rates-updated');
      if (updatedAt) {
        updated.dateTime = updatedAt;
        updated.textContent = `${dateFormat.format(new Date(updatedAt))} МСК`;
      } else {
        updated.removeAttribute('datetime');
        updated.textContent = 'Дата не указана поставщиком';
      }
      setState('ready', 'Данные загружены · 2 источника');
    },
    showError(error, { allowCurrencyChange = false } = {}) {
      find('#error-heading').textContent = allowCurrencyChange
        ? 'Не удалось пересчитать выручку' : 'Не удалось загрузить отчёт';
      find('#error-message').textContent = allowCurrencyChange
        ? 'Выберите другую целевую валюту вверху страницы или обновите данные. Причина указана в подробностях ниже.'
        : 'Не удалось получить или обработать все данные. Повторите попытку. Если ошибка повторится, откройте подробности ниже.';
      find('#error-details').textContent = error.message || 'Неизвестная ошибка.';
      find('#error-disclosure').open = false;
      setState('error', allowCurrencyChange ? 'Не удалось пересчитать выручку' : 'Не удалось обновить данные');
      // Ошибка пересчёта не заставляет заново загружать данные: можно выбрать
      // другую валюту. При сетевой ошибке переключатель остаётся заблокирован.
      if (allowCurrencyChange && currencySelect.value) currencySelect.disabled = false;
      // Фокус делает ошибку заметной и при управлении с клавиатуры.
      find('#error-heading').focus();
    },
  };
}

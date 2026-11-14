import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import App from '../../src/App.vue';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../../src/router.js';
import { loadRevenueReport } from '../../src/services/reports.js';

// Подменяем границу API. Компоненты, composable и денежные расчёты настоящие.
vi.mock('../../src/services/reports.js', async (importOriginal) => ({
  ...await importOriginal(),
  loadRevenueReport: vi.fn(),
}));
const loadReport = vi.mocked(loadRevenueReport);
const updatedAt = '2026-11-05T00:00:00.000Z';
const makeReport = () => ({
  result: { total: 475, currency: 'USD' },
  totalsByCurrency: { USD: 100, EUR: 300 },
  totalsInCents: new Map([['USD', 10000], ['EUR', 30000]]),
  rates: { USD: 1, EUR: 0.8 }, updatedAt,
});

let wrapper;
let router;
beforeEach(async () => {
  router = createAppRouter({ history: createMemoryHistory(), scroll: false });
  await router.push('/');
  await router.isReady();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  loadReport.mockReset().mockResolvedValue(makeReport());
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function start() {
  wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } });
  return wrapper;
}
const digits = (text) => text.replace(/\s/g, '');

describe('Экран выручки на Vue', () => {
  it('показывает загрузку и блокирует действия, пока нет ответа', async () => {
    let resolve;
    loadReport.mockReturnValue(new Promise((done) => { resolve = done; }));
    const page = start();
    expect(page.find('#loading-panel').exists()).toBe(true);
    expect(page.get('#refresh-button').attributes('disabled')).toBeDefined();
    expect(page.get('#target-currency').attributes('disabled')).toBeDefined();
    expect(page.find('#report-panel').exists()).toBe(false);
    resolve(makeReport());
    await flushPromises();
    expect(page.find('#loading-panel').exists()).toBe(false);
    expect(page.get('main').attributes('aria-busy')).toBe('false');
  });

  it('выводит итог, исходные валюты, оба направления курсов и время поставщика', async () => {
    const page = start();
    await flushPromises();
    expect(page.get('#total-value').text()).toBe('475,00');
    expect(page.get('#total-currency').text()).toBe('USD');
    expect(page.findAll('.currency-card')).toHaveLength(2);
    expect(digits(page.get('#currency-list').text())).toContain('100,00USD');
    expect(digits(page.get('#currency-list').text())).toContain('300,00EUR');
    expect(page.get('#rates-updated').attributes('datetime')).toBe(updatedAt);
    const euroRow = page.findAll('#rates-body tr').find((row) => row.text().includes('EUR'));
    expect(euroRow.text()).toContain('1,25 USD');
    expect(euroRow.text()).toContain('0,8 EUR');
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it('меняет USD → EUR → USD без загрузки и без изменения исходных сумм', async () => {
    const page = start();
    await flushPromises();
    const select = page.get('#target-currency');
    expect(page.findAll('option').map((item) => item.attributes('value'))).toEqual(['USD', 'EUR']);
    await select.setValue('EUR');
    expect(page.get('#total-value').text()).toBe('380,00');
    expect(page.get('#total-currency').text()).toBe('EUR');
    expect(page.get('caption').text()).toContain('EUR');
    expect(digits(page.get('#currency-list').text())).toContain('100,00USD');
    await select.setValue('USD');
    expect(page.get('#total-value').text()).toBe('475,00');
    expect(loadReport).toHaveBeenCalledTimes(1);
  });

  it('показывает ошибку безопасным текстом, переводит фокус и позволяет повторить', async () => {
    const message = '<img src=x onerror=alert(1)> Сервер недоступен';
    loadReport.mockRejectedValueOnce(new Error(message));
    const page = start();
    await flushPromises();
    expect(page.get('#error-details').text()).toBe(message);
    expect(page.find('img').exists()).toBe(false);
    expect(document.activeElement?.id).toBe('error-heading');
    expect(page.find('#report-panel').exists()).toBe(false);
    expect(page.get('#target-currency').attributes('disabled')).toBeDefined();
    await page.get('#retry-button').trigger('click');
    await flushPromises();
    expect(page.find('#error-panel').exists()).toBe(false);
    expect(page.get('#total-value').text()).toBe('475,00');
    expect(loadReport).toHaveBeenCalledTimes(2);
  });

  it('не оставляет прежний отчёт на экране при неудачном обновлении', async () => {
    const page = start();
    await flushPromises();
    loadReport.mockRejectedValueOnce(new Error('Ошибка обновления'));
    await page.get('#refresh-button').trigger('click');
    expect(page.find('#report-panel').exists()).toBe(false);
    await flushPromises();
    expect(page.get('#error-heading').text()).toBe('Не удалось загрузить отчёт');
    expect(page.get('#target-currency').attributes('disabled')).toBeDefined();
  });

  it('после ошибки конвертации позволяет вернуться к прежней валюте без API', async () => {
    loadReport.mockResolvedValue({
      result: { total: 40000000000000, currency: 'USD' },
      totalsByCurrency: { USD: 40000000000000, EUR: 0 },
      totalsInCents: new Map([['USD', 4000000000000000], ['EUR', 0]]),
      rates: { USD: 1, EUR: 2 }, updatedAt,
    });
    const page = start();
    await flushPromises();
    await page.get('#target-currency').setValue('EUR');
    await flushPromises();
    expect(page.get('#error-heading').text()).toContain('пересчитать');
    expect(page.get('#error-message').text()).toContain('другую целевую валюту');
    expect(page.get('#target-currency').attributes('disabled')).toBeUndefined();
    await page.get('#target-currency').setValue('USD');
    expect(page.find('#error-panel').exists()).toBe(false);
    expect(page.get('#total-currency').text()).toBe('USD');
    expect(loadReport).toHaveBeenCalledTimes(1);
  });

  it('выводит пустой отчёт как нулевую выручку с заблокированным выбором', async () => {
    loadReport.mockResolvedValue({
      result: { total: 0, currency: 'USD' }, totalsByCurrency: {},
      totalsInCents: new Map(), rates: { USD: 1 }, updatedAt: null,
    });
    const page = start();
    await flushPromises();
    expect(page.get('#total-value').text()).toBe('0,00');
    expect(page.get('.empty-message').text()).toContain('Оплаченных продаж пока нет');
    expect(page.get('#target-currency').attributes('disabled')).toBeDefined();
    expect(page.get('#rates-updated').text()).toBe('Дата не указана поставщиком');
    expect(page.get('#rates-updated').attributes('datetime')).toBeUndefined();
  });

  it('строит список валют из обновлённых данных и выбирает доступную цель', async () => {
    const page = start();
    await flushPromises();
    await page.get('#target-currency').setValue('EUR');
    loadReport.mockResolvedValueOnce({
      result: { total: 50, currency: 'AED' }, totalsByCurrency: { AED: 50 },
      totalsInCents: new Map([['AED', 5000]]), rates: { USD: 1, AED: 4 }, updatedAt,
    });
    await page.get('#refresh-button').trigger('click');
    await flushPromises();
    expect(page.findAll('option').map((item) => item.attributes('value'))).toEqual(['AED']);
    expect(page.get('#total-currency').text()).toBe('AED');
    expect(page.get('#total-value').text()).toBe('50,00');
    expect(loadReport.mock.calls.at(-1)?.[1]).toBe('EUR');
  });

  it('честно обозначает отсутствующий курс нулевой продажи', async () => {
    loadReport.mockResolvedValue({
      ...makeReport(), totalsByCurrency: { USD: 100, EUR: 300, AED: 0 },
      totalsInCents: new Map([['USD', 10000], ['EUR', 30000], ['AED', 0]]),
    });
    const page = start();
    await flushPromises();
    const row = page.findAll('#rates-body tr').find((item) => item.text().includes('AED'));
    expect(row.text()).toContain('Нет курса');
    expect(page.get('#total-value').text()).toBe('475,00');
  });

  it('отменяет загрузку при размонтировании и игнорирует запоздавший ответ', async () => {
    let resolve;
    loadReport.mockReturnValue(new Promise((done) => { resolve = done; }));
    const page = start();
    const signal = loadReport.mock.calls[0][0].signal;
    expect(signal.aborted).toBe(false);
    page.unmount();
    wrapper = undefined;
    expect(signal.aborted).toBe(true);
    resolve(makeReport());
    await flushPromises();
    expect(console.log).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('открывает /sources напрямую без загрузки финансовых данных', async () => {
    await router.push('/sources');
    const page = start();
    await flushPromises();
    expect(page.get('h1').text()).toBe('Источники данных');
    expect(document.title).toBe('Сводка — источники данных');
    expect(page.findAll('.source-row')).toHaveLength(3);
    expect(page.text()).toContain('/api/finance1');
    expect(page.text()).toContain('/api/finance2');
    expect(page.text()).toContain('open.er-api.com/v6/latest/USD');
    expect(page.get('.app-nav a[href="/sources"]').attributes('aria-current')).toBe('page');
    expect(page.find('#target-currency').exists()).toBe(false);
    expect(page.find('#loading-panel').exists()).toBe(false);
    expect(page.get('main').attributes('aria-busy')).toBe('false');
    expect(loadReport).not.toHaveBeenCalled();
    expect(page.text()).not.toContain('FINANCE_API_KEY');
  });

  it('показывает раскрываемые примеры как условную структуру ответа', async () => {
    await router.push('/sources');
    const page = start();
    const details = page.get('.source-example');
    expect(details.element.open).toBe(false);
    details.get('summary').element.click();
    await flushPromises();
    expect(details.element.open).toBe(true);
    expect(details.get('pre').text()).toContain('"transactions"');
    expect(details.text()).toContain('Пример структуры');
    expect(page.text()).toContain('курс условный');
    expect(loadReport).not.toHaveBeenCalled();
  });

  it('навигация сохраняет EUR и готовый отчёт без дополнительных запросов', async () => {
    const page = start();
    await flushPromises();
    await page.get('#target-currency').setValue('EUR');
    await page.get('.app-nav a[href="/sources"]').trigger('click');
    await vi.waitFor(() => expect(page.find('#sources-heading').exists()).toBe(true));
    await page.get('.sources-back').trigger('click');
    await vi.waitFor(() => expect(page.find('#total-value').exists()).toBe(true));
    expect(page.get('#total-value').text()).toBe('380,00');
    expect(page.get('#target-currency').element.value).toBe('EUR');
    expect(loadReport).toHaveBeenCalledTimes(1);
    expect(document.title).toBe('Сводка — выручка за день');
  });

  it('история назад/вперёд переключает страницы и активный пункт навигации', async () => {
    const page = start();
    await flushPromises();
    await router.push('/sources');
    router.back();
    await vi.waitFor(() => expect(page.find('#total-value').exists()).toBe(true));
    expect(page.get('.app-nav a[href="/"]').attributes('aria-current')).toBe('page');
    router.forward();
    await vi.waitFor(() => expect(page.find('#sources-heading').exists()).toBe(true));
    expect(page.get('.app-nav a[href="/sources"]').attributes('aria-current')).toBe('page');
    expect(loadReport).toHaveBeenCalledTimes(1);
  });

  it('переход во время загрузки сохраняет её результат для возвращения к отчёту', async () => {
    let resolve;
    loadReport.mockReturnValue(new Promise((done) => { resolve = done; }));
    const page = start();
    await router.push('/sources');
    resolve(makeReport());
    await flushPromises();
    expect(page.find('#sources-heading').exists()).toBe(true);
    await router.push('/');
    await flushPromises();
    expect(page.get('#total-value').text()).toBe('475,00');
    expect(loadReport).toHaveBeenCalledTimes(1);
  });
});

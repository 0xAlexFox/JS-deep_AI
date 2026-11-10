const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const rateFormatter = new Intl.NumberFormat('ru-RU', { maximumSignificantDigits: 7 });
const currencyNames = new Intl.DisplayNames(['ru'], { type: 'currency' });
const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Moscow',
});

export const formatMoney = (amount) => moneyFormatter.format(amount);
export const formatRate = (rate) => rateFormatter.format(rate);
export const currencyName = (currency) => currencyNames.of(currency) ?? currency;
export const formatUpdatedAt = (date) => `${dateFormatter.format(new Date(date))} МСК`;

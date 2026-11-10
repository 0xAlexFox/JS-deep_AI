<script setup>
import { computed } from 'vue';
import { getExchangeRate } from '../domain/currency.js';
import { currencyName, formatRate, formatUpdatedAt } from '../utils/format.js';
const props = defineProps({
  currencies: { type: Array, required: true },
  target: { type: String, required: true },
  rates: { type: Object, required: true },
  updatedAt: { type: String, default: null },
});
function conversion(from, to) {
  try {
    return `${formatRate(getExchangeRate(from, to, props.rates))} ${to}`;
  } catch {
    // Нулевую продажу считать можно и без курса: не придумываем его для таблицы.
    return 'Нет курса';
  }
}
const rows = computed(() => [...new Set([props.target, ...props.currencies])].map((currency) => ({
  currency, direct: conversion(currency, props.target), reverse: conversion(props.target, currency),
})));
</script>

<template>
  <section class="section" aria-labelledby="rates-heading">
    <div class="section-heading"><h2 id="rates-heading">Курсы валют</h2><span class="section-label">Для расчёта общей выручки</span></div>
    <div class="rates-card">
      <div class="rates-update"><span class="update-dot" aria-hidden="true"></span>Обновлено поставщиком:
        <time id="rates-updated" :datetime="updatedAt ?? undefined">{{ updatedAt ? formatUpdatedAt(updatedAt) : 'Дата не указана поставщиком' }}</time>
      </div>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Таблица курсов валют">
        <table>
          <caption class="visually-hidden">Курсы для пересчёта выручки в {{ target }}</caption>
          <thead><tr><th scope="col">Валюта</th><th scope="col">За 1 единицу валюты</th><th scope="col">Обратный курс: 1 {{ target }}</th></tr></thead>
          <tbody id="rates-body">
            <tr v-for="row in rows" :key="row.currency">
              <th scope="row" class="rate-currency">{{ row.currency }}<span class="rate-name">{{ currencyName(row.currency) }}</span></th>
              <td class="rate-value">{{ row.direct }}</td><td class="rate-value reverse-rate">{{ row.reverse }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="rates-footnote">Курсы обновляются ежедневно. Итог каждой валюты округляется до двух знаков после пересчёта.</p>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { currencyName, formatMoney } from '../utils/format.js';
const props = defineProps({
  totals: { type: Object, required: true },
  target: { type: String, required: true },
});
const entries = computed(() => Object.entries(props.totals));
</script>

<template>
  <section class="section" aria-labelledby="currency-heading">
    <div class="section-heading"><h2 id="currency-heading">По валютам</h2><span class="section-label">До пересчёта в {{ target }}</span></div>
    <ul id="currency-list" class="currency-grid">
      <li v-if="!entries.length" class="empty-message">Оплаченных продаж пока нет. Общая выручка — 0 {{ target }}.</li>
      <li v-for="[currency, amount] in entries" :key="currency" class="currency-card">
        <div class="currency-card-heading"><span class="currency-code">{{ currency }}</span><span class="currency-name">{{ currencyName(currency) }}</span></div>
        <p class="currency-value">{{ formatMoney(amount) }}<span class="currency-unit">{{ currency }}</span></p>
        <p class="currency-note">{{ currency === target ? 'Целевая валюта отчёта' : 'Учтено в общей выручке после пересчёта' }}</p>
      </li>
    </ul>
  </section>
</template>

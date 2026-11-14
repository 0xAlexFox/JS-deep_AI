<script setup>
import { RouterLink } from 'vue-router';
defineProps({
  showCurrency: Boolean,
  currencies: { type: Array, required: true },
  selectedCurrency: { type: String, required: true },
  loading: Boolean,
  canChangeCurrency: Boolean,
});
const emit = defineEmits(['changeCurrency']);
</script>

<template>
  <header class="topbar">
    <RouterLink class="brand" to="/" aria-label="Сводка — главная страница">
      <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 15v4m7-10v10m7-16v16" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg></span>
      Сводка<span class="brand-divider" aria-hidden="true"></span><span class="brand-caption">Финансы</span>
    </RouterLink>
    <nav class="app-nav" aria-label="Основная навигация">
      <RouterLink to="/" exact-active-class="app-nav-active">Выручка</RouterLink>
      <RouterLink to="/sources" exact-active-class="app-nav-active">Источники данных</RouterLink>
    </nav>
    <label v-if="showCurrency" class="target-label" for="target-currency">Целевая валюта
      <select id="target-currency" class="target-select" :value="currencies.length ? selectedCurrency : ''" :disabled="!canChangeCurrency" @change="emit('changeCurrency', $event.target.value)">
        <option v-if="!currencies.length" value="">{{ loading ? '—' : 'Нет платежей' }}</option>
        <option v-for="currency in currencies" :key="currency" :value="currency">{{ currency }}</option>
      </select>
    </label>
  </header>
</template>

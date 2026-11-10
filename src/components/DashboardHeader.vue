<script setup>
defineProps({
  currencies: { type: Array, required: true },
  selectedCurrency: { type: String, required: true },
  loading: Boolean,
  canChangeCurrency: Boolean,
});
// Состояние принадлежит родителю: дочерний компонент сообщает только о действии.
const emit = defineEmits(['refresh', 'changeCurrency']);
function selectCurrency(event) {
  emit('changeCurrency', event.target.value);
}
</script>

<template>
  <header class="topbar">
    <a class="brand" href="/" aria-label="Сводка — главная страница">
      <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 15v4m7-10v10m7-16v16" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg></span>
      Сводка<span class="brand-divider" aria-hidden="true"></span><span class="brand-caption">Финансы</span>
    </a>
    <label class="target-label" for="target-currency">Целевая валюта
      <select id="target-currency" class="target-select" :value="currencies.length ? selectedCurrency : ''" :disabled="!canChangeCurrency" @change="selectCurrency">
        <option v-if="!currencies.length" value="">{{ loading ? '—' : 'Нет платежей' }}</option>
        <option v-for="currency in currencies" :key="currency" :value="currency">{{ currency }}</option>
      </select>
    </label>
  </header>
  <div class="page-heading">
    <div>
      <p class="eyebrow">Обзор продаж</p>
      <h1>Выручка за день</h1>
      <p class="page-description">Два источника продаж. Все валюты — в одном отчёте.</p>
    </div>
    <button id="refresh-button" class="button button-primary" type="button" :disabled="loading" @click="emit('refresh')">
      <svg class="refresh-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.55-1.5L20 8M4 16l2.35 2.5A7 7 0 0 0 17.9 17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <span id="refresh-label">{{ loading ? 'Обновляем…' : 'Обновить данные' }}</span>
    </button>
  </div>
</template>

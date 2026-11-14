<script setup>
defineProps({ sourcesPage: Boolean, currency: { type: String, required: true } });
</script>

<template>
  <footer class="page-footer">
    <span>{{ sourcesPage ? 'Источники данных · Продажи и курсы' : `Продажи из двух источников · Итог в ${currency}` }}</span>
    <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Курсы: ExchangeRate-API <svg class="external-icon" aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="M5 3h8v8M13 3 3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg></a>
  </footer>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import DashboardHeader from './components/DashboardHeader.vue';
import ReportSummary from './components/ReportSummary.vue';
import CurrencyBreakdown from './components/CurrencyBreakdown.vue';
import ExchangeRates from './components/ExchangeRates.vue';
import ReportLoading from './components/ReportLoading.vue';
import ReportError from './components/ReportError.vue';
import { useRevenueReport } from './composables/useRevenueReport.js';

// App собирает экран. Сетевые запросы и расчёты находятся вне компонентов.
const {
  status, report, error, selectedCurrency, conversionFailed, currencies,
  loading, canChangeCurrency, refresh, changeCurrency, dispose,
} = useRevenueReport();

const statusText = computed(() => {
  if (status.value === 'ready') return 'Данные загружены · 2 источника';
  if (status.value === 'error') return conversionFailed.value ? 'Не удалось пересчитать выручку' : 'Не удалось обновить данные';
  return 'Получаем продажи и курсы валют';
});
onMounted(refresh);
onUnmounted(dispose);
</script>

<template>
  <main class="dashboard" :data-state="status" :aria-busy="loading">
    <DashboardHeader :currencies="currencies" :selected-currency="selectedCurrency" :loading="loading" :can-change-currency="canChangeCurrency" @refresh="refresh" @change-currency="changeCurrency" />
    <p class="load-status" role="status" aria-live="polite"><span class="status-dot" aria-hidden="true"></span><span id="load-status">{{ statusText }}</span></p>
    <ReportLoading v-if="status === 'loading' || status === 'idle'" />
    <ReportError v-else-if="status === 'error' && error" :error="error" :conversion-failed="conversionFailed" @retry="refresh" />
    <div v-else-if="report" id="report-panel">
      <ReportSummary :result="report.result" />
      <CurrencyBreakdown :totals="report.totalsByCurrency" :target="report.result.currency" />
      <ExchangeRates :currencies="currencies" :target="report.result.currency" :rates="report.rates" :updated-at="report.updatedAt" />
    </div>
    <footer class="page-footer"><span>Продажи из двух источников · Итог в {{ selectedCurrency }}</span><a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Курсы: ExchangeRate-API <span aria-hidden="true">↗</span></a></footer>
  </main>
</template>

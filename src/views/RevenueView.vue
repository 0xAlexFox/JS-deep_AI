<script setup>
import { computed, onMounted } from 'vue';
import DashboardHeader from '../components/DashboardHeader.vue';
import ReportSummary from '../components/ReportSummary.vue';
import CurrencyBreakdown from '../components/CurrencyBreakdown.vue';
import ExchangeRates from '../components/ExchangeRates.vue';
import ReportLoading from '../components/ReportLoading.vue';
import ReportError from '../components/ReportError.vue';

const props = defineProps({ dashboard: { type: Object, required: true } });
// Состояние принадлежит App, поэтому переход на другую страницу его не стирает.
const { status, report, error, conversionFailed, currencies, loading, refresh } = props.dashboard;
const statusText = computed(() => {
  if (status.value === 'ready') return 'Данные загружены · 2 источника';
  if (status.value === 'error') return conversionFailed.value ? 'Не удалось пересчитать выручку' : 'Не удалось обновить данные';
  return 'Получаем продажи и курсы валют';
});
onMounted(() => {
  if (status.value === 'idle') refresh();
});
</script>

<template>
  <section aria-label="Отчёт о выручке">
    <DashboardHeader :loading="loading" @refresh="refresh" />
    <p class="load-status" role="status" aria-live="polite"><span class="status-dot" aria-hidden="true"></span><span id="load-status">{{ statusText }}</span></p>
    <ReportLoading v-if="status === 'loading' || status === 'idle'" />
    <ReportError v-else-if="status === 'error' && error" :error="error" :conversion-failed="conversionFailed" @retry="refresh" />
    <div v-else-if="report" id="report-panel">
      <ReportSummary :result="report.result" />
      <CurrencyBreakdown :totals="report.totalsByCurrency" :target="report.result.currency" />
      <ExchangeRates :currencies="currencies" :target="report.result.currency" :rates="report.rates" :updated-at="report.updatedAt" />
    </div>
  </section>
</template>

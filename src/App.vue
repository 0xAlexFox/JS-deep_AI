<script setup>
import { computed, onUnmounted } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import AppHeader from './components/AppHeader.vue';
import AppFooter from './components/AppFooter.vue';
import { useRevenueReport } from './composables/useRevenueReport.js';

// Общий shell живёт дольше страниц и сохраняет активный отчёт при навигации.
const dashboard = useRevenueReport();
const { status, selectedCurrency, currencies, loading, canChangeCurrency, changeCurrency, dispose } = dashboard;
const route = useRoute();
const revenuePage = computed(() => route.name === 'revenue');
onUnmounted(dispose);
</script>

<template>
  <main class="dashboard" :data-state="revenuePage ? status : 'ready'" :aria-busy="revenuePage && loading">
    <AppHeader :show-currency="revenuePage" :currencies="currencies" :selected-currency="selectedCurrency" :loading="loading" :can-change-currency="canChangeCurrency" @change-currency="changeCurrency" />
    <RouterView v-slot="{ Component, route: currentRoute }">
      <component :is="Component" v-bind="currentRoute.name === 'revenue' ? { dashboard } : {}" />
    </RouterView>
    <AppFooter :sources-page="!revenuePage" :currency="selectedCurrency" />
  </main>
</template>

<script setup>
import { onMounted, useTemplateRef } from 'vue';
defineProps({ loading: Boolean });
const emit = defineEmits(['refresh']);
const heading = useTemplateRef('heading');
onMounted(() => heading.value?.focus({ preventScroll: true }));
</script>

<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">Обзор продаж</p>
      <h1 ref="heading" tabindex="-1">Выручка за день</h1>
      <p class="page-description">Два источника продаж. Все валюты — в одном отчёте.</p>
    </div>
    <button id="refresh-button" class="button button-primary" type="button" :disabled="loading" @click="emit('refresh')">
      <svg class="refresh-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.55-1.5L20 8M4 16l2.35 2.5A7 7 0 0 0 17.9 17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <span id="refresh-label">{{ loading ? 'Обновляем…' : 'Обновить данные' }}</span>
    </button>
  </div>
</template>

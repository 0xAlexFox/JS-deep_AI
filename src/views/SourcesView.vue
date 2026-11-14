<script setup>
import { onMounted, useTemplateRef } from 'vue';
import { RouterLink } from 'vue-router';
import DataSourceRow from '../components/DataSourceRow.vue';
import { calculationSteps, dataSources } from '../data/sources.js';

const heading = useTemplateRef('heading');
onMounted(() => heading.value?.focus({ preventScroll: true }));
</script>

<template>
  <section class="sources-page" aria-labelledby="sources-heading">
    <div class="page-heading sources-heading">
      <div>
        <h1 id="sources-heading" ref="heading" tabindex="-1">Источники данных</h1>
        <p class="page-description">Два источника продаж и курсы валют, из которых складывается отчёт.</p>
      </div>
    </div>
    <div class="sources-list">
      <DataSourceRow v-for="source in dataSources" :key="source.id" :source="source" />
    </div>
    <section class="calculation-flow" aria-labelledby="flow-heading">
      <h2 id="flow-heading">Как получается итог</h2>
      <ol class="calculation-steps">
        <li v-for="(step, index) in calculationSteps" :key="step.title">
          <div><h3>{{ step.title }}</h3><p>{{ step.description }}</p></div>
          <svg v-if="index < calculationSteps.length - 1" aria-hidden="true" viewBox="0 0 28 20" fill="none"><path d="M3 10h21m-7-7 7 7-7 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </li>
      </ol>
    </section>
    <p class="source-security"><svg aria-hidden="true" viewBox="0 0 20 22" fill="none"><rect x="3" y="9" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.7" /><path d="M6 9V6a4 4 0 0 1 8 0v3M10 13v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg><span><strong>Ключ доступа остаётся на сервере.</strong> Курсы загружаются из открытого сервиса.</span></p>
    <RouterLink class="button button-outline sources-back" to="/">Вернуться к выручке</RouterLink>
  </section>
</template>

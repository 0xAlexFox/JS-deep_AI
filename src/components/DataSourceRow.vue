<script setup>
defineProps({ source: { type: Object, required: true } });
</script>

<template>
  <article class="source-row" :aria-labelledby="`source-${source.id}`">
    <span class="source-number" aria-hidden="true">{{ source.number }}</span>
    <div class="source-description">
      <h2 :id="`source-${source.id}`">{{ source.name }}</h2>
      <code class="source-endpoint">{{ source.endpoint }}</code>
      <p>{{ source.description }}</p>
      <details class="source-example">
        <summary><svg aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>Пример формата<span class="visually-hidden">: {{ source.name }}</span></summary>
        <div class="source-example-content">
          <p>{{ source.exampleNote }}</p>
          <pre :aria-label="`Пример ответа: ${source.name}`"><code>{{ source.example }}</code></pre>
        </div>
      </details>
    </div>
    <div class="source-rule"><h3>{{ source.rule }}</h3><p>{{ source.ruleDescription }}</p></div>
  </article>
</template>

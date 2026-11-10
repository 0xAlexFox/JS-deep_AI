<script setup>
import { nextTick, ref, useTemplateRef, watch } from 'vue';
const props = defineProps({
  error: { type: Error, required: true },
  conversionFailed: Boolean,
});
const emit = defineEmits(['retry']);
const heading = useTemplateRef('heading');
const expanded = ref(false);
watch(() => props.error, async () => {
  expanded.value = false;
  await nextTick();
  heading.value?.focus(); // Ошибка заметна и при управлении с клавиатуры.
}, { immediate: true });
</script>

<template>
  <section id="error-panel" class="error-panel" role="alert">
    <span class="error-icon" aria-hidden="true">!</span>
    <h2 id="error-heading" ref="heading" tabindex="-1">{{ conversionFailed ? 'Не удалось пересчитать выручку' : 'Не удалось загрузить отчёт' }}</h2>
    <p id="error-message">{{ conversionFailed
      ? 'Выберите другую целевую валюту вверху страницы или обновите данные. Причина указана в подробностях ниже.'
      : 'Не удалось получить или обработать все данные. Повторите попытку. Если ошибка повторится, откройте подробности ниже.' }}</p>
    <button id="retry-button" class="button button-primary" type="button" @click="emit('retry')">Попробовать ещё раз</button>
    <!-- Интерполяция Vue экранирует данные: HTML из API не станет разметкой. -->
    <details :open="expanded" @toggle="expanded = $event.target.open"><summary>Подробности ошибки</summary><p id="error-details">{{ error.message || 'Неизвестная ошибка.' }}</p></details>
  </section>
</template>

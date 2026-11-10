<script setup>
import { formatMoney } from '../utils/format.js';
defineProps({ result: { type: Object, required: true } });
</script>

<template>
  <section class="total-card" aria-labelledby="total-heading">
    <div class="total-main">
      <p id="total-heading" class="total-label">Общая выручка</p>
      <p class="total-amount"><output id="total-value" aria-live="polite">{{ formatMoney(result.total) }}</output><span id="total-currency" class="total-currency">{{ result.currency }}</span></p>
      <p class="total-caption"><span class="caption-icon" aria-hidden="true">↗</span> <span>Все учтённые валюты пересчитаны в {{ result.currency }}</span></p>
    </div>
    <div class="total-explanation">
      <span class="total-badge">Единый итог</span>
      <p>Только оплаченные продажи</p>
      <span>Ожидающие и отклонённые платежи первого источника не учитываются.</span>
    </div>
  </section>
</template>

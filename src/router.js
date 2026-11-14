import { createRouter, createWebHistory } from 'vue-router';
import RevenueView from './views/RevenueView.vue';

// Отдельный экземпляр истории в тестах не меняет адрес настоящего браузера.
export function createAppRouter({ history = createWebHistory(), scroll = true } = {}) {
  const router = createRouter({
    history,
    routes: [
      { path: '/', name: 'revenue', component: RevenueView, meta: { title: 'Сводка — выручка за день' } },
      { path: '/sources', name: 'sources', component: () => import('./views/SourcesView.vue'), meta: { title: 'Сводка — источники данных' } },
      { path: '/:pathMatch(.*)*', redirect: { name: 'revenue' } },
    ],
    scrollBehavior: scroll ? (to, from, savedPosition) => savedPosition ?? { top: 0 } : undefined,
  });
  router.afterEach((to) => {
    if (typeof document !== 'undefined') document.title = to.meta.title;
  });
  return router;
}

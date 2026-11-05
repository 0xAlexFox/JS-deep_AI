import './style.css';
import { createDashboardController } from './dashboard.js';
import { createDashboardView } from './view.js';

// Точка входа соединяет модули: view обновляет DOM, controller управляет
// загрузкой и состояниями, а расчёты по-прежнему выполняются в revenue.js.
const view = createDashboardView(document.querySelector('#app'));
const controller = createDashboardController({ view });
view.onRefresh(controller.refresh);
view.onCurrencyChange(controller.changeCurrency);
controller.refresh();

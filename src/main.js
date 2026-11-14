// Точка входа: Vue управляет всем содержимым #app.
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { createAppRouter } from './router.js'

const router = createAppRouter()
const app = createApp(App).use(router)
router.isReady().then(() => app.mount('#app'))

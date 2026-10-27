import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import router from '@/router/index'
import i18n from './i18n'
import { useAuthStore } from '@/stores/auth.store'
import { initAccentColor } from '@/composables/useAccentColor'

import '@/style.css'

// Before mount, so the first paint already uses the configured accent.
initAccentColor()

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)
app.mount('#app')

// Initialize auth store (loads user from localStorage if token exists)
const auth = useAuthStore()
auth.initialize()

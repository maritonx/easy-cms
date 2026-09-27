import '@fontsource-variable/anuphan'
import { createApp } from 'vue'
import App from './App.vue'
import { applyBrand, applyTheme } from './lib/theme'
import { router } from './router'
import './styles.css'

// Before mounting, so the first paint already has the right colors.
applyTheme()
applyBrand()

createApp(App).use(router).mount('#app')

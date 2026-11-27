import '@fontsource-variable/anuphan'
import { createApp } from 'vue'
import App from './App.vue'
import { refreshCounts } from './lib/counts'
import { loadSession } from './lib/session'
import { installStudio } from './lib/studio'
import { applyBrand, applyTheme } from './lib/theme'
import { router } from './router'
import './styles.css'

// Before mounting, so the first paint already has the right colors.
applyTheme()
applyBrand()

createApp(App).use(router).mount('#app')

installStudio(async () => {
  await loadSession()
  void refreshCounts({ fresh: true })
})

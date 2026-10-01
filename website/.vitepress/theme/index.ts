import { type Theme, useRoute } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { nextTick, onMounted, watch } from 'vue'
import HomePage from './components/HomePage.vue'
import Screenshot from './components/Screenshot.vue'
import { restorePackageManager, setupPackageManagerTabs } from './package-manager'
import './style.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('HomePage', HomePage)
    app.component('Screenshot', Screenshot)
  },
  setup() {
    // After hydration, which would undo a tab chosen earlier, and after each page change.
    const route = useRoute()
    onMounted(setupPackageManagerTabs)
    watch(
      () => route.path,
      () => nextTick(restorePackageManager),
    )
  },
} satisfies Theme

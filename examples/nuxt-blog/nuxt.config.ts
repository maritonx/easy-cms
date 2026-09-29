export default defineNuxtConfig({
  modules: ['@easy-cms/nuxt'],
  compatibilityDate: '2026-09-01',
  devtools: { enabled: false },
  // <easy-form> is a Web Component, not a Vue component.
  vue: { compilerOptions: { isCustomElement: (tag) => tag === 'easy-form' } },
})

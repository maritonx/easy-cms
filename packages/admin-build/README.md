# @easy-cms/admin-build

Builds [Easy CMS](https://easycms.dev) admin components written in **Vue**, **React** or **Svelte**
into the module the admin loads: one ES module, without imports, that defines a custom element per
component. It is what `npx easy-cms build:admin` runs.

```bash
npm install -D @easy-cms/admin-build @vitejs/plugin-vue   # or @vitejs/plugin-react, or @sveltejs/vite-plugin-svelte svelte
npx easy-cms build:admin                                   # admin/components/* → admin/dist/components.js
```

```ts
// easy-cms.config.ts
admin: { modules: ['./admin/dist/components.js'] }
```

Each component is named after its file (`acme-word-count.vue` → `<acme-word-count>`) and gets the
admin's properties as props, with `change`, `setField` and `navigate` (`AdminComponentProps` from
`@easy-cms/core`). See [Vue, React or Svelte](https://easycms.dev/guide/plugins#frameworks).

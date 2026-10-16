---
"@easy-cms/plugin-form-builder": patch
---

`import '@easy-cms/plugin-form-builder/element'` (and `element.css`) now survive production builds: the package declared no side effects, so Vite and other bundlers dropped the import and `<easy-form>` stayed empty on the site. Development servers don't tree-shake, which hid it.

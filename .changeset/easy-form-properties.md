---
"@easy-cms/plugin-form-builder": patch
---

`<easy-form>` takes `form`, `api` and `locale` as properties as well as attributes. Vue and React set properties on custom elements that have them, so `<easy-form :locale="locale">` in Vue (and `locale={locale}` in React) was ignored before.

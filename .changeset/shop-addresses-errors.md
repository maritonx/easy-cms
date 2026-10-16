---
"@easy-cms/plugin-ecommerce": patch
---

`useAddresses()` (React and Vue) no longer leaves an unhandled promise rejection when the addresses can't load as the customer signs in or out, e.g. with an expired session: the list stays empty. Calling `reload()` still throws. The React hooks and Vue composables now have tests.

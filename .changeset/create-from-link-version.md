---
'create-easy-cms': patch
---

`create-easy-cms --from <link>` installs at least the Easy CMS version the Studio link was made with (`^1.58.0` for a `v=1.58.0` link) when it is newer than create-easy-cms in the same major, so a config using something new gets it. An older link of the same major installs create-easy-cms's own version, which runs it; another major, its own version and a note, as before.

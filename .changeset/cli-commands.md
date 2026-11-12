---
"easy-cms": patch
---

`easy-cms secrets:rotate` and `easy-cms audit:resign` run: they answered "Unknown command", so a rotated secret's connections and audit log couldn't be moved to the new one from the CLI. Every command the help lists is now checked to run.

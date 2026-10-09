---
'@easy-cms/core': patch
---

Packing a package with npm or Yarn 1 now stops with a message when its `package.json` still has `workspace:` ranges, which those tools would publish as they are; pnpm, Yarn 2+ and Bun rewrite them and pass.

# @easy-cms/fields

## 0.37.2

### Patch Changes

- Updated dependencies [63f0116]
  - @easy-cms/core@0.37.2

## 0.37.1

### Patch Changes

- @easy-cms/core@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies [cbf800c]
  - @easy-cms/core@0.37.0

## 0.36.1

### Patch Changes

- @easy-cms/core@0.36.1

## 0.36.0

### Patch Changes

- Updated dependencies [7fbd37e]
  - @easy-cms/core@0.36.0

## 0.35.0

### Patch Changes

- Updated dependencies [892f6cf]
  - @easy-cms/core@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [f3c65cd]
- Updated dependencies [3e33a26]
  - @easy-cms/core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies [a26533e]
  - @easy-cms/core@0.33.0

## 0.32.0

### Patch Changes

- Updated dependencies [281435f]
  - @easy-cms/core@0.32.0

## 0.31.0

### Patch Changes

- Updated dependencies [36fc19b]
  - @easy-cms/core@0.31.0

## 0.30.0

### Patch Changes

- Updated dependencies [f9d5512]
  - @easy-cms/core@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies [5e92063]
  - @easy-cms/core@0.29.0

## 0.28.0

### Patch Changes

- Updated dependencies [479e17a]
  - @easy-cms/core@0.28.0

## 0.27.0

### Patch Changes

- Updated dependencies [ffa2f84]
  - @easy-cms/core@0.27.0

## 0.26.0

### Minor Changes

- bcf3c0c: Custom field types.
  
  - **`fieldTypes` and `defineFieldType()`** let packages add a field `type`: stored, queried and translated like a built-in base type (`text`, `number`, `json`…), with its own `validate`, `checkOptions`, input and list cell. Names that clash with built-in types or each other are config errors.
  - **Types:** packages extend `interface CustomFieldTypes` (module augmentation), so `type: 'color'` is accepted with its options and documents get the right value type. `generate:types` uses the type's `typescript`.
  - **`admin.cell`** on any field shows its value in the list's column with a Web Component; columns with a cell are shown by default.
  - **New package `@easy-cms/fields`** with `color`: `#rrggbb` (or `#rrggbbaa` with `alpha: true`), a picker with `presets`, and swatches in lists.

### Patch Changes

- Updated dependencies [bcf3c0c]
  - @easy-cms/core@0.26.0

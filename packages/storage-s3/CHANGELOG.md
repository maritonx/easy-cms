# @easy-cms/storage-s3

## 0.47.0

### Patch Changes

- Updated dependencies [203e359]
  - @easy-cms/core@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [6938928]
  - @easy-cms/core@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [56a926b]
  - @easy-cms/core@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [40bd4bc]
  - @easy-cms/core@0.44.0

## 0.43.0

### Patch Changes

- @easy-cms/core@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [4afac22]
  - @easy-cms/core@0.42.0

## 0.41.0

### Minor Changes

- 7a43c55: Large files straight to the storage: with S3 (R2, MinIO) or Vercel Blob, the admin sends files over 4 MB from the browser to the storage (`POST <api>/media/uploads` for a signed ticket and a presigned URL or client token, then `/media/uploads/complete`), past hosts' request limits (about 4.5 MB on Vercel); the server still checks each file's size and type from its contents, and deletes what fails. Storage adapters can add `uploadURL()` and `getStart()`. `cms.createUpload()` and `cms.completeUpload()` do the same from code. Making a media folder private or public (moving or deleting it) now refuses to move more than 200 files at once.

### Patch Changes

- Updated dependencies [7a43c55]
  - @easy-cms/core@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [e24dbd1]
  - @easy-cms/core@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [72758f0]
  - @easy-cms/core@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [5a71c12]
  - @easy-cms/core@0.38.0

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

### Patch Changes

- Updated dependencies [bcf3c0c]
  - @easy-cms/core@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [434599a]
  - @easy-cms/core@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies [230a347]
  - @easy-cms/core@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [0107902]
  - @easy-cms/core@0.23.0

## 0.22.2

### Patch Changes

- @easy-cms/core@0.22.2

## 0.22.1

### Patch Changes

- d742afc: Package READMEs: what each package does, how to install it with npm, pnpm, Yarn or Bun, a short example and links to its guide.
- Updated dependencies [d742afc]
  - @easy-cms/core@0.22.1

## 0.22.0

### Patch Changes

- Updated dependencies [63995c6]
  - @easy-cms/core@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [0e69436]
  - @easy-cms/core@0.21.0

## 0.20.1

### Patch Changes

- @easy-cms/core@0.20.1

## 0.20.0

### Patch Changes

- Updated dependencies [b7564cb]
  - @easy-cms/core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [34d5e66]
  - @easy-cms/core@0.19.0

## 0.18.0

### Patch Changes

- @easy-cms/core@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [0507a14]
  - @easy-cms/core@0.17.0

## 0.16.1

### Patch Changes

- Updated dependencies [8b14b83]
  - @easy-cms/core@0.16.1

## 0.16.0

### Patch Changes

- @easy-cms/core@0.16.0

## 0.15.0

### Patch Changes

- Updated dependencies [fdb3985]
  - @easy-cms/core@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [6c7eb74]
  - @easy-cms/core@0.14.0

## 0.13.1

### Patch Changes

- @easy-cms/core@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [bf9fa90]
  - @easy-cms/core@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [070d710]
- Updated dependencies [070d710]
  - @easy-cms/core@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [a035bce]
- Updated dependencies [2a5a18d]
  - @easy-cms/core@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [cab02f9]
  - @easy-cms/core@0.10.0

## 0.9.1

### Patch Changes

- @easy-cms/core@0.9.1

## 0.9.0

### Patch Changes

- @easy-cms/core@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [e032e1c]
  - @easy-cms/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [da85424]
- Updated dependencies [da85424]
  - @easy-cms/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [a76cf49]
- Updated dependencies [a76cf49]
- Updated dependencies [a76cf49]
- Updated dependencies [a76cf49]
  - @easy-cms/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [df8b783]
- Updated dependencies [df8b783]
  - @easy-cms/core@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [b6f8aa3]
  - @easy-cms/core@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [8dd12a8]
  - @easy-cms/core@0.3.0

## 0.2.0

### Minor Changes

- 5d35bd1: New package `@easy-cms/storage-s3`: upload storage on AWS S3, Cloudflare R2, MinIO and other S3-compatible services, for hosts without a persistent disk. Files are served through the API from a private bucket by default, or from `publicUrl` (a CDN or public bucket).

### Patch Changes

- Updated dependencies [d626995]
  - @easy-cms/core@0.2.0

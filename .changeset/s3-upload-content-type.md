---
"@easy-cms/storage-s3": patch
---

Security: S3 upload links now fix the file's type. The link for a large upload from the browser did not include the Content-Type in its signature, so someone allowed to upload media could ask for a link, send any file with any type (for example `text/html`) and never finish the upload; the file was only checked when the upload was finished. On a public bucket it was then served with the type they chose. Now the bucket refuses a file sent with any type other than the one the server expects from its name. Nothing to change in your config or bucket: the admin already sends that type, and the bucket's CORS already allows the header. Vercel Blob links already fixed the type, and Netlify Blobs takes uploads through the server.

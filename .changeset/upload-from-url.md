---
"@easy-cms/core": minor
"@easy-cms/admin": minor
---

Uploads from links.

- **`upload.fromURL: { allowedHosts, allowPrivate? }`** lets users upload a file by its link: the server downloads it, then checks it like any upload (type from the contents, `maxFileSize`, the right to create media). Off by default.
- **`cms.uploadFromURL(url, fields?, options?)`** in code, and `POST <api>/media` with JSON `{ url, ...fields }` over REST.
- **Admin:** a "From a link" field in the media library, the media picker and galleries. Links (or files) can also be pasted into the upload area, and images dragged from other pages dropped on it.
- **Safe by default:** only `http(s)`; hosts must be in `allowedHosts` (also after redirects, three at most); private network addresses (`localhost`, `10.x`, `192.168.x`, `169.254.x`, IPv6 ones too) are refused after DNS resolution, unless `allowPrivate: true`; 15 seconds and `maxFileSize` at most.
- **Fix:** a media document's page cut off large images; the whole image now shows, as big as fits (up to 70% of the screen's height), and a click opens the original.
- **Dashboard, regrouped:** number tiles show content only, in menu order, each opening its list with a + to create; drafts to review come first, then recent edits; plugin panels (`width: 'half'`) sit in the side column beside them, `full` ones below.

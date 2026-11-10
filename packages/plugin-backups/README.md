# @easy-cms/plugin-backups

Backup destinations for [Easy CMS](https://easycms.dev): **Google Drive** and **S3-compatible
storage** (Cloudflare R2, Backblaze B2, AWS S3, Wasabi), connected in Settings → Integrations and
chosen in Settings → Backups.

```ts
import { backupsPlugin } from '@easy-cms/plugin-backups'

export default defineConfig({
  backups: { encryptionKey: process.env.EASY_CMS_BACKUP_KEY },
  plugins: [backupsPlugin()],
})
```

See the [backups guide](https://easycms.dev/docs/backups#destinations).

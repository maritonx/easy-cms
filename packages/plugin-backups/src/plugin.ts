import { type Config, definePlugin, type IntegrationConfig } from '@easy-cms/core'
import { googleDrive } from './google-drive.js'
import { INFO } from './info.js'
import { s3Compatible } from './s3.js'

export interface BackupsPluginOptions {
  /** The destinations offered in Integrations → Backups. Default: Google Drive and S3-compatible. */
  readonly destinations?: readonly IntegrationConfig[]
}

/**
 * Places backups can go (#395): connected in Integrations, chosen in Settings → Backups with how
 * many to keep at each.
 */
export function backupsPlugin(options: BackupsPluginOptions = {}) {
  const destinations = options.destinations ?? [googleDrive, s3Compatible()]
  for (const destination of destinations)
    if (typeof destination.backups !== 'function')
      throw new Error(`backupsPlugin: "${destination.id}" has no backups() destination`)
  return definePlugin(
    (config: Config): Config => ({
      ...config,
      integrations: [...(config.integrations ?? []), ...destinations],
    }),
    INFO,
  )
}

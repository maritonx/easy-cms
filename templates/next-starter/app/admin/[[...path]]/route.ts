import { createAdminRouteHandlers } from '@easy-cms/next'
import config from '@/easy-cms.config'

// The Easy CMS admin at /admin.
export const { GET, HEAD } = createAdminRouteHandlers(config)

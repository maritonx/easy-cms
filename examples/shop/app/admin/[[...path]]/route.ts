import { createAdminRouteHandlers } from '@easy-cms/next'
import config from '@/easy-cms.config'

// The Easy CMS admin UI at /admin: products, orders and the shop's dashboard.
export const { GET, HEAD } = createAdminRouteHandlers(config)

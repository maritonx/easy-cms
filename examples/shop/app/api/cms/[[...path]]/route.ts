import { createRouteHandlers } from '@easy-cms/next'
import config from '@/easy-cms.config'

// The Easy CMS REST API at /api/cms: the shop's cart, checkout and accounts too.
export const { GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS } = createRouteHandlers(config)

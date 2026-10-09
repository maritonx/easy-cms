/**
 * `@easy-cms/core/plugin`: what plugins and field types are written with, in server and browser
 * code alike. Nothing here needs Node.js.
 */
export type {
  AuthUser,
  CollectionAccess,
  FieldAccess,
  ID,
  RequestContext,
  Where,
} from './access.js'
export {
  ADMIN_API_VERSION,
  type AdminElementProps,
  type AdminPageRoute,
  type SetFieldDetail,
} from './admin-elements.js'
export type {
  CliCommand,
  CollectionConfig,
  DashboardWidget,
  Endpoint,
  EndpointRequest,
  GlobalConfig,
  JobConfig,
  NavGroup,
  OnRequest,
  OnRequestArgs,
  Plugin,
  PluginInfo,
  PluginTypes,
  TypedPlugin,
} from './config.js'
export {
  ADMIN_ICONS,
  type AdminIcon,
  type Config,
  definePlugin,
  PLUGIN_API_VERSION,
} from './config.js'
export {
  ConfigError,
  EasyCMSError,
  type ErrorCode,
  type FieldError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  QueryError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from './errors.js'
export {
  defineFieldType,
  type FieldTypeBase,
  type FieldTypeDefinition,
  type FieldTypeValidateContext,
} from './field-types.js'
export type { AdminComponent, Field, Label } from './fields.js'

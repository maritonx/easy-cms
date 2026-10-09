import {
  checkFormToken,
  formToken as coreFormToken,
  rateKeys as coreRateKeys,
} from '@easy-cms/core/internal'

// The form builder's own names in tokens and keys: tokens of pages loaded before an upgrade
// stay valid.

/** A token that proves the form was loaded at `now`: `<time>.<signature>`. */
export const formToken = (secret: string, slug: string, now = Date.now()): string =>
  coreFormToken(secret, `easy-form:${slug}`, now)

/** See `checkFormToken` in the core. */
export const checkToken = (
  secret: string,
  slug: string,
  token: unknown,
  minTime: number,
  now = Date.now(),
) => checkFormToken(secret, `easy-form:${slug}`, token, minTime, now)

/** The rate-limit keys for an IP address and form in the current and previous window. */
export const rateKeys = (
  secret: string,
  ip: string,
  form: unknown,
  window: number,
  now = Date.now(),
) => coreRateKeys(secret, `easy-form-rate:${ip}:${String(form)}`, window, now)

export { honeypotName, verifyTurnstile } from '@easy-cms/core/internal'

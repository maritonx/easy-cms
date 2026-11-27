/**
 * `../node/remote-file.ts` for the browser build (ADR-0074): downloading a file from a link
 * checks DNS answers for private addresses, which a browser can't do, so it is refused.
 */

/** Why a link could not be downloaded; the message is safe to show to the user. */
export class RemoteFileError extends Error {
  /** `413` when the file is too large, otherwise `400`. */
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'RemoteFileError'
    this.status = status
  }
}

export interface RemoteFileOptions {
  readonly allowedHosts?: readonly string[] | undefined
  readonly allowPrivate?: boolean | undefined
  readonly maxBytes: number
  readonly timeout?: number
  readonly maxRedirects?: number
  readonly userAgent?: string
}

export function fetchRemoteFile(
  _link: string,
  _options: RemoteFileOptions,
): Promise<{ data: Uint8Array; name: string; contentType?: string }> {
  return Promise.reject(new RemoteFileError('uploading from a link is not available here'))
}

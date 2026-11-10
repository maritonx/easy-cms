/** A failure; `permanent` when trying again won't help (access taken back, a full drive). */
export class DestinationError extends Error {
  readonly permanent: boolean
  constructor(message: string, permanent = false) {
    super(message)
    this.name = 'DestinationError'
    this.permanent = permanent
  }
}

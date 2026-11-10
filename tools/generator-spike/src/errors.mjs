/** Exit codes used by the CLI. Each identifies the stage that stopped the run. */
export const EXIT = Object.freeze({ OK: 0, REFUSED: 2, GEOMETRY: 3, VERIFICATION: 4, INTERNAL: 5 })

/**
 * Every failure the generator reports. `issues` carries one `{ code, path, message }`
 * per problem so a caller sees all of them in one pass, not just the first.
 */
export class GeneratorError extends Error {
  constructor(code, message, { stage = 'request', issues = [], exitCode = EXIT.REFUSED, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'GeneratorError'
    this.code = code
    this.stage = stage
    this.issues = issues
    this.exitCode = exitCode
  }

  toDiagnostic() {
    return {
      status: 'refused-or-failed',
      code: this.code,
      stage: this.stage,
      message: this.message,
      issues: this.issues,
      ...(this.cause === undefined ? {} : { cause: String(this.cause?.message ?? this.cause) }),
      artifactsWritten: false,
    }
  }
}

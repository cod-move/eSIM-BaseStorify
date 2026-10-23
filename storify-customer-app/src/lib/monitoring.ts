/**
 * The one place an unexpected error is reported.
 *
 * It writes to the console. To send errors to a service (Sentry, for example),
 * install its SDK and call it here: every part of the app that catches an error
 * it did not expect already calls this function.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (context) {
    console.error(error, context);
  } else {
    console.error(error);
  }
}

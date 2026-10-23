/**
 * The one place an unexpected error is reported: a screen that crashed while
 * drawing, caught by the root layout's error boundary (`features/shell/crash-screen`).
 *
 * It writes to the console. To send errors to a service (Sentry, for example),
 * install its SDK and call it here.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (context) {
    console.error(error, context);
  } else {
    console.error(error);
  }
}

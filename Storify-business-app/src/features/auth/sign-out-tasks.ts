/**
 * Work that has to be done while the operator is still signed in, just before
 * the app signs them out: removing this phone's push token from their account,
 * for one. Without it, the store would keep sending one operator's notifications
 * to a phone somebody else may now use.
 *
 * A feature adds its task once and keeps the function that takes it back.
 * Signing out runs every task first, and then signs out whatever they answer: a
 * task that fails, or takes too long, must never keep an operator signed in.
 */
export type SignOutTask = () => Promise<unknown>;

const tasks = new Set<SignOutTask>();

const TASK_TIMEOUT_MS = 5_000;

/** Adds a task to run before every sign-out. Returns the function that removes it. */
export function addSignOutTask(task: SignOutTask): () => void {
  tasks.add(task);
  return () => {
    tasks.delete(task);
  };
}

/** Runs every task at once. Resolves when each has finished, failed or run out of time. */
export async function runSignOutTasks(timeoutMs = TASK_TIMEOUT_MS): Promise<void> {
  await Promise.allSettled([...tasks].map((task) => withTimeout(task, timeoutMs)));
}

function withTimeout(task: SignOutTask, timeoutMs: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  return Promise.race([Promise.resolve().then(task), timeout]).finally(() => clearTimeout(timer));
}

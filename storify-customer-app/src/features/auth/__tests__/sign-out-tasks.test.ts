import { addSignOutTask, runSignOutTasks } from '../sign-out-tasks';

describe('sign-out tasks', () => {
  it('runs every task that was added, and none that was taken back', async () => {
    const kept = jest.fn().mockResolvedValue(undefined);
    const removed = jest.fn().mockResolvedValue(undefined);
    const removeKept = addSignOutTask(kept);
    addSignOutTask(removed)();

    await runSignOutTasks();

    expect(kept).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
    removeKept();
  });

  it('finishes when a task fails or never answers', async () => {
    const removeFailing = addSignOutTask(() => Promise.reject(new Error('offline')));
    const removeHanging = addSignOutTask(() => new Promise(() => {}));
    const removeThrowing = addSignOutTask(() => {
      throw new Error('not even a promise');
    });

    await expect(runSignOutTasks(20)).resolves.toBeUndefined();

    removeFailing();
    removeHanging();
    removeThrowing();
  });
});

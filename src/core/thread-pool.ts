import { PromiseChain, Deferred } from '../shared';

/**
 * Thread pool task information
 */
interface ThreadTask {
  promise: Promise<any>;
  isCompleted: boolean;
}

/**
 * Thread information
 */
interface Thread {
  chain: ReturnType<typeof PromiseChain>;
  tasks: ThreadTask[];
}

/**
 * Creates a thread pool for managing concurrent execution of tasks
 */
export const createThreadPool = () => {
  // Map of thread ID to thread information
  const threads = new Map<string, Thread>();

  // Overall status of the thread pool
  const status = {
    error: undefined as Error | undefined,
    ...Deferred(),
  };

  /**
   * Checks if all tasks in all threads are completed
   */
  const areAllTasksCompleted = (): boolean => {
    for (const thread of threads.values()) {
      // If any thread has incomplete tasks, return false
      if (thread.tasks.some((task) => !task.isCompleted)) {
        return false;
      }
    }
    return true;
  };

  /**
   * Removes a completed task from a thread
   */
  const removeTask = (threadId: string, taskPromise: Promise<any>): void => {
    const thread = threads.get(threadId);
    if (!thread) return;

    const taskIndex = thread.tasks.findIndex((task) => task.promise === taskPromise);
    if (taskIndex !== -1) {
      // Mark task as completed instead of removing
      thread.tasks[taskIndex].isCompleted = true;
    }
  };

  /**
   * Resolves or rejects the overall promise when all tasks are done
   */
  const finalizeIfDone = (result?: any): void => {
    if (areAllTasksCompleted()) {
      if (status.error) {
        status.reject(status.error);
      } else {
        status.resolve(result);
      }
    }
  };

  return {
    /**
     * Wait for all tasks in the thread pool to complete
     */
    waitForCompletion() {
      return status.promise;
    },

    /**
     * Schedule a task for execution in a specific thread
     */
    scheduleTask(threadId: string, executeTask: Function): void {
      // If there's already an error, don't schedule more tasks
      if (status.error) return;

      // Create thread if it doesn't exist
      if (!threads.has(threadId)) {
        threads.set(threadId, {
          chain: PromiseChain(),
          tasks: [],
        });
      }

      const thread = threads.get(threadId)!;

      // Create and execute the task
      const taskPromise = thread.chain(async () => {
        try {
          // Execute the task
          const result = await Promise.resolve().then(() => executeTask());

          // Handle completion
          removeTask(threadId, taskPromise);
          finalizeIfDone(result);

          return result;
        } catch (error) {
          // Handle error
          removeTask(threadId, taskPromise);

          // Only set the first error
          if (!status.error) {
            status.error = error as Error;
          }

          finalizeIfDone();
          throw status.error;
        }
      });

      // Add task to the thread
      thread.tasks.push({
        promise: taskPromise,
        isCompleted: false,
      });
    },

    /**
     * Abort all pending tasks in the thread pool
     */
    abort(reason: string = 'Thread pool execution aborted'): void {
      status.error = new Error(reason);
      status.reject(status.error);
    },
  };
};

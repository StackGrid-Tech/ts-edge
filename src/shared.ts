export const isNull = (v: unknown): v is undefined | null => {
  return v == undefined;
};

export const randomId = () => {
  return 'ts-edge-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const withTimeout = <T>(promise: PromiseLike<T>, ms: number, error?: Error): Promise<T> => {
  let key;
  return new Promise<T>((ok, timeout) => {
    key = setTimeout(() => {
      timeout(error ?? new Error(`Execution aborted: Timeout of ${ms}ms exceeded`));
    }, ms);
    promise.then(
      (res) => ok(res),
      (err) => timeout(err)
    );
  }).finally(() => {
    clearTimeout(key);
  });
};

export const createPubSub = () => {
  const eventHandlers: Array<(event: any) => any> = [];
  return {
    publish(e) {
      eventHandlers.forEach(async (h) => h(e));
    },
    subscribe(handler) {
      eventHandlers.push(handler);
    },
    unsubscribe(handler) {
      const index = eventHandlers.findIndex((v) => v === handler);
      if (index !== -1) eventHandlers.splice(index, 1);
    },
  };
};

export const Deferred = () => {
  let resolve!: Function;
  let reject!: Function;
  const promise = new Promise((rs, rj) => {
    resolve = rs;
    reject = rj;
  });

  return {
    promise,
    reject,
    resolve,
  };
};

export class Locker {
  private context = Deferred();
  constructor() {
    this.unlock();
  }
  async wait() {
    await this.context.promise;
  }
  unlock() {
    this.context.resolve();
  }
  lock() {
    this.context = Deferred();
  }
}

export const PromiseChain = () => {
  let lastPromise: Promise<any> = Promise.resolve();
  return <T>(asyncFunction: () => Promise<T>): Promise<T> => {
    lastPromise = lastPromise.then(() => asyncFunction());
    return lastPromise as Promise<T>;
  };
};

export const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

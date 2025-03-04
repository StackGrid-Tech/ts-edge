export const randomId = () => {
  return 'ts-edge-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const withTimeout = <T>(promise: PromiseLike<T>, ms: number, errorMessage?: string): Promise<T> => {
  let key;
  return new Promise<T>((ok, timeout) => {
    key = setTimeout(() => {
      timeout(new Error(errorMessage ?? `Execution aborted: Timeout of ${ms}ms exceeded`));
    }, ms);
    promise.then(
      (res) => ok(res),
      (err) => timeout(err)
    );
  }).finally(() => {
    clearTimeout(key);
  });
};

export type GraphStoreState = Record<string, any>;
export type StateSetter<T> = Partial<T> | ((prev: T) => Partial<T>);

export const updateState = <T>(current: T, update: StateSetter<T>): T => {
  const partial = typeof update !== 'function' ? update : (update as (current: T) => Partial<T>)(current);
  return Object.assign(current ?? {}, partial) as T;
};

export type GraphStoreInitializer<T extends GraphStoreState> = {
  (set: (update: StateSetter<T>) => void, get: () => T): T;
};

export type GraphStore<T extends GraphStoreState> = {
  (): T;
  get(): T;
  set(update: StateSetter<T>): void;
  reset(): void;
};

export const graphStore = <T extends GraphStoreState = GraphStoreState>(
  initializer: GraphStoreInitializer<T>
): GraphStore<T> => {
  let state: T;

  const getState = () => state;

  const setState = (update: StateSetter<T>) => {
    state = updateState(state, update);
  };

  state = initializer(setState, getState);
  const initialState = { ...state } as T;

  getState.get = getState;
  getState.set = setState;
  getState.reset = () => setState({ ...initialState });

  return getState;
};

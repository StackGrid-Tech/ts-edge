import { describe, it, expect } from 'vitest';
import { graphStore } from '../src/core/create-state';

describe('graphStore', () => {
  it('should create a store with initial state', () => {
    const store = graphStore(() => ({
      count: 0,
      name: 'test',
    }));

    expect(store().count).toBe(0);
    expect(store().name).toBe('test');
  });

  it('should update state with direct values', () => {
    const store = graphStore<{ count: number }>(() => ({
      count: 0,
    }));

    store.set({ count: 5 });
    expect(store().count).toBe(5);
  });

  it('should update state using a function', () => {
    const store = graphStore<{ count: number }>(() => ({
      count: 10,
    }));

    store.set((state) => ({ count: state.count + 5 }));
    expect(store().count).toBe(15);
  });

  it('should support actions that update state', () => {
    type CounterStore = {
      count: number;
      increment: () => void;
      decrement: () => void;
      addAmount: (amount: number) => void;
      isZero: () => boolean;
    };

    const counter = graphStore<CounterStore>((set, get) => ({
      count: 0,
      increment: () => set({ count: get().count + 1 }),
      decrement: () => set((state) => ({ count: state.count - 1 })),
      addAmount: (amount) => set({ count: get().count + amount }),
      isZero: () => get().count === 0,
    }));

    expect(counter().count).toBe(0);

    counter().increment();
    expect(counter().count).toBe(1);

    counter().decrement();
    expect(counter().count).toBe(0);

    counter().addAmount(5);
    expect(counter().count).toBe(5);
    expect(counter().isZero()).toBe(false);
  });

  it('should handle complex nested state', () => {
    type NestedStore = {
      user: {
        name: string;
        settings: {
          theme: string;
          notifications: boolean;
        };
      };
      updateTheme: (theme: string) => void;
      toggleNotifications: () => void;
    };

    const store = graphStore<NestedStore>((set, get) => ({
      user: {
        name: 'John',
        settings: {
          theme: 'light',
          notifications: true,
        },
      },
      updateTheme: (theme) =>
        set({
          user: {
            ...get().user,
            settings: {
              ...get().user.settings,
              theme,
            },
          },
        }),
      toggleNotifications: () =>
        set((state) => ({
          user: {
            ...state.user,
            settings: {
              ...state.user.settings,
              notifications: !state.user.settings.notifications,
            },
          },
        })),
    }));

    expect(store().user.name).toBe('John');
    expect(store().user.settings.theme).toBe('light');
    expect(store().user.settings.notifications).toBe(true);

    store().updateTheme('dark');
    expect(store().user.settings.theme).toBe('dark');
    expect(store().user.name).toBe('John');

    store().toggleNotifications();
    expect(store().user.settings.notifications).toBe(false);
    expect(store().user.settings.theme).toBe('dark');
  });

  it('should maintain immutability', () => {
    type TodoStore = {
      todos: string[];
      addTodo: (todo: string) => void;
    };

    const store = graphStore<TodoStore>((set, get) => ({
      todos: [],
      addTodo: (todo) =>
        set({
          todos: [...get().todos, todo],
        }),
    }));

    const initialTodos = store().todos;
    store().addTodo('Learn TypeScript');

    expect(initialTodos).not.toBe(store().todos);
    expect(initialTodos.length).toBe(0);
    expect(store().todos.length).toBe(1);
  });

  it('should handle many updates efficiently', () => {
    const store = graphStore<{ count: number }>(() => ({
      count: 0,
    }));

    for (let i = 0; i < 1000; i++) {
      store.set((state) => ({ count: state.count + 1 }));
    }

    expect(store().count).toBe(1000);
  });

  it('should reset state', () => {
    const store = graphStore<{ count: number }>(() => ({
      count: 0,
    }));

    store.set({ count: 10 });
    expect(store().count).toBe(10);

    store.reset();
    expect(store().count).toBe(0);
  });
});

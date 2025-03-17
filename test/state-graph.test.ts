import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStateGraph } from '../src/core/registry';
import { graphStore } from '../src/core/create-state';
import { graphStateNode } from '../src';

describe('StateGraph Module', () => {
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

  beforeEach(() => {
    counter.reset();
  });

  it('should create a state graph and execute a simple node', async () => {
    const workflow = createStateGraph(counter).addNode({
      name: 'incrementNode',
      execute: (state) => {
        state.increment();
        return 'ignore';
      },
    });

    const app = workflow.compile('incrementNode');
    const result = await app.run({ count: 5 });

    expect(result.isOk).toBe(true);
    expect(counter().count).toBe(6);
    expect(result.output).toBe(counter());
    expect(result.output?.count).toBe(6);
  });

  it('should execute multiple nodes in sequence', async () => {
    const executionOrder = vi.fn();

    const workflow = createStateGraph(counter)
      .addNode({
        name: 'firstNode',
        execute: (state) => {
          executionOrder('firstNode');
          state.increment();
        },
      })
      .addNode({
        name: 'secondNode',
        execute: (state) => {
          executionOrder('secondNode');
          state.increment();
        },
      })
      .addNode({
        name: 'thirdNode',
        execute: (state) => {
          executionOrder('thirdNode');
          state.addAmount(3);
        },
      })
      .edge('firstNode', 'secondNode')
      .edge('secondNode', 'thirdNode');

    const app = workflow.compile('firstNode');
    const result = await app.run();

    expect(result.isOk).toBe(true);
    expect(counter().count).toBe(5);
    expect(result.output).toBe(counter());
    expect(result.output?.count).toBe(5);

    expect(executionOrder).toHaveBeenNthCalledWith(1, 'firstNode');
    expect(executionOrder).toHaveBeenNthCalledWith(2, 'secondNode');
    expect(executionOrder).toHaveBeenNthCalledWith(3, 'thirdNode');
  });

  it('should support dynamic edges based on state', async () => {
    const workflow = createStateGraph(counter)
      .addNode({
        name: 'checkCount',
        execute: () => {},
      })
      .addNode({
        name: 'incrementPath',
        execute: (state) => {
          state.increment();
        },
      })
      .addNode({
        name: 'decrementPath',
        execute: (state) => {
          state.decrement();
        },
      })
      .dynamicEdge('checkCount', () => {
        return counter().count > 0 ? 'decrementPath' : 'incrementPath';
      });

    let app = workflow.compile('checkCount');
    let result = await app.run();

    expect(result.isOk).toBe(true);
    expect(counter().count).toBe(1);
    expect(result.output).toBe(counter());

    counter.set({ count: 5 });

    app = workflow.compile('checkCount');
    result = await app.run();

    expect(result.isOk).toBe(true);
    expect(counter().count).toBe(4);
    expect(result.output).toBe(counter());
    expect(result.output?.count).toBe(4);
  });

  it('should execute parallel paths and merge results', async () => {
    const workflow = createStateGraph(counter)
      .addNode({
        name: 'start',
        execute: () => {},
      })
      .addNode({
        name: 'incrementBranch',
        execute: (state) => {
          state.increment();
        },
      })
      .addNode({
        name: 'addAmountBranch',
        execute: (state) => {
          state.addAmount(10);
        },
      })
      .addMergeNode({
        name: 'mergeBranches',
        branch: ['incrementBranch', 'addAmountBranch'],
        execute: (state) => {
          expect(state.addAmountBranch).toBe(counter());
          expect(state.incrementBranch).toBe(counter());
        },
      })
      .edge('start', ['incrementBranch', 'addAmountBranch']);

    const app = workflow.compile('start');
    const result = await app.run();

    expect(result.isOk).toBe(true);
    expect(counter().count).toBe(11); // 0 + 1 + 10
    expect(result.output).toBe(counter());
    expect(result.output?.count).toBe(11);
  });

  it('should terminate execution at specified end node', async () => {
    const nodeExecuted = {
      firstNode: false,
      secondNode: false,
      thirdNode: false,
    };

    const workflow = createStateGraph(counter)
      .addNode({
        name: 'firstNode',
        execute: (state) => {
          nodeExecuted.firstNode = true;
          state.increment();
        },
      })
      .addNode({
        name: 'secondNode',
        execute: (state) => {
          nodeExecuted.secondNode = true;
          state.increment();
        },
      })
      .addNode({
        name: 'thirdNode',
        execute: (state) => {
          nodeExecuted.thirdNode = true;
          state.increment();
        },
      })
      .edge('firstNode', 'secondNode')
      .edge('secondNode', 'thirdNode');

    const app = workflow.compile('firstNode', 'secondNode');
    const result = await app.run();

    expect(result.isOk).toBe(true);
    expect(counter().count).toBe(2); // 0 + 1 + 1
    expect(result.output).toBe(counter());

    expect(nodeExecuted.firstNode).toBe(true);
    expect(nodeExecuted.secondNode).toBe(true);
    expect(nodeExecuted.thirdNode).toBe(false);
  });

  it('should maintain state across multiple graph executions', async () => {
    const workflow = createStateGraph(counter).addNode({
      name: 'increment',
      execute: (state) => {
        state.increment();
      },
    });

    const app = workflow.compile('increment');

    await app.run();
    expect(counter().count).toBe(1);

    await app.run();
    expect(counter().count).toBe(2);

    await app.run();
    expect(counter().count).toBe(3);
  });

  it('should support complex state-based decision making', async () => {
    const executedPaths: string[] = [];

    const workflow = createStateGraph(counter)
      .addNode({
        name: 'evaluateCount',
        execute: (state) => {
          executedPaths.push('evaluateCount');

          if (state.count > 0) {
            state.addAmount(10);
          }
        },
      })
      .addNode({
        name: 'handleZero',
        execute: (state) => {
          executedPaths.push('handleZero');
          state.increment();
        },
      })
      .addNode({
        name: 'handleSmall',
        execute: (state) => {
          executedPaths.push('handleSmall');

          state.addAmount(5);
        },
      })
      .addNode({
        name: 'handleLarge',
        execute: (state) => {
          executedPaths.push('handleLarge');
          counter.set({ count: Math.floor(state.count / 2) });
        },
      })
      .dynamicEdge('evaluateCount', (state) => {
        const count = state.count;
        if (count === 0) return 'handleZero';
        if (count >= 15) return 'handleSmall';
        return 'handleLarge';
      });

    counter.set({ count: 0 });
    let app = workflow.compile('evaluateCount');
    await app.run();

    expect(counter().count).toBe(1);
    expect(executedPaths).toEqual(['evaluateCount', 'handleZero']);

    executedPaths.length = 0;

    counter.set({ count: 5 });
    app = workflow.compile('evaluateCount');
    await app.run();

    expect(counter().count).toBe(20);
    expect(executedPaths).toEqual(['evaluateCount', 'handleSmall']);

    executedPaths.length = 0;

    app = workflow.compile('evaluateCount');
    await app.run();

    expect(counter().count).toBe(35);
    expect(executedPaths).toEqual(['evaluateCount', 'handleSmall']);
  });

  it('should handle addMergeNode correctly', async () => {
    const executedPaths: string[] = [];

    const stateNode = graphStateNode({
      name: 'start',
      execute() {
        executedPaths.push('start');
      },
    });

    const workflow = createStateGraph(counter)
      .addNode(stateNode)
      .addNode({
        name: 'path1',
        execute: (state) => {
          executedPaths.push('path1');
          state.increment();
        },
      })
      .addNode({
        name: 'path2',
        execute: (state) => {
          executedPaths.push('path2');
          state.addAmount(10);
        },
      })
      .addMergeNode({
        name: 'merge',
        branch: ['path1', 'path2'],
        execute: () => {
          executedPaths.push('merge');
        },
      })
      .edge('start', ['path1', 'path2']);

    const app = workflow.compile('start');
    const result = await app.run();

    expect(result.isOk).toBe(true);
    expect(counter().count).toBe(11); // 1 + 10
    expect(result.output).toBe(counter());
    expect(executedPaths).toContain('start');
    expect(executedPaths).toContain('path1');
    expect(executedPaths).toContain('path2');
    expect(executedPaths).toContain('merge');
  });
});

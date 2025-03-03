import { describe, it, expect, vi } from 'vitest';
import { node, createGraph } from '../src/index';
import { setTimeout } from 'timers/promises';

const debug = (event) => {
  console.log(event);
};
debug('');

describe('Graph', () => {
  describe('Basic Graph Construction', () => {
    it('adding nodes', () => {
      const testGraph = createGraph()
        .addNode(
          node({
            name: 'input',
            processor: (input: string) => input.toUpperCase(),
          })
        )
        .addNode(
          node({
            name: 'output',
            processor: (input: string) => `Result: ${input}`,
          })
        );

      expect(testGraph).toBeDefined();
    });

    it('throws error when adding node with duplicate name', () => {
      const testGraph = createGraph().addNode(
        node({
          name: 'duplicate',
          processor: (input: number) => input * 2,
        })
      );

      expect(() =>
        testGraph.addNode(
          node({
            name: 'duplicate',
            processor: (input: number) => input * 3,
          })
        )
      ).toThrow();
    });

    it('adding edge between nodes', () => {
      const testGraph = createGraph()
        .addNode(
          node({
            name: 'start',
            processor: (input: number) => input * 2,
          })
        )
        .addNode(
          node({
            name: 'end',
            processor: (input: number) => input.toString(),
          })
        )
        .edge('start', 'end');

      expect(testGraph).toBeDefined();
    });

    it('throws error when adding edge to already connected node', () => {
      const testGraph = createGraph()
        .addNode(
          node({
            name: 'start' as string, // type
            processor: (input: number) => input * 2,
          })
        )
        .addNode(
          node({
            name: 'middle',
            processor: (input: number) => input + 1,
          })
        )
        .addNode(
          node({
            name: 'end',
            processor: (input: number) => input.toString(),
          })
        )
        .edge('start', 'middle');

      expect(() => testGraph.edge('start', 'end')).toThrow();
    });

    it('adding conditional routing with dynamicEdge', () => {
      const testGraph = createGraph()
        .addNode(
          node({
            name: 'start',
            processor: (input: number) => input,
          })
        )
        .addNode(
          node({
            name: 'even',
            processor: (input: number) => `${input} is even`,
          })
        )
        .addNode(
          node({
            name: 'odd',
            processor: (input: number) => `${input} is odd`,
          })
        )
        .dynamicEdge('start', (result) => {
          return {
            name: result.output % 2 === 0 ? 'even' : 'odd',
            input: result.input,
          };
        });

      expect(testGraph).toBeDefined();
    });
  });

  describe('Graph Execution', () => {
    it('executing simple linear graph', async () => {
      const testGraph = createGraph()
        .addNode(
          node({
            name: 'start',
            processor: (input: number) => input * 2,
          })
        )
        .addNode(
          node({
            name: 'middle',
            processor: (input: number) => input + 10,
          })
        )
        .addNode(
          node({
            name: 'end',
            processor: (input: number) => `Final result: ${input}`,
          })
        )
        .edge('start', 'middle')
        .edge('middle', 'end');

      const compiled = testGraph.compile('start', 'end');

      const result = await compiled.run(5);

      expect(result).toBe('Final result: 20');
    });

    it('executing conditional routing graph - even path', async () => {
      const testGraph = createGraph()
        .addNode(
          node({
            name: 'start',
            processor: (input: number) => input,
          })
        )
        .addNode(
          node({
            name: 'even',
            processor: (input: number) => `${input} is even`,
          })
        )
        .addNode(
          node({
            name: 'odd',
            processor: (input: number) => `${input} is odd`,
          })
        )
        .dynamicEdge('start', (result) => {
          return {
            name: result.output % 2 === 0 ? 'even' : 'odd',
            input: result.output,
          };
        });

      const compiled = testGraph.compile('start');
      const result = await compiled.run(4);

      expect(result).toBe('4 is even');
    });

    it('executing conditional routing graph - odd path', async () => {
      const testGraph = createGraph()
        .addNode(
          node({
            name: 'start',
            processor: (input: number) => input,
          })
        )
        .addNode(
          node({
            name: 'even',
            processor: (input: number) => `${input} is even`,
          })
        )
        .addNode(
          node({
            name: 'odd',
            processor: (input: number) => `${input} is odd`,
          })
        )
        .dynamicEdge('start', (result) => {
          return {
            name: result.output % 2 === 0 ? 'even' : 'odd',
            input: result.input,
          };
        });

      const compiled = testGraph.compile('start');
      const result = await compiled.run(5);

      expect(result).toBe('5 is odd');
    });

    it('executing node with async processor', async () => {
      const testGraph = createGraph()
        .addNode(
          node({
            name: 'start',
            processor: async (input: number) => {
              await setTimeout(10);
              return input * 2;
            },
          })
        )
        .addNode(
          node({
            name: 'end',
            processor: (input: number) => `Result: ${input}`,
          })
        )
        .edge('start', 'end');

      const compiled = testGraph.compile('start', 'end');
      const result = await compiled.run(5);

      expect(result).toBe('Result: 10');
    });

    it('throws error when compiling with non-existent start node', () => {
      const testGraph = createGraph().addNode(
        node({
          name: 'node1' as string,
          processor: (input: number) => input * 2,
        })
      );

      const compiled = testGraph.compile('nonexistent', 'node1');
      expect(() => compiled.run(5 as never)).toThrow();
    });

    it('handling errors during graph execution', async () => {
      const testGraph = createGraph()
        .addNode(
          node({
            name: 'start',
            processor: (input: number) => input,
          })
        )
        .addNode(
          node({
            name: 'middle',
            processor: (input: number) => {
              if (input === 0) throw new Error('Cannot divide by zero');
              return 10 / input;
            },
          })
        )
        .addNode(
          node({
            name: 'end',
            processor: (input: number) => `Result: ${input}`,
          })
        )
        .edge('start', 'middle')
        .edge('middle', 'end');

      const compiled = testGraph.compile('start', 'end');

      // Success case
      const successResult = await compiled.run(2);
      expect(successResult).toBe('Result: 5');

      // Error case
      const errorChain = compiled.run(0);
      await expect(errorChain).rejects.toThrow('Cannot divide by zero');

      // Error recovery
      const recoveredResult = await compiled.run(0).catch(() => 'An error occurred');

      expect(recoveredResult).toBe('An error occurred');
    });
  });

  describe('Event System', () => {
    it('subscribing to graph execution events', async () => {
      const eventHandler = vi.fn();

      const testGraph = createGraph()
        .addNode(
          node({
            name: 'start',
            processor: (input: number) => input * 2,
          })
        )
        .addNode(
          node({
            name: 'end',
            processor: (input: number) => input.toString(),
          })
        )
        .edge('start', 'end');

      const compiled = testGraph.compile('start', 'end');
      compiled.addEventListener(eventHandler);

      await compiled.run(5);

      // Graph start, 2x node start, 2x node end, graph end = 6 events total
      expect(eventHandler).toHaveBeenCalledTimes(6);

      // First call is GRAPH_START event
      expect(eventHandler.mock.calls[0][0].eventType).toBe('GRAPH_START');
      expect(eventHandler.mock.calls[0][0].input).toBe(5);

      // Last call is GRAPH_END event
      expect(eventHandler.mock.calls[5][0].eventType).toBe('GRAPH_END');
      expect(eventHandler.mock.calls[5][0].output).toBe('10');
      expect(eventHandler.mock.calls[5][0].isOk).toBe(true);
    });

    it('unsubscribing from events', async () => {
      const eventHandler = vi.fn();

      const testGraph = createGraph()
        .addNode(
          node({
            name: 'start',
            processor: (input: number) => input * 2,
          })
        )
        .addNode(
          node({
            name: 'end',
            processor: (input: number) => input.toString(),
          })
        )
        .edge('start', 'end');

      const compiled = testGraph.compile('start', 'end');
      compiled.addEventListener(eventHandler);

      await compiled.run(5);
      expect(eventHandler).toHaveBeenCalled();

      eventHandler.mockClear();
      compiled.removeEventListener(eventHandler);

      await compiled.run(5);
      expect(eventHandler).not.toHaveBeenCalled();
    });
  });

  describe('Execution Options', () => {
    it('limiting maximum node visits', async () => {
      // Create cyclic graph
      const testGraph = createGraph()
        .addNode(
          node({
            name: 'start',
            processor: (input: { count: number; data: number }) => {
              return { count: input.count + 1, data: input.data + 1 };
            },
          })
        )
        .addNode(
          node({
            name: 'condition',
            processor: (input: { count: number; data: number }) => input,
          })
        )
        .edge('start', 'condition')
        .dynamicEdge('condition', (result) => {
          if (result.output.count < 5)
            return {
              name: 'start',
              input: result.output,
            };
        });

      const compiled = testGraph.compile('start');

      // Run with default options (maxNodeVisits: 100)
      const result = await compiled.run({ count: 0, data: 0 });
      expect(result.count).toBe(5);
      expect(result.data).toBe(5);

      // Limit maxNodeVisits to 3
      const errorChain = compiled.run({ count: 0, data: 0 }, { maxNodeVisits: 3 });
      await expect(errorChain).rejects.toThrow('Maximum node visit count exceeded');
    });

    it('timeout option', async () => {
      const testGraph = createGraph()
        .addNode(
          node({
            name: 'slow',
            processor: async (input: number) => {
              await setTimeout(200); // 200ms delay
              return input * 2;
            },
          })
        )
        .addNode(
          node({
            name: 'end',
            processor: (input: number) => input.toString(),
          })
        )
        .edge('slow', 'end');

      const compiled = testGraph.compile('slow', 'end');

      // Run with sufficient timeout
      const successResult = await compiled.run(5, { timeout: 500 });
      expect(successResult).toBe('10');

      // Run with timeout that will cause failure
      const errorChain = compiled.run(5, { timeout: 50 });
      await expect(errorChain).rejects.toThrow();
    });
  });

  describe('Complex Workflow Tests', () => {
    it('complex workflow with branching and merging', async () => {
      type UserData = { username: string; age: number };
      type ProcessedData = UserData & { valid: boolean; message?: string };

      const testGraph = createGraph()
        .addNode(
          node({
            name: 'input',
            processor: (input: UserData) => input,
          })
        )
        .addNode(
          node({
            name: 'validate',
            processor: (input: UserData): ProcessedData => {
              if (!input.username) {
                return { ...input, valid: false, message: 'Username is required' };
              }
              if (input.age < 18) {
                return { ...input, valid: false, message: 'Must be 18 or older' };
              }
              return { ...input, valid: true };
            },
          })
        )
        .addNode(
          node({
            name: 'success',
            processor: (input: ProcessedData) => `Success: Welcome, ${input.username}!`,
          })
        )
        .addNode(
          node({
            name: 'failure',
            processor: (input: ProcessedData) => `Error: ${input.message}`,
          })
        )
        .edge('input', 'validate')
        .dynamicEdge('validate', async (result) => {
          return {
            name: result.output.valid ? 'success' : 'failure',
            input: result.output,
          };
        });

      const compiled = testGraph.compile('input');

      // Success case
      const successResult = await compiled.run({ username: 'John', age: 25 });
      expect(successResult).toBe('Success: Welcome, John!');

      // Failure case 1: No username
      const failure1 = await compiled.run({ username: '', age: 25 });
      expect(failure1).toBe('Error: Username is required');

      // Failure case 2: Underage
      const failure2 = await compiled.run({ username: 'Alex', age: 16 });
      expect(failure2).toBe('Error: Must be 18 or older');
    });
  });
});

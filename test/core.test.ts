import { describe, test, expect } from 'vitest';
import { createGraph, node } from '../src/core';
import { GraphEvent, GraphResult } from '../src/interfaces';

const debug = (e) => {
  console.log(e);
};
debug('');

describe('Workflow System', () => {
  describe('Creating and Compiling Workflows', () => {
    test('should create a simple workflow with two nodes', () => {
      const workflow = createGraph()
        .addNode(
          node({
            name: 'start',
            processor: (input: number) => input * 2,
          })
        )
        .addNode(
          node({
            name: 'end',
            processor: (input: number) => input + 10,
          })
        )
        .edge('start', 'end')
        .compile('start', 'end');

      expect(workflow).toBeDefined();

      const structure = workflow.getStructure();
      expect(structure.nodes.has('start')).toBe(true);
      expect(structure.nodes.has('end')).toBe(true);
      expect(structure.edges.get('start')).toBe('end');
    });

    test('should throw an error when adding a node with duplicate name', () => {
      const workflow = createGraph().addNode(
        node({
          name: 'start',
          processor: (input: number) => input * 2,
        })
      );

      expect(() => {
        workflow.addNode(
          node({
            name: 'start',
            processor: (input: number) => input * 3,
          })
        );
      }).toThrow(/Node with name "start" already exists/);
    });
  });

  describe('Running Workflows', () => {
    test('should run a simple workflow with two nodes', async () => {
      const workflow = createGraph()
        .addNode(
          node({
            name: 'start',
            processor: (input: number) => input * 2,
          })
        )
        .addNode(
          node({
            name: 'end',
            processor: (input: number) => input + 10,
          })
        )
        .edge('start', 'end')
        .compile('start', 'end');

      const result = await workflow.run(5);

      expect(result.isOk).toBe(true);
      expect(result.output).toBe(20); // (5 * 2) + 10
      expect(result.histories.length).toBe(2);
      expect(result.histories[0].node.name).toBe('start');
      expect(result.histories[1].node.name).toBe('end');
    });

    test('should handle async node processors', async () => {
      const workflow = createGraph()
        .addNode(
          node({
            name: 'start',
            processor: async (input: number) => {
              return new Promise<number>((resolve) => setTimeout(() => resolve(input * 2), 10));
            },
          })
        )
        .addNode(
          node({
            name: 'end',
            processor: (input: number) => input + 10,
          })
        )
        .edge('start', 'end')
        .compile('start', 'end');

      const result = await workflow.run(5);

      expect(result.isOk).toBe(true);
      expect(result.output).toBe(20); // (5 * 2) + 10
    });

    test('should handle errors in node processors', async () => {
      const workflow = createGraph()
        .addNode(
          node({
            name: 'start',
            processor: (input: number) => {
              if (input < 0) throw new Error('Input must be positive');
              return input * 2;
            },
          })
        )
        .addNode(
          node({
            name: 'end',
            processor: (input: number) => input + 10,
          })
        )
        .edge('start', 'end')
        .compile('start', 'end');

      const result = await workflow.run(-5);

      expect(result.isOk).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('Input must be positive');
      expect(result.histories.length).toBe(1);
      expect(result.histories[0].isOk).toBe(false);
    });

    test('should respect timeout option', async () => {
      const workflow = createGraph()
        .addNode(
          node({
            name: 'start',
            processor: async () => {
              return new Promise((resolve) => setTimeout(resolve, 100));
            },
          })
        )
        .compile('start');

      const result = await workflow.run(null, { timeout: 50 });

      expect(result.isOk).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toMatch(/timeout/i);
    });

    test('should respect maxNodeVisits option', async () => {
      // Create a workflow with an infinite loop
      const workflow = createGraph()
        .addNode(
          node({
            name: 'loopNode',
            processor: (count: number) => count + 1,
          })
        )
        .dynamicEdge('loopNode', () => 'loopNode')
        .compile('loopNode');

      const result = await workflow.run(0, { maxNodeVisits: 5 });

      expect(result.isOk).toBe(false);
      expect(result.error?.message).toMatch(/Maximum node visit count exceeded/);
      expect(result.histories.length).toBe(5);
    });
  });

  describe('Edge Connections', () => {
    test('should support static edge connections', async () => {
      const workflow = createGraph()
        .addNode(
          node({
            name: 'nodeA',
            processor: (input: string) => input.toUpperCase(),
          })
        )
        .addNode(
          node({
            name: 'nodeB',
            processor: (input: string) => input + '!',
          })
        )
        .edge('nodeA', 'nodeB')
        .compile('nodeA', 'nodeB');

      const result = await workflow.run('hello');

      expect(result.isOk).toBe(true);
      expect(result.output).toBe('HELLO!');
    });

    test('should support dynamic edge connections', async () => {
      const workflow = createGraph()
        .addNode(
          node({
            name: 'input',
            processor: (input: number) => input,
          })
        )
        .addNode(
          node({
            name: 'evenPath',
            processor: (input: number) => `${input} is even`,
          })
        )
        .addNode(
          node({
            name: 'oddPath',
            processor: (input: number) => `${input} is odd`,
          })
        )
        .dynamicEdge('input', ({ output }) => {
          return output % 2 === 0 ? 'evenPath' : 'oddPath';
        })
        .compile('input');

      const evenResult = await workflow.run(2);
      expect(evenResult.isOk).toBe(true);
      expect(evenResult.output).toBe('2 is even');

      const oddResult = await workflow.run(3);
      expect(oddResult.isOk).toBe(true);
      expect(oddResult.output).toBe('3 is odd');
    });

    test('should handle dynamic edge with input transformation', async () => {
      const workflow = createGraph()
        .addNode(
          node({
            name: 'start',
            processor: (input: string) => ({ value: input, length: input.length }),
          })
        )
        .addNode(
          node({
            name: 'process',
            processor: (input: { processedValue: string }) => input.processedValue,
          })
        )
        .dynamicEdge('start', ({ output }) => ({
          name: 'process',
          input: { processedValue: `Processed: ${output.value} (${output.length})` },
        }))
        .compile('start');

      const result = await workflow.run('hello');

      expect(result.isOk).toBe(true);
      expect(result.output).toBe('Processed: hello (5)');
    });

    test('should throw error when adding multiple edges from same node', () => {
      const workflow = createGraph()
        .addNode(
          node({
            name: 'nodeA',
            processor: (input: string) => input,
          })
        )
        .addNode(
          node({
            name: 'nodeB',
            processor: (input: string) => input,
          })
        )
        .addNode(
          node({
            name: 'nodeC',
            processor: (input: string) => input,
          })
        )
        .edge('nodeA', 'nodeB');

      expect(() => {
        (workflow as any).edge('nodeA', 'nodeC');
      }).toThrow(/Node "nodeA" already has an outgoing connection/);
    });
  });

  describe('Event Handling', () => {
    test('should emit workflow start and end events', async () => {
      const workflow = createGraph()
        .addNode(
          node({
            name: 'process',
            processor: (input: number) => input * 2,
          })
        )
        .compile('process');

      const events: GraphEvent[] = [];
      workflow.subscribe((event) => {
        events.push(event);
      });

      await workflow.run(5);

      expect(events.length).toBe(4);
      expect(events[0].eventType).toBe('WORKFLOW_START');
      expect(events[1].eventType).toBe('NODE_START');
      expect(events[2].eventType).toBe('NODE_END');
      expect(events[3].eventType).toBe('WORKFLOW_END');

      const startEvent = events[0] as any;
      expect(startEvent.input).toBe(5);

      const endEvent = events[3] as any;
      expect(endEvent.isOk).toBe(true);
      expect(endEvent.output).toBe(10);
    });

    test('should unsubscribe from events', async () => {
      const workflow = createGraph()
        .addNode(
          node({
            name: 'process',
            processor: (input: number) => input * 2,
          })
        )
        .compile('process');

      const events: GraphEvent[] = [];
      const handler = (event: GraphEvent) => {
        events.push(event);
      };

      workflow.subscribe(handler);
      await workflow.run(5);
      expect(events.length).toBe(4);

      events.length = 0;
      workflow.unsubscribe(handler);
      await workflow.run(5);
      expect(events.length).toBe(0);
    });
  });

  describe('Hooks', () => {
    // Helper function to create a promise-based lock
    const createLock = () => {
      let resolve: () => void;
      let promise = Promise.resolve();
      const lock = () => {
        promise = new Promise<void>((r) => {
          resolve = r;
        });
      };

      return {
        lock,
        wait: () => promise,
        unlock: () => resolve?.(),
      };
    };

    test('should attach and execute hooks', async () => {
      // Create the main workflow
      const workflow = createGraph()
        .addNode(
          node({
            name: 'main',
            processor: (input: number) => input * 2,
          })
        )
        .compile('main');

      const lockUtil = createLock();

      const hookResults: GraphResult<any>[] = [];

      // Create a hook using the attachHook method from the compiled workflow
      const hookConnector = workflow
        .attachHook('main')
        .addNode(
          node({
            name: 'hook',
            processor: (input: number) => input + 5,
          })
        )
        .compile('hook');

      // Connect the hook with result handler
      hookConnector.connect({
        onResult: (result) => {
          hookResults.push(result);
          lockUtil.unlock(); // Unlock when hook execution completes
        },
      });
      lockUtil.lock();
      workflow.run(10);

      // Wait for the hook to complete
      await lockUtil.wait();

      // Now we can safely check the hook results
      expect(hookResults.length).toBe(1);
      expect(hookResults[0].isOk).toBe(true);
      expect(hookResults[0].output).toBe(25); // (10 * 2) + 5
    });

    test('should disconnect hooks', async () => {
      // Create the main workflow
      const workflow = createGraph()
        .addNode(
          node({
            name: 'main',
            processor: (input: number) => input * 2,
          })
        )
        .compile('main');

      const lockUtil = createLock();
      const hookResults: GraphResult<any>[] = [];

      // Attach a hook to the compiled workflow
      const hookConnector = workflow
        .attachHook('main')
        .addNode(
          node({
            name: 'hook',
            processor: (input: number) => input + 5,
          })
        )
        .compile('hook');

      // Connect the hook with result handler
      hookConnector.connect({
        onResult: (result) => {
          hookResults.push(result);
          lockUtil.unlock();
        },
      });
      // Run the workflow and wait for the hook
      lockUtil.lock();
      await workflow.run(10);
      await lockUtil.wait();
      expect(hookResults.length).toBe(1);

      // Disconnect the hook
      hookConnector.disconnect();
      // Run the workflow again
      await workflow.run(10);

      // Check that no new hook results were added
      expect(hookResults.length).toBe(1);
    });

    test('should support multi-node hook workflows', async () => {
      // Create the main workflow
      const workflow = createGraph()
        .addNode(
          node({
            name: 'main',
            processor: (input: string) => input.toUpperCase(),
          })
        )
        .compile('main');

      const lockUtil = createLock();
      let hookOutput: string | undefined;

      // Attach a multi-node hook to the compiled workflow
      const hookConnector = workflow
        .attachHook('main')
        .addNode(
          node({
            name: 'hook1',
            processor: (input: string) => input.toLowerCase(),
          })
        )
        .addNode(
          node({
            name: 'hook2',
            processor: (input: string) => `transformed: ${input}`,
          })
        )
        .edge('hook1', 'hook2')
        .compile('hook1', 'hook2');

      // Connect the hook with result handler
      hookConnector.connect({
        onResult: (result) => {
          if (result.isOk) {
            hookOutput = result.output;
          }
          lockUtil.unlock();
        },
      });

      // Run the workflow and wait for the hook to complete
      lockUtil.lock();
      await workflow.run('Hello');
      await lockUtil.wait();

      expect(hookOutput).toBe('transformed: hello');
    });
  });

  describe('Complex Workflows', () => {
    test('should handle multi-node workflows with various edge types', async () => {
      interface UserData {
        name: string;
        age: number;
      }

      const workflow = createGraph()
        .addNode(
          node({
            name: 'input',
            processor: (input: UserData) => input,
          })
        )
        .addNode(
          node({
            name: 'validate',
            processor: (input: UserData) => {
              if (!input.name) throw new Error('Name is required');
              if (input.age < 0) throw new Error('Age must be positive');
              return input;
            },
          })
        )
        .addNode(
          node({
            name: 'processMajor',
            processor: (input: UserData) => `${input.name} is an adult (${input.age})`,
          })
        )
        .addNode(
          node({
            name: 'processMinor',
            processor: (input: UserData) => `${input.name} is a minor (${input.age})`,
          })
        )
        .addNode(
          node({
            name: 'output',
            processor: (input: string) => ({ message: input }),
          })
        )
        .edge('input', 'validate')
        .dynamicEdge('validate', ({ output }) => {
          return output.age >= 18 ? 'processMajor' : 'processMinor';
        })
        .edge('processMajor', 'output')
        .edge('processMinor', 'output')
        .compile('input', 'output');

      const adultResult = await workflow.run({ name: 'John', age: 25 });
      expect(adultResult.isOk).toBe(true);
      expect(adultResult.output).toEqual({ message: 'John is an adult (25)' });

      const minorResult = await workflow.run({ name: 'Jane', age: 15 });
      expect(minorResult.isOk).toBe(true);
      expect(minorResult.output).toEqual({ message: 'Jane is a minor (15)' });

      const invalidResult = await workflow.run({ name: '', age: 20 });
      expect(invalidResult.isOk).toBe(false);
      expect(invalidResult.error?.message).toBe('Name is required');
    });
  });
});

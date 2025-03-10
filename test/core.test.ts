import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

import type { GraphEvent } from '../src/interfaces';
import { delay } from '../src/shared';
import { graphMergeNode, graphNodeRouter } from '../src/core/helper';
import { createGraph } from '../src/core/registry';
import { GraphConfigurationError } from '../src/core/error';

describe('Workflow Module', () => {
  // Set up console error spy
  let consoleErrorSpy;
  const noop = () => {};
  beforeAll(() => {
    process.on('unhandledRejection', noop);

    process.on('uncaughtException', noop);
  });

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('1. Basic Node Creation and Registration', () => {
    it('should be able to create and register nodes', () => {
      const workflow = createGraph().addNode({
        name: 'test',
        execute: (input: number) => input * 2,
      });

      const app = workflow.compile('test');
      expect(app).toBeDefined();
    });

    it('should throw an error when registering duplicate node names', () => {
      const workflow = createGraph().addNode({
        name: 'test',
        execute: (input: number) => input * 2,
      });

      expect(() =>
        workflow.addNode({
          name: 'test',
          execute: (input: number) => input * 3,
        })
      ).toThrow('Node with name "test" already exists in the graph');
    });

    it('getStructure method should return the correct graph structure', () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'process',
          execute: (input: number) => input * 2,
        })
        .edge('start', 'process');

      const app = workflow.compile('start');
      const structure = app.getStructure();

      expect(structure).toHaveLength(2);
      expect(structure).toContainEqual(
        expect.objectContaining({
          name: 'start',
          edge: expect.objectContaining({
            type: 'direct',
            name: ['process'],
          }),
        })
      );
    });
  });

  describe('2. Single Path Workflow Execution', () => {
    it('should be able to execute a single node workflow', async () => {
      const workflow = createGraph().addNode({
        name: 'single',
        execute: (input: number) => input * 2,
      });

      const app = workflow.compile('single');
      const result = await app.run(5);

      expect(result.isOk).toBe(true);
      expect(result.output).toBe(10);
      expect(result.histories).toHaveLength(1);
      expect((result.histories[0].node as any).output).toBe(10);
    });

    it('should be able to execute a linear workflow with multiple nodes', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input * 2,
        })
        .addNode({
          name: 'middle',
          execute: (input: number) => input + 5,
        })
        .addNode({
          name: 'end',
          execute: (input: number) => input * 3,
        })
        .edge('start', 'middle')
        .edge('middle', 'end');

      const app = workflow.compile('start');
      const result = await app.run(5);

      expect(result.isOk).toBe(true);
      expect(result.output).toBe(45); // ((5 * 2) + 5) * 3 = 45
      expect(result.histories).toHaveLength(3);
      expect(result.histories[0].node.name).toBe('start');
      expect(result.histories[1].node.name).toBe('middle');
      expect(result.histories[2].node.name).toBe('end');
    });

    it('should terminate at the specified end node', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input * 2,
        })
        .addNode({
          name: 'middle',
          execute: (input: number) => input + 5,
        })
        .addNode({
          name: 'end',
          execute: (input: number) => input * 3,
        })
        .edge('start', 'middle')
        .edge('middle', 'end');

      const app = workflow.compile('start', 'middle');

      const result = await app.run(5);

      expect(result.isOk).toBe(true);
      expect(result.output).toBe(15); // (5 * 2) + 5 = 15
      expect(result.histories).toHaveLength(2);
      expect(result.histories[1].node.name).toBe('middle');
    });
  });

  describe('3. Event Publishing and Subscription', () => {
    it('should publish appropriate events during workflow execution', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input * 2,
        })
        .addNode({
          name: 'end',
          execute: (input: number) => input + 5,
        })
        .edge('start', 'end');

      const app = workflow.compile('start');

      const events: any[] = [];
      const handler = (event: GraphEvent) => {
        events.push(event);
      };

      app.subscribe(handler);
      await app.run(5);
      app.unsubscribe(handler);

      expect(events).toHaveLength(6); // WORKFLOW_START + 2 * NODE_START/END + WORKFLOW_END
      expect(events[0].eventType).toBe('WORKFLOW_START');
      expect(events[1].eventType).toBe('NODE_START');
      expect(events[1].node.name).toBe('start');
      expect(events[2].eventType).toBe('NODE_END');
      expect(events[5].eventType).toBe('WORKFLOW_END');
    });
  });

  describe('4. Dynamic Routing', () => {
    it('should execute different paths based on conditions with dynamic routing', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'even',
          execute: (input: number) => input + ' is even',
        })
        .addNode({
          name: 'odd',
          execute: (input: number) => input + ' is odd',
        })
        .dynamicEdge('start', (output) => {
          return output % 2 === 0 ? 'even' : 'odd';
        });

      // Test with even input
      const app1 = workflow.compile('start');
      const result1 = await app1.run(4);
      expect(result1.output).toBe('4 is even');

      // Test with odd input
      const app2 = workflow.compile('start');
      const result2 = await app2.run(5);
      expect(result2.output).toBe('5 is odd');
    });

    it('should terminate the workflow when a dynamic edge returns undefined', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'never',
          execute: () => 'Should not reach here',
        })
        .dynamicEdge(
          'start',
          graphNodeRouter(() => {
            return undefined;
          })
        );

      const app = workflow.compile('start');
      const result = await app.run(5);

      expect(result.output).toBe(5);
      expect(result.histories).toHaveLength(1);
    });
  });

  describe('5. Error Handling', () => {
    it('should fail the workflow when a node execution throws an error', async () => {
      const workflow = createGraph().addNode({
        name: 'start',
        execute: () => {
          throw new Error('Test error');
        },
      });

      const app = workflow.compile('start');

      const result = await app.run(5);
      expect(result.isOk).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('Test error');
    });

    it('should throw an error when adding an edge to a non-existent node', () => {
      const workflow = createGraph().addNode({
        name: 'start',
        execute: (input: number) => input,
      });
      workflow.edge('start', 'nonexistent' as any);
      expect(() => workflow.compile('start')).toThrow();
    });

    it('should throw an error when exceeding the maximum node visits', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'nodeA',
          execute: (input: number) => input + 1,
        })
        .addNode({
          name: 'nodeB',
          execute: (input: number) => input + 1,
        })
        .edge('nodeA', 'nodeB')
        .edge('nodeB', 'nodeA');

      const app = workflow.compile('nodeA');

      const result = await app.run(0, { maxNodeVisits: 5 });

      expect(result.isOk).toBe(false);
      expect(result.error?.message).toContain('Maximum node visits (5) exceeded for node "nodeB"');
    });

    it('should fail the workflow on timeout', async () => {
      const workflow = createGraph().addNode({
        name: 'slow',
        execute: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return input;
        },
      });

      const app = workflow.compile('slow');
      const result = await app.run(5, { timeout: 50 });

      expect(result.isOk).toBe(false);
      expect(result.error?.message).toContain('Graph execution timed out after 50ms');
    });
  });

  describe('6. Parallel Execution and Merge Nodes', () => {
    it('should work with basic merge nodes', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'branchA',
          execute: async (input: number) => delay(3000).then(() => String(input * 2)),
        })
        .addNode({
          name: 'branchB',
          execute: async (input: number) => delay(4000).then(() => String(input + 10)),
        })
        .addMergeNode({
          name: 'merge',
          branch: ['branchA', 'branchB'],
          execute: (inputs) => {
            return Number(inputs.branchA) + Number(inputs.branchB);
          },
        })
        .edge('start', ['branchA', 'branchB']);
      const app = workflow.compile('start');
      const result = await app.run(5);

      expect(result.isOk).toBe(true);
      // (5 * 2) + (5 + 10) = 10 + 15 = 25
      expect(result.output).toBe(25);
      expect(result.histories).toHaveLength(4);
    }, 10000);

    it('should not let one branch affect another branch', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'branchA',
          execute: (input: number) => {
            // Intentionally slow operation
            return new Promise((resolve) => setTimeout(() => resolve(input * 2), 50));
          },
        })
        .addNode({
          name: 'branchB',
          execute: (input: number) => input + 5,
        })
        .addMergeNode({
          name: 'merge',
          branch: ['branchA', 'branchB'],
          execute: (inputs) => {
            return [inputs.branchA, inputs.branchB];
          },
        })
        .edge('start', ['branchA', 'branchB']);

      const app = workflow.compile('start');
      const result = await app.run(5);

      expect(result.isOk).toBe(true);
      expect(result.output).toEqual([10, 10]); // [5*2, 5+5]
    });

    it('should wait for all source nodes to complete before executing a merge node', async () => {
      // This test has source nodes with different execution times
      const completionTimes: Record<string, number> = {};

      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'fastBranch',
          execute: async (input: number) => {
            // Fast completing branch
            await new Promise((resolve) => setTimeout(resolve, 10));
            completionTimes.fastBranch = Date.now();
            return input * 2;
          },
        })
        .addNode({
          name: 'slowBranch',
          execute: async (input: number) => {
            // Slow completing branch
            await new Promise((resolve) => setTimeout(resolve, 50));
            completionTimes.slowBranch = Date.now();
            return input + 10;
          },
        })
        .addMergeNode({
          name: 'merge',
          branch: ['fastBranch', 'slowBranch'],
          execute: (inputs) => {
            completionTimes.merge = Date.now();
            return inputs;
          },
        })
        .edge('start', ['fastBranch', 'slowBranch']);

      const app = workflow.compile('start');
      await app.run(5);

      // Merge node should execute after the slowest branch
      expect(completionTimes.merge).toBeGreaterThanOrEqual(completionTimes.slowBranch);
      expect(completionTimes.merge).toBeGreaterThan(completionTimes.fastBranch);
    });

    it('should fail the entire workflow if one branch fails', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'goodBranch',
          execute: (input: number) => input * 2,
        })
        .addNode({
          name: 'errorBranch',
          execute: () => {
            throw new Error('Branch execution failed');
          },
        })
        .addMergeNode({
          name: 'merge',
          branch: ['goodBranch', 'errorBranch'],
          execute: (inputs) => inputs,
        })
        .edge('start', ['goodBranch', 'errorBranch']);

      const app = workflow.compile('start');
      const result = await app.run(5);

      expect(result.isOk).toBe(false);
      expect(result.histories.some((h) => h.node.name == 'merge')).toBe(false);
      expect(result.error?.message).toContain('Branch execution failed');
    });

    it('should execute complex parallel and sequential workflows correctly', async () => {
      // Complex workflow combining multiple stages of parallel and sequential execution
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'processA',
          execute: (input: number) => input * 2,
        })
        .addNode({
          name: 'processB',
          execute: (input: number) => input + 5,
        })
        .addMergeNode({
          name: 'merge1',
          branch: ['processA', 'processB'],
          execute: (inputs: { processA: number; processB: number }) => {
            return inputs.processA + inputs.processB;
          },
        })
        .addNode({
          name: 'splitAgain',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'processC',
          execute: (input: number) => input / 2,
        })
        .addNode({
          name: 'processD',
          execute: (input: number) => input - 3,
        })
        .addMergeNode({
          name: 'finalMerge',
          branch: ['processC', 'processD'],
          execute: (inputs: { processC: number; processD: number }) => {
            return [inputs.processC, inputs.processD];
          },
        })
        .edge('start', ['processA', 'processB'])
        .edge('merge1', 'splitAgain')
        .edge('splitAgain', ['processC', 'processD']);

      const app = workflow.compile('start');
      const result = await app.run(5);

      // Calculation process:
      // 1. start: 5
      // 2. processA: 5*2=10, processB: 5+5=10
      // 3. merge1: 10+10=20
      // 4. splitAgain: 20
      // 5. processC: 20/2=10, processD: 20-3=17
      // 6. finalMerge: [10, 17]

      expect(result.isOk).toBe(true);
      expect(result.output).toEqual([10, 17]);
    });
  });

  describe('7. Graph Structure Validation', () => {
    it('should throw an error when compiling with a non-existent start node', () => {
      const workflow = createGraph().addNode({
        name: 'nodeA',
        execute: (input: number) => input,
      });

      expect(() => workflow.compile('nonexistent')).toThrow(GraphConfigurationError);
      expect(() => workflow.compile('nonexistent')).toThrow(/node.*not found/i);
    });
  });

  describe('8. Advanced Merge Node Scenarios', () => {
    it('should handle nested merge nodes correctly', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        // First level branches
        .addNode({
          name: 'branch1A',
          execute: (input: number) => input * 2,
        })
        .addNode({
          name: 'branch1B',
          execute: (input: number) => input + 3,
        })
        // Second level branches
        .addNode({
          name: 'branch2A',
          execute: (input: number) => input - 1,
        })
        .addNode({
          name: 'branch2B',
          execute: (input: number) => input * 3,
        })
        // Merge nodes
        .addMergeNode({
          name: 'merge1',
          branch: ['branch1A', 'branch1B'],
          execute: (inputs) => inputs.branch1A + inputs.branch1B,
        })
        .addMergeNode({
          name: 'merge2',
          branch: ['branch2A', 'branch2B'],
          execute: (inputs) => inputs.branch2A + inputs.branch2B,
        })
        .addMergeNode({
          name: 'finalMerge',
          branch: ['merge1', 'merge2'],
          execute: (inputs) => [inputs.merge1, inputs.merge2],
        })
        .edge('start', ['branch1A', 'branch1B', 'branch2A', 'branch2B']);

      const app = workflow.compile('start');
      const result = await app.run(5);

      // Calculation:
      // branch1A: 5*2=10, branch1B: 5+3=8, merge1: 10+8=18
      // branch2A: 5-1=4, branch2B: 5*3=15, merge2: 4+15=19
      // finalMerge: [18, 19]
      expect(result.output).toEqual([18, 19]);
    });

    it('should only process completed sources when reaching the end node before all merge node sources complete', async () => {
      const mergeNode = graphMergeNode({
        name: 'merge',
        branch: ['fastBranch', 'slowBranch'],
        execute: (inputs) => {
          return { ...inputs };
        },
      });
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'fastBranch',
          execute: (input: number) => input * 2,
        })
        .addNode({
          name: 'slowBranch',
          execute: async (input: number) => {
            await new Promise((resolve) => setTimeout(resolve, 500));
            return input + 10;
          },
        })
        .addMergeNode(mergeNode)
        .edge('start', ['fastBranch', 'slowBranch']);

      const app = workflow.compile('start', 'fastBranch');

      const result = await app.run(5);

      expect(result.output).toBe(10);
    });
  });

  describe('9. Middleware Functionality', () => {
    it('should allow middleware to modify node input', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input * 2,
        })
        .addNode({
          name: 'end',
          execute: (input: number) => `Result: ${input}`,
        })
        .edge('start', 'end');

      const app = workflow.compile('start');

      // Add middleware to modify input
      app.use((node, next) => {
        if (node.name === 'start') {
          // Double the input before node execution
          next({ name: node.name, input: (node.input as number) * 2 });
        } else {
          next();
        }
      });

      const result = await app.run(5);

      // Input 5 -> middleware makes it 10 -> start node multiplies by 2 -> 20 -> end node formats it
      expect(result.output).toBe('Result: 20');
    });

    it('should allow middleware to redirect execution flow', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'normal',
          execute: (input: number) => `Normal: ${input}`,
        })
        .addNode({
          name: 'special',
          execute: (input: number) => `Special: ${input * 10}`,
        })
        .edge('start', 'normal');

      const app = workflow.compile('start');

      // Add middleware to redirect to a different node
      app.use((node, next) => {
        if (node.name === 'start' && node.input > 10) {
          // Redirect to 'special' node for inputs > 10
          next({ name: 'special', input: node.input });
        } else {
          next();
        }
      });

      // Test with input <= 10 (should go to 'normal')
      const result1 = await app.run(5);
      expect(result1.output).toBe('Normal: 5');

      // Test with input > 10 (should go to 'special')
      const result2 = await app.run(15);
      expect(result2.output).toBe('Special: 150');
    });

    it('should handle errors thrown in middleware', async () => {
      const workflow = createGraph().addNode({
        name: 'node',
        execute: (input: string) => input,
      });

      const app = workflow.compile('node');

      app.use(() => {
        throw new Error('Middleware error');
      });

      const result = await app.run('test');
      expect(result.isOk).toBe(false);
      expect(result.error?.message).toContain('Middleware error');
    });
  });
});

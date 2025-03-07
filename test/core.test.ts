import { describe, test, expect } from 'vitest';
import { createGraph, node, GraphNodeRouter } from '../src/core';
import { GraphEvent, GraphResult } from '../src/interfaces';
import { z } from 'zod';

// Helper function to create a promise-based lock
const createLock = () => {
  let resolve: () => void;
  let promise = Promise.resolve();
  const lock = () => {
    promise = new Promise<void>((r) => {
      resolve = r;
    });
  };
  lock();
  return {
    lock,
    wait: () => promise,
    unlock: () => resolve?.(),
  };
};

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
            execute: (input: number) => input * 2,
          })
        )
        .addNode(
          node({
            name: 'end',
            execute: (input: number) => input + 10,
          })
        )
        .edge('start', 'end')
        .compile('start', 'end');

      expect(workflow).toBeDefined();

      const structure = workflow.getStructure();

      expect(structure.some((node) => node.name == 'start')).toBe(true);
      expect(structure.some((node) => node.name == 'end')).toBe(true);
      expect(structure.find((node) => node.name == 'start')?.edge).toEqual({ name: 'end', type: 'direct' });
    });

    test('should throw an error when adding a node with duplicate name', () => {
      const workflow = createGraph().addNode(
        node({
          name: 'start',
          execute: (input: number) => input * 2,
        })
      );

      expect(() => {
        workflow.addNode(
          node({
            name: 'start',
            execute: (input: number) => input * 3,
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
            execute: (input: number) => input * 2,
          })
        )
        .addNode(
          node({
            name: 'end',
            execute: (input: number) => input + 10,
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

    test('should handle async node executes', async () => {
      const workflow = createGraph()
        .addNode(
          node({
            name: 'start',
            execute: async (input: number) => {
              return new Promise<number>((resolve) => setTimeout(() => resolve(input * 2), 10));
            },
          })
        )
        .addNode(
          node({
            name: 'end',
            execute: (input: number) => input + 10,
          })
        )
        .edge('start', 'end')
        .compile('start', 'end');

      const result = await workflow.run(5);

      expect(result.isOk).toBe(true);
      expect(result.output).toBe(20); // (5 * 2) + 10
    });

    test('should handle errors in node executes', async () => {
      const workflow = createGraph()
        .addNode(
          node({
            name: 'start',
            execute: (input: number) => {
              if (input < 0) throw new Error('Input must be positive');
              return input * 2;
            },
          })
        )
        .addNode(
          node({
            name: 'end',
            execute: (input: number) => input + 10,
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
            execute: async () => {
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

      const router = GraphNodeRouter(() => {
        return 'loopNode';
      });
      const workflow = createGraph()
        .addNode(
          node({
            name: 'loopNode',
            execute: (count: number) => count + 1,
          })
        )
        .dynamicEdge('loopNode', router)
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
        .addNode({
          name: 'nodeA',
          execute: (input: string) => input.toUpperCase(),
        })
        .addNode(
          node({
            name: 'nodeB',
            execute: (input: string) => input + '!',
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
            execute: (input: number) => input,
          })
        )
        .addNode(
          node({
            name: 'evenPath',
            execute: (input: number) => `${input} is even`,
          })
        )
        .addNode(
          node({
            name: 'oddPath',
            execute: (input: number) => `${input} is odd`,
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
            execute: (input: string) => ({ value: input, length: input.length }),
          })
        )
        .addNode(
          node({
            name: 'process',
            execute: (input: { processedValue: string }) => input.processedValue,
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
            execute: (input: string) => input,
          })
        )
        .addNode(
          node({
            name: 'nodeB',
            execute: (input: string) => input,
          })
        )
        .addNode(
          node({
            name: 'nodeC',
            execute: (input: string) => input,
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
            execute: (input: number) => input * 2,
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
            execute: (input: number) => input * 2,
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

  describe('Node parameters Validation', () => {
    test('should validate input using zod parameters', async () => {
      // Define a parameters for user data
      const userparameters = z.object({
        name: z.string().min(1, 'Name is required'),
        age: z.number().min(0, 'Age must be positive'),
        email: z.string().email('Invalid email format'),
      });

      // Create a workflow with parameters validation
      const workflow = createGraph()
        .addNode({
          name: 'validateUser',
          execute: (input) => input, // Simply pass through valid data
          parameters: userparameters, // Add parameters for validation
        })
        .addNode({
          name: 'processUser',
          execute: (input) => ({
            displayName: input.name.toUpperCase(),
            isAdult: input.age >= 18,
          }),
        })
        .edge('validateUser', 'processUser');

      const app = workflow.compile('validateUser', 'processUser');

      // Test with valid data - should pass validation
      const validResult = await app.run(
        {
          name: 'John',
          age: 25,
          email: 'john@example.com',
        },
        { maxNodeVisits: 4 }
      );
      console.log(validResult.error);
      expect(validResult.isOk).toBe(true);
      expect(validResult.output).toEqual({
        displayName: 'JOHN',
        isAdult: true,
      });

      // Test with invalid data - missing name
      const invalidNameResult = await app.run({
        name: '',
        age: 30,
        email: 'test@example.com',
      });

      expect(invalidNameResult.isOk).toBe(false);
      expect(invalidNameResult.error).toBeDefined();
      expect(invalidNameResult.error?.message).toContain('Name is required');

      // Test with invalid data - negative age
      const invalidAgeResult = await app.run({
        name: 'Alice',
        age: -5,
        email: 'alice@example.com',
      });

      expect(invalidAgeResult.isOk).toBe(false);
      expect(invalidAgeResult.error).toBeDefined();
      expect(invalidAgeResult.error?.message).toContain('Age must be positive');

      // Test with invalid data - wrong email format
      const invalidEmailResult = await app.run({
        name: 'Bob',
        age: 40,
        email: 'invalid-email',
      });

      expect(invalidEmailResult.isOk).toBe(false);
      expect(invalidEmailResult.error).toBeDefined();
      expect(invalidEmailResult.error?.message).toContain('Invalid email format');
    });

    test('should allow more complex parameters validations', async () => {
      // Define a more complex parameters with nested objects and arrays
      const orderparameters = z.object({
        orderId: z.string().uuid(),
        customer: z.object({
          id: z.number(),
          name: z.string(),
          isPremium: z.boolean().default(false),
        }),
        items: z
          .array(
            z.object({
              id: z.number(),
              name: z.string(),
              price: z.number().positive(),
              quantity: z.number().int().positive(),
            })
          )
          .min(1, 'Order must contain at least one item'),
        shippingAddress: z.object({
          street: z.string(),
          city: z.string(),
          zipCode: z.string(),
        }),
      });

      // Create a workflow with the complex parameters
      const workflow = createGraph()
        .addNode({
          name: 'validateOrder',
          execute: (input) => input,
          parameters: orderparameters,
        })
        .addNode({
          name: 'calculateTotal',
          execute: (order) => {
            const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

            // Apply discount for premium customers
            const discount = order.customer.isPremium ? 0.1 : 0;

            return {
              orderId: order.orderId,
              customerName: order.customer.name,
              subtotal,
              discount: subtotal * discount,
              total: subtotal * (1 - discount),
            };
          },
        })
        .edge('validateOrder', 'calculateTotal');

      const app = workflow.compile('validateOrder', 'calculateTotal');

      // Valid complex data
      const validOrder = {
        orderId: '123e4567-e89b-12d3-a456-426614174000',
        customer: {
          id: 123,
          name: 'Jane Doe',
          isPremium: true,
        },
        items: [
          { id: 1, name: 'Product A', price: 25.99, quantity: 2 },
          { id: 2, name: 'Product B', price: 10.5, quantity: 1 },
        ],
        shippingAddress: {
          street: '123 Main St',
          city: 'Anytown',
          zipCode: '12345',
        },
      };

      const validResult = await app.run(validOrder);
      expect(validResult.isOk).toBe(true);
      expect(validResult.output).toEqual({
        orderId: validOrder.orderId,
        customerName: 'Jane Doe',
        subtotal: 25.99 * 2 + 10.5,
        discount: (25.99 * 2 + 10.5) * 0.1,
        total: (25.99 * 2 + 10.5) * 0.9,
      });

      // Invalid - missing items
      const invalidOrder1 = {
        ...validOrder,
        items: [],
      };

      const invalidResult1 = await app.run(invalidOrder1);
      expect(invalidResult1.isOk).toBe(false);
      expect(invalidResult1.error?.message).toContain('Order must contain at least one item');

      // Invalid - negative price
      const invalidOrder2 = {
        ...validOrder,
        items: [{ id: 1, name: 'Product A', price: -25.99, quantity: 2 }],
      };

      const invalidResult2 = await app.run(invalidOrder2);
      expect(invalidResult2.isOk).toBe(false);
    });

    test('should validate input in hooks', async () => {
      // Define parameterss
      const numberparameters = z.number().positive();

      // Create main workflow with validated node
      const workflow = createGraph().addNode({
        name: 'main',
        execute: (input: number) => input * 2,
        parameters: numberparameters,
      });

      const app = workflow.compile('main');

      // Create a hook with validated node
      const hook = app.attachHook('main').addNode({
        name: 'hook',
        execute: (input: number) => `Result: ${input}`,
        parameters: numberparameters, // Same parameters as parent
      });

      const connector = hook.compile('hook');

      // Setup hook result tracking
      const lockUtil = createLock();
      const hookResults: any[] = [];
      const hookErrors: Error[] = [];

      connector.connect({
        onResult: (result) => {
          if (result.isOk) {
            hookResults.push(result.output);
          } else {
            hookErrors.push(result.error);
          }
          lockUtil.unlock();
        },
      });

      // Test with valid input for both main and hook
      await app.run(10);
      await lockUtil.wait();
      expect(hookResults).toEqual(['Result: 20']);

      // Test with invalid input (should fail at main node)
      const invalidResult = await app.run(-5);
      expect(invalidResult.isOk).toBe(false);

      // Hook shouldn't execute since main failed
      expect(hookResults.length).toBe(1);
    });
  });

  describe('Hooks', () => {
    test('should attach and execute hooks', async () => {
      // Create the main workflow
      const workflow = createGraph()
        .addNode(
          node({
            name: 'main',
            execute: (input: number) => input * 2,
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
            execute: (input: number) => input + 5,
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
            execute: (input: number) => input * 2,
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
            execute: (input: number) => input + 5,
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
            execute: (input: string) => input.toUpperCase(),
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
            execute: (input: string) => input.toLowerCase(),
          })
        )
        .addNode(
          node({
            name: 'hook2',
            execute: (input: string) => `transformed: ${input}`,
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
            execute: (input: UserData) => input,
          })
        )
        .addNode(
          node({
            name: 'validate',
            execute: (input: UserData) => {
              if (!input.name) throw new Error('Name is required');
              if (input.age < 0) throw new Error('Age must be positive');
              return input;
            },
          })
        )
        .addNode(
          node({
            name: 'processMajor',
            execute: (input: UserData) => `${input.name} is an adult (${input.age})`,
          })
        )
        .addNode(
          node({
            name: 'processMinor',
            execute: (input: UserData) => `${input.name} is a minor (${input.age})`,
          })
        )
        .addNode(
          node({
            name: 'output',
            execute: (input: string) => ({ message: input }),
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

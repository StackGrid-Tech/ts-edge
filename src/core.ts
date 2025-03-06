import { safe, SafeResult } from 'ts-safe';
import { randomId, withTimeout } from './shared';
import type {
  NodeEndEvent,
  NodeStartEvent,
  RunOptions,
  NodeContext,
  DefaultRegistry,
  GraphRegistry,
  GraphRunnable,
  HookRegistry,
  NodeHistory,
  GraphStartEvent,
  GraphEndEvent,
  GraphResult,
  GraphEvent,
  DefaultRunable,
  GraphStructure,
  HookRunable,
  Node,
  NodeRouter,
} from './interfaces';

type RegistryContext = Map<
  string,
  {
    execute: Function;
    edge?:
      | {
          type: 'direct';
          next: string;
        }
      | {
          type: 'dynamic';
          next: Function;
        };
  }
>;

const createRunnable = (context: RegistryContext): DefaultRunable & { publish: (event: any) => void } => {
  const eventHandlers: Array<(event: any) => any> = [];
  const hookMap: Map<string, Function[]> = new Map();
  const pubsup = {
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

  pubsup.subscribe((event: GraphEvent) => {
    if (event.eventType == 'NODE_END' && event.isOk) {
      const hooks = hookMap.get(event.node.name) ?? [];
      hooks.forEach(async (hook) => hook(event.node.output));
    }
  });

  const app: DefaultRunable & { publish: (event: any) => void } = {
    getStructure() {
      return Array.from(context.entries()).map(([name, item]) => ({
        name,
        edge: item.edge
          ? {
              name: item.edge.type == 'direct' ? item.edge.next : undefined,
              type: item.edge.type,
            }
          : undefined,
      })) as GraphStructure;
    },
    subscribe(handler) {
      pubsup.subscribe(handler);
    },
    unsubscribe(handler) {
      pubsup.unsubscribe(handler);
    },
    attachHook(entryPoint) {
      const observer = {
        subscribe: (hook) => hookMap.set(entryPoint, [...(hookMap.get(entryPoint) ?? []), hook]),
        unsubscribe: (hook) => {
          hookMap.set(
            entryPoint,
            [...(hookMap.get(entryPoint) ?? [])].filter((h) => h != hook)
          );
        },
      };
      return createHookRegistry(observer) as HookRegistry;
    },
    publish(e) {
      pubsup.publish(e);
    },
  };

  return app;
};

const createGraphRunnable = ({
  start,
  end,
  resigry,
}: {
  resigry: RegistryContext;
  start: string;
  end?: string;
}): GraphRunnable<never> => {
  const { publish, ...runable } = createRunnable(resigry);

  const runner: Omit<GraphRunnable, keyof DefaultRunable> = {
    run(input, options) {
      const opt: RunOptions = { timeout: 600000, maxNodeVisits: 100, ...(options as any) };
      const executionId = randomId();
      const startedAt = Date.now();

      const context: NodeContext = {
        histories: [],
        name: start,
        input: input,
        timestamp: Date.now(),
        next: {
          name: undefined,
          input: undefined,
        },
      };
      const nodeStart = () => {
        const now = Date.now();
        context.timestamp = now;
        publish({
          executionId,
          eventType: 'NODE_START',
          startedAt: now,
          node: { name: context.name, input: context.input },
        } as NodeStartEvent);
      };
      const process = () => {
        const input = context.input;
        const executor = resigry.get(context.name)!;
        return executor.execute(input);
      };
      const updateOutput = (output: any) => {
        context.output = output;
      };

      const findNextNode = () => {
        return safe()
          .map((): NodeContext['next'] | undefined => {
            const currentNode = resigry.get(context.name)!;
            if ((end != undefined && context.name == end) || currentNode.edge == undefined) return;

            if (currentNode.edge.type == 'direct') {
              return {
                input: context.output,
                name: currentNode.edge.next,
              };
            }
            const router = currentNode.edge.next;
            return router({ name: context.name, input: context.input, output: context.output });
          })
          .map((result) => {
            if (result == undefined) return {};
            if (typeof result == 'string') return { name: result, input: context.output };
            return { name: result.name, input: result.input };
          })
          .effect((next) => {
            if (next.name && !resigry.has(next.name))
              throw new Error(`Next node "${next.name}" not found in the graph`);
            context.next = next;
          })
          .unwrap();
      };

      const nodeEnd = (result: SafeResult) => {
        const history = {
          startedAt: context.timestamp,
          endedAt: Date.now(),
          error: result.error,
          node: {
            input: context.input,
            name: context.name,
            output: context.output,
          },
          isOk: result.isOk,
        } as NodeHistory;
        context.histories.push(history);
        publish({
          eventType: 'NODE_END',
          executionId,
          ...history,
        } as NodeEndEvent);
      };
      const runNode = () => {
        const chain = safe()
          .watch(nodeStart) // Emit node start event
          .map(process) // Process the node
          .effect(updateOutput) // Process the node
          .effect(findNextNode) // Determine next node
          .watch(nodeEnd) // Emit node end event
          .map((output) => {
            // If there's a next node, update context and continue execution
            if (!context.next?.name) return output;
            context.name = context.next.name;
            context.input = context.next.input;
            context.output = undefined;
            context.next = {};
            if (--opt.maxNodeVisits <= 0) throw new Error('Execution aborted: Maximum node visit count exceeded');
            return runNode().unwrap(); // Recursively execute the next node
          });
        return chain;
      };

      const emitGraphStartMessage = () => {
        publish({
          eventType: 'WORKFLOW_START',
          executionId,
          startedAt,
          input: input,
        } as GraphStartEvent);
      };

      const emitGraphEndMessage = (result: SafeResult) => {
        publish({
          eventType: 'WORKFLOW_END',
          executionId,
          startedAt,
          endedAt: Date.now(),
          histories: context.histories,
          isOk: result.isOk,
          error: result.error,
          output: result.value,
        } as GraphEndEvent);
      };

      const toResult = (isOk: boolean, output: unknown) => {
        return {
          startedAt,
          endedAt: Date.now(),
          histories: context.histories,
          error: isOk ? undefined : output,
          output: isOk ? output : undefined,
          isOk,
        } as GraphResult<never, never>;
      };

      return safe()
        .map(
          () =>
            withTimeout(
              safe(Promise.resolve())
                .watch(emitGraphStartMessage)
                .flatMap(runNode)
                .watch(emitGraphEndMessage)
                .unwrap() as never,
              Math.max(0, opt.timeout)
            ) as Promise<never>
        )
        .map((output) => toResult(true, output))
        .catch((error) => toResult(false, error))
        .unwrap();
    },
  };

  return Object.assign(runable, runner);
};

const createRegistry = (context: RegistryContext = new Map()): DefaultRegistry => {
  const registry: DefaultRegistry = {
    addNode(node) {
      if (context.has(node.name)) {
        throw new Error(`Node with name "${node.name}" already exists in the graph`);
      }
      const execute = node.parameters ? (input) => node.execute(node.parameters!.parse(input)) : node.execute;
      context.set(node.name, {
        execute,
      });
      return registry;
    },
    edge(from, to) {
      const node = context.get(from);
      if (!node) {
        throw new Error(`Node "${from}" not Define`);
      }
      if (node.edge) {
        throw new Error(`Node "${from}" already has an outgoing connection`);
      }
      node.edge = {
        type: 'direct',
        next: to,
      };
      return registry;
    },
    dynamicEdge(from, router) {
      const node = context.get(from);
      if (!node) {
        throw new Error(`Node "${from}" not Define`);
      }
      if (node.edge) {
        throw new Error(`Node "${from}" already has an outgoing connection`);
      }
      node.edge = {
        type: 'dynamic',
        next: router,
      };
      return registry;
    },
  };
  return registry;
};

const createHookRegistry = (observer: { subscribe: Function; unsubscribe: Function }): HookRegistry => {
  const context: RegistryContext = new Map();
  const registry = createRegistry(context);

  const hook: Omit<HookRegistry, keyof DefaultRegistry> = {
    compile(start, end) {
      const { run, ...rest } = createGraphRunnable({ start, end, resigry: context });
      let handler: Function | undefined;
      return Object.assign(rest, {
        connect(options) {
          handler = (output) => {
            run(output as never, {
              maxNodeVisits: options?.maxNodeVisits,
              timeout: options?.timeout,
            }).then(options?.onResult);
          };
          observer.subscribe(handler);
        },
        disconnect() {
          if (handler) observer.unsubscribe(handler);
          handler = undefined;
        },
      } as Omit<HookRunable, keyof DefaultRunable>);
    },
  };

  return Object.assign(registry, hook);
};

export const createGraph = (): GraphRegistry => {
  const context: RegistryContext = new Map();

  const registry = createRegistry(context);

  const workflow: Omit<GraphRegistry, keyof DefaultRegistry> = {
    compile(start, end) {
      return createGraphRunnable({
        start,
        end,
        resigry: context,
      });
    },
  };
  return Object.assign(registry, workflow);
};

export const node = <Name extends string = string, Input = any, Output = any>(node: {
  name: Name;
  execute: (input: Input) => Output;
}) => {
  return node;
};

export namespace node {
  export type infer<T extends ReturnType<typeof node>> = T extends {
    name: infer N;
    execute: (input: infer I) => infer O;
  }
    ? { name: N; input: I; output: O extends PromiseLike<any> ? Awaited<O> : O }
    : never;
}

/**
 * A flexible type definition for node router functions.
 * This type is used to bypass the strict type constraints of router functions.
 * It intentionally applies a loose type to balance between type safety and ease of use.
 *
 * @remarks
 * The actual type checking is performed when the `dynamicEdge` method is called.
 * Therefore, even though the type is loosened here, appropriate type checking
 * still occurs at the point of usage.
 */
export type FlexibleRouterType = any;

export const nodeRouter = (router: NodeRouter<Node, string, string>) => router as FlexibleRouterType;

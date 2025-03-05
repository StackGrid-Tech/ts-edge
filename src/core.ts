import { safe, SafeResult } from 'ts-safe';
import { randomId, withTimeout } from './shared';
import type {
  NodeEndEvent,
  NodeStartEvent,
  RunOptions,
  NodeContext,
  DefaultRegistry,
  GraphRegistry,
  GraphRunner,
  HookRegistry,
  NodeHistory,
  GraphStartEvent,
  GraphEndEvent,
  GraphResult,
  GraphEvent,
} from './interfaces';
import { ZodType } from 'zod';

type RegistryContext = {
  nodes: Map<string, Function>;
  routes: Map<string, Function>;
  edges: Map<string, string>;
  parameters: Map<string, ZodType>;
};

const createGraphRunner = ({
  start,
  end,
  edges,
  nodes,
  routes,
  parameters,
}: RegistryContext & { start: string; end?: string }): GraphRunner<never> => {
  const eventHandlers: Array<(event: any) => any> = [];
  const hookMap: Map<string, Function[]> = new Map();
  const pubsup = {
    subscribe(handler) {
      eventHandlers.push(handler);
    },
    unsubscribe(handler) {
      const index = eventHandlers.findIndex((v) => v === handler);
      if (index !== -1) eventHandlers.splice(index, 1);
    },
    publish(event: GraphEvent) {
      // Using async to run each handler independently
      // This ensures that errors in one handler won't affect the execution of others
      eventHandlers.forEach(async (handler) => handler(event));
    },
  };

  pubsup.subscribe((event: GraphEvent) => {
    if (event.eventType == 'NODE_END' && event.isOk) {
      const hooks = hookMap.get(event.node.name) ?? [];
      hooks.forEach(async (hook) => hook(event.node.output));
    }
  });

  const app: GraphRunner = {
    getStructure() {
      return {
        edges: new Map(edges),
        nodes: new Map(nodes),
        routes: new Map(routes),
      };
    },
    run(input, options) {
      const opt: RunOptions = { timeout: 600000, maxNodeVisits: 100, ...(options as any) };
      if (!nodes.has(start as string)) {
        throw new Error(`Start node "${start}" not found in the graph`);
      }

      const executionId = randomId();
      const startedAt = Date.now();

      const context: NodeContext = {
        histories: [],
        node: {
          name: start,
          input: input,
        },
        timestamp: Date.now(),
        next: {
          name: undefined,
          input: undefined,
        },
      };
      const nodeStart = () => {
        const now = Date.now();
        context.timestamp = now;
        pubsup.publish({
          executionId,
          eventType: 'NODE_START',
          startedAt: now,
          node: { ...context.node },
        } as NodeStartEvent);
      };
      const process = () => {
        const input = context.node.input;
        const valid = parameters.get(context.node.name);
        const process = nodes.get(context.node.name)!;
        if (valid) valid.parse(input);
        return process(input);
      };

      const updateOutput = (output: any) => {
        context.node.output = output;
      };

      const findNextNode = () => {
        return safe(context.node)
          .map((node): { name?: string; input: any } => {
            const next = { name: end as string | undefined, input: node.output };
            if (end === node.name) {
              next.name = undefined;
            } else if (edges.has(node.name)) {
              next.name = edges.get(node.name)!;
            } else if (routes.has(node.name)) {
              const router = routes.get(node.name)!;
              return safe()
                .map(() => router(node))
                .map((v) => {
                  if (v?.name) return v;
                  if (typeof v == 'string') return { name: v, input: node.output! };
                  return {};
                })
                .unwrap();
            }
            return next;
          })
          .effect((next) => {
            // Verify the next node exists if specified
            if (next.name && !nodes.has(next.name)) {
              throw new Error(`Next node "${next.name}" not found in the graph`);
            }
            context.next = next;
          })
          .unwrap();
      };

      const nodeEnd = (result: SafeResult) => {
        const history = {
          startedAt: context.timestamp,
          endedAt: Date.now(),
          error: result.error,
          nextNode: context.next,
          isOk: result.isOk,
          node: { ...context.node },
        } as NodeHistory;

        context.histories.push(history);
        pubsup.publish({
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
            if (!context.next.name) return output;
            context.node.name = context.next.name;
            context.node.input = context.next.input;
            context.node.output = undefined;
            context.next = {};
            if (--opt.maxNodeVisits <= 0) throw new Error('Execution aborted: Maximum node visit count exceeded');
            return runNode().unwrap(); // Recursively execute the next node
          });
        return chain;
      };

      const emitGraphStartMessage = () => {
        pubsup.publish({
          eventType: 'WORKFLOW_START',
          executionId,
          startedAt,
          input: input,
        } as GraphStartEvent);
      };

      const emitGraphEndMessage = (result: SafeResult) => {
        pubsup.publish({
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
  };

  return app;
};

const createRegistry = (context: RegistryContext): DefaultRegistry => {
  const { nodes, routes, edges, parameters } = context;

  const registry: DefaultRegistry = {
    addNode(node) {
      if (nodes.has(node.name)) {
        throw new Error(`Node with name "${node.name}" already exists in the graph`);
      }
      if (node.parameters) parameters.set(node.name, node.parameters);
      nodes.set(node.name, node.execute);
      return registry;
    },
    edge(from, to) {
      if (edges.has(from) || routes.has(from)) {
        throw new Error(`Node "${from}" already has an outgoing connection`);
      }
      edges.set(from, to);
      return registry;
    },
    dynamicEdge(from, router) {
      if (edges.has(from) || routes.has(from)) {
        throw new Error(`Node "${from}" already has an outgoing connection`);
      }
      routes.set(from, router);
      return registry;
    },
  };
  return registry;
};

const createHookRegistry = (observer: { subscribe: Function; unsubscribe: Function }): HookRegistry => {
  const nodes: Map<string, Function> = new Map();
  const routes: Map<string, Function> = new Map();
  const edges: Map<string, string> = new Map();
  const parameters: Map<string, ZodType> = new Map();

  const registry = createRegistry({
    nodes,
    routes,
    edges,
    parameters,
  });
  const hook: Omit<HookRegistry, keyof DefaultRegistry> = {
    compile(startNode, endNode) {
      const executor = createGraphRunner({ start: startNode, end: endNode, edges, nodes, routes, parameters });
      let handler: Function | undefined;
      return {
        subscribe: executor.subscribe,
        unsubscribe: executor.unsubscribe,
        getStructure: executor.getStructure,
        attachHook: executor.attachHook,
        connect(options) {
          handler = (output) => {
            executor
              .run(output as never, {
                maxNodeVisits: options?.maxNodeVisits,
                timeout: options?.timeout,
              })
              .then(options?.onResult);
          };
          observer.subscribe(handler);
        },
        disconnect() {
          if (handler) observer.unsubscribe(handler);
          handler = undefined;
        },
      };
    },
  };

  return Object.assign(registry, hook);
};

export const createGraph = (): GraphRegistry => {
  const nodes: Map<string, Function> = new Map();
  const routes: Map<string, Function> = new Map();
  const edges: Map<string, string> = new Map();
  const parameters: Map<string, ZodType> = new Map();

  const registry = createRegistry({
    nodes,
    routes,
    edges,
    parameters,
  });
  const workflow: Omit<GraphRegistry, keyof DefaultRegistry> = {
    compile(start, end) {
      return createGraphRunner({
        start,
        end,
        edges: new Map(edges),
        nodes: new Map(nodes),
        routes: new Map(routes),
        parameters: new Map(parameters),
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

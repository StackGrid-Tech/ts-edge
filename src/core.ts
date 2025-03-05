import { safe, SafeResult } from 'ts-safe';
import { randomId, withTimeout } from './shared';
import type {
  NodeEndEvent,
  NodeStartEvent,
  RunOptions,
  NodeContext,
  DefaultRegistry,
  GraphRegistry,
  GraphRunable,
  HookRegistry,
  NodeHistory,
  GraphStartEvent,
  GraphEndEvent,
  GraphResult,
  GraphEvent,
  Node,
  NodeRouter,
  NodeType,
} from './interfaces';

type RegistryContext = {
  nodes: Map<
    string,
    {
      type: 'router' | 'executor';
      execute: Function;
    }
  >;
  edges: Map<string, string>;
};

const createGraphRunable = ({
  start,
  end,
  edges,
  nodes,
}: RegistryContext & { start: string; end?: string }): GraphRunable<never> => {
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

  const app: GraphRunable = {
    getStructure() {
      return {
        nodes: Array.from(nodes.entries()).reduce(
          (prev, [name, { type }]) => Object.assign(prev, { [name]: type }),
          {} as Record<string, NodeType>
        ),
        edges: Array.from(edges.entries()).reduce(
          (prev, [from, to]) => Object.assign(prev, { [from]: to }),
          {} as Record<string, string>
        ),
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
        type: 'executor',
        node: {
          name: start,
          input: input,
        },
        timestamp: Date.now(),
      };

      const nodeStart = () => {
        const now = Date.now();
        context.type = nodes.get(context.node.name)!.type;
        context.timestamp = now;
        pubsup.publish({
          executionId,
          eventType: 'NODE_START',
          startedAt: now,
          node: { ...context.node },
          type: context.type,
        } as NodeStartEvent);
      };
      const process = () => {
        const input = context.node.input;
        const node = nodes.get(context.node.name)!;
        return node.execute(input);
      };

      const updateOutput = (output: any) => {
        context.node.output = output;
      };

      const findNextNode = () => {
        let next: string | undefined = undefined;
        if (end != undefined && end === context.node.name) {
          next = undefined;
        } else if (context.type == 'router') {
          next = !context.node.output
            ? undefined
            : typeof context.node.output == 'string'
              ? context.node.output
              : context.node.output.name;
        } else {
          next = edges.get(context.node.name);
        }

        if (next != undefined && !nodes.has(next)) {
          throw new Error(`Next node "${next}" not found in the graph`);
        }

        if (context.type == 'router' && nodes.get(next!)?.type == 'router')
          throw new Error('Can Not Router Node To Router Node');

        context.next = next;
      };

      const nodeEnd = (result: SafeResult) => {
        const history = {
          startedAt: context.timestamp,
          endedAt: Date.now(),
          error: result.error,
          type: context.type,
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
            if (!context.next) return output;
            const nextNode = nodes.get(context.next)!;
            if (nextNode.type == 'router') {
              context.node.input = { ...context.node };
            } else if (context.type == 'router') {
              context.node.input = !context.node.output
                ? undefined
                : typeof context.node.output == 'string'
                  ? context.node.input.output
                  : { ...context.node.output.input };
            } else {
              context.node.input = context.node.output;
            }

            context.node.name = context.next;
            context.node.output = undefined;
            context.next = undefined;
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
      return createHook(observer) as HookRegistry;
    },
  };

  return app;
};

const createRegistry = ({ edges = new Map(), nodes = new Map() }: RegistryContext): DefaultRegistry => {
  const registry: DefaultRegistry = {
    addNode(node) {
      if (!node.name) throw new Error('Node Name Can Not Be Null');
      if (nodes.has(node.name)) {
        throw new Error(`Node with name "${node.name}" already exists in the graph`);
      }
      nodes.set(node.name, {
        execute: (value: unknown) => {
          let input = value;
          if (node.parameters) {
            input = node.parameters.parse(value);
          }
          return node.execute(input);
        },
        type: 'executor',
      });
      return registry;
    },
    addRouterNode(routerNode) {
      if (!routerNode.name) throw new Error('Node Name Can Not Be Null');
      if (nodes.has(routerNode.name)) {
        throw new Error(`Node with name "${routerNode.name}" already exists in the graph`);
      }
      nodes.set(routerNode.name, {
        execute: routerNode.router,
        type: 'router',
      });
      return registry;
    },
    edge(from, to) {
      if (edges.has(from)) {
        throw new Error(`Node "${from}" already has an outgoing connection`);
      }
      edges.set(from, to!);
      return registry;
    },
  };
  return registry;
};

const createHook = (observer: { subscribe: Function; unsubscribe: Function }): HookRegistry => {
  const nodes: RegistryContext['nodes'] = new Map();
  const edges: RegistryContext['edges'] = new Map();

  const registry = createRegistry({
    nodes,
    edges,
  });
  const hook: Omit<HookRegistry, keyof DefaultRegistry> = {
    compile(startNode, endNode) {
      const executor = createGraphRunable({ start: startNode, end: endNode, edges, nodes });
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
  const nodes: RegistryContext['nodes'] = new Map();
  const edges: RegistryContext['edges'] = new Map();

  const registry = createRegistry({
    nodes,
    edges,
  });
  const workflow: Omit<GraphRegistry, keyof DefaultRegistry> = {
    compile(start, end) {
      return createGraphRunable({
        start,
        end,
        edges: new Map(edges),
        nodes: new Map(nodes),
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

export const routerNode = <
  Name extends string = string,
  AllNode extends Node = Node<string, any, any>,
  FromNodeName extends AllNode['name'] = string,
  ToNodeName extends AllNode['name'] = string,
>(router: {
  name: Name;
  router: NodeRouter<AllNode, FromNodeName, ToNodeName>;
}) => {
  return router;
};

import { safe, SafeResult } from 'ts-safe';
import { randomId, withTimeout } from './shared';
import type {
  NodeEndEvent,
  NodeStartEvent,
  RunOptions,
  NodeContext,
  DefaultRegistry,
  WorkFlowRegistry,
  WorkFlowExecutor,
  WorkFlowStructure,
  HookRegistry,
  WorkFlowEvent,
  Node,
  NodeHistory,
  WorkFlowStartEvent,
  WorkFlowEndEvent,
  WorkFlowResult,
} from './interfaces';

type RegistryContext = {
  nodes: Map<string, Function>;
  routes: Map<string, Function>;
  edges: Map<string, string>;
};

const createWorkflowExecutor = ({
  start,
  end,
  edges,
  nodes,
  routes,
}: WorkFlowStructure & { start: string; end?: string }): WorkFlowExecutor<never> => {
  const eventHandlers: Array<(event: any) => any> = [];
  const app = {
    subscribe(handler) {
      eventHandlers.push(handler);
    },
    unsubscribe(handler) {
      const index = eventHandlers.findIndex((v) => v === handler);
      if (index !== -1) eventHandlers.splice(index, 1);
    },
    getStructure() {
      return {
        edges: new Map(edges),
        nodes: new Map(nodes),
        routes: new Map(routes),
      };
    },
    run(input, options) {
      const opt: RunOptions = { timeout: 600000, maxNodeVisits: 100, ...(options as any) };
      const emit = (event: any) => eventHandlers.forEach((handler) => handler(event));
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
        emit({
          executionId,
          eventType: 'NODE_START',
          startedAt: now,
          node: { ...context.node },
        } as NodeStartEvent);
      };
      const process = () => {
        return nodes.get(context.node.name)!(context.node.input);
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
        emit({
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
            if (opt.maxNodeVisits-- <= 0) throw new Error('Execution aborted: Maximum node visit count exceeded');
            return runNode().unwrap(); // Recursively execute the next node
          });
        return chain;
      };

      const emitGraphStartMessage = () => {
        emit({
          eventType: 'WORKFLOW_START',
          executionId,
          startedAt,
          input: input,
        } as WorkFlowStartEvent);
      };

      const emitGraphEndMessage = (result: SafeResult) => {
        emit({
          eventType: 'WORKFLOW_END',
          executionId,
          startedAt,
          endedAt: Date.now(),
          histories: context.histories,
          isOk: result.isOk,
          error: result.error,
          output: result.value,
        } as WorkFlowEndEvent);
      };

      const toResult = (isOk: boolean, output: unknown) => {
        return {
          startedAt,
          endedAt: Date.now(),
          histories: context.histories,
          error: isOk ? undefined : output,
          output: isOk ? output : undefined,
          isOk,
        } as WorkFlowResult<never, never>;
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
    attachHook(entryPoint) {
      const createConnect = (emit: Function) => {
        const handler = (event: WorkFlowEvent) => {
          if (event.eventType == 'NODE_END' && (event.node as Node).name == entryPoint) emit(event.node.output!);
        };
        return {
          connect: () => app.subscribe(handler),
          disconect: () => app.unsubscribe(handler),
        };
      };
      return createHookRegistry(createConnect) as HookRegistry;
    },
  };

  return app;
};

const createRegistry = (context: RegistryContext): DefaultRegistry => {
  const { nodes, routes, edges } = context;

  const registry: DefaultRegistry = {
    addNode(node) {
      if (nodes.has(node.name)) {
        throw new Error(`Node with name "${node.name}" already exists in the graph`);
      }
      nodes.set(node.name, node.processor);
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

const createHookRegistry = (
  connector: (emit: Function) => { connect: Function; disconect: Function }
): HookRegistry => {
  const nodes: Map<string, Function> = new Map();
  const routes: Map<string, Function> = new Map();
  const edges: Map<string, string> = new Map();

  const registry = createRegistry({
    nodes,
    routes,
    edges,
  });
  const hook: Omit<HookRegistry, keyof DefaultRegistry> = {
    compile(startNode, endNode) {
      const executor = createWorkflowExecutor({ start: startNode, end: endNode, edges, nodes, routes });

      const {} = connector(executor.run);
      return {
        subscribe: executor.subscribe,
        unsubscribe: executor.unsubscribe,
        getStructure: executor.getStructure,
        attachHook: executor.attachHook,
        connect(consumer, options) {},
        disconnect() {},
      };
    },
  };

  return Object.assign(registry, hook);
};

export const createWorkflow = (): WorkFlowRegistry => {
  const nodes: Map<string, Function> = new Map();
  const routes: Map<string, Function> = new Map();
  const edges: Map<string, string> = new Map();

  const registry = createRegistry({
    nodes,
    routes,
    edges,
  });

  const workflow: Omit<WorkFlowRegistry, keyof DefaultRegistry> = {
    compile(start, end) {
      return createWorkflowExecutor({
        start,
        end,
        edges: new Map(edges),
        nodes: new Map(nodes),
        routes: new Map(routes),
      });
    },
  };
  return Object.assign(registry, workflow);
};

export const node = <Name extends string = string, Input = any, Output = any>(node: {
  name: Name;
  processor: (input: Input) => Output;
}) => {
  return node;
};

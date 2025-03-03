import { safe, SafeResult } from 'ts-safe';
import { randomId, withTimeout } from './shared';
import type {
  GraphEndEvent,
  GraphExecutor,
  GraphStartEvent,
  GraphStructure,
  NodeEndEvent,
  NodeStartEvent,
  RunOptions,
  Graph,
  NodeContext,
  History,
} from './interfaces';

const graphExecutor = ({
  start,
  end,
  edges,
  nodes,
  routes,
}: GraphStructure & { start: string; end?: string }): GraphExecutor<never> => {
  const eventHandlers: Array<(event: any) => any> = [];
  return {
    addEventListener(handler) {
      eventHandlers.push(handler);
    },
    removeEventListener(handler) {
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
        } as History;

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
          eventType: 'GRAPH_START',
          executionId,
          startedAt,
          input: input,
        } as GraphStartEvent);
      };

      const emitGraphEndMessage = (result: SafeResult) => {
        emit({
          eventType: 'GRAPH_END',
          executionId,
          startedAt,
          endedAt: Date.now(),
          histories: context.histories,
          isOk: result.isOk,
          error: result.error,
          output: result.value,
        } as GraphEndEvent);
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
        .unwrap();
    },
  };
};

export const node = <Name extends string = string, Input = any, Output = any>(node: {
  name: Name;
  processor: (input: Input) => Output;
}) => {
  return node;
};

export const createGraph = (): Graph => {
  const nodes: Map<string, Function> = new Map();
  const routes: Map<string, Function> = new Map();
  const edges: Map<string, string> = new Map();

  const graph: Graph = {
    addNode(node) {
      if (nodes.has(node.name)) {
        throw new Error(`Node with name "${node.name}" already exists in the graph`);
      }
      nodes.set(node.name, node.processor);
      return graph;
    },
    edge(from, to) {
      if (edges.has(from) || routes.has(from)) {
        throw new Error(`Node "${from}" already has an outgoing connection`);
      }
      edges.set(from, to);
      return graph;
    },
    dynamicEdge(from, router) {
      if (edges.has(from) || routes.has(from)) {
        throw new Error(`Node "${from}" already has an outgoing connection`);
      }
      routes.set(from, router);
      return graph;
    },
    compile(start, end) {
      return graphExecutor({
        start,
        end,
        edges: new Map(edges),
        nodes: new Map(nodes),
        routes: new Map(routes),
      });
    },
  };
  return graph;
};

export type { Graph, History };

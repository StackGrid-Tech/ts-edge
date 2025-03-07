import { safe, SafeResult } from 'ts-safe';
import { createPubSub, randomId, withTimeout } from './shared';
import type {
  GraphNodeEndEvent,
  GraphNodeStartEvent,
  RunOptions,
  GraphRegistry,
  GraphRunnable,
  GraphStartEvent,
  GraphEndEvent,
  GraphResult,
  GraphStructure,
  GraphNodeRouter,
  GraphNodeHistory,
  GraphNode,
} from './interfaces';

type NodeContext = {
  execute: Function;
  edge?:
    | {
        type: 'direct';
        next: string[];
      }
    | {
        type: 'dynamic';
        next: Function;
      };
} & ({ isMergeNode: true; sources: string[] } | { isMergeNode: false; sources?: string[] });

type RegistryContext = Map<string, NodeContext>;
interface RunnerContext {
  executionId: string;
  end?: string;
  name: string;
  node: NodeContext;
  mergeTarget?: string;
  addHistory: (history: GraphNodeHistory) => void;
  publishEvent: (event: GraphNodeStartEvent | GraphNodeEndEvent) => void;
}

const createRunner =
  ({ executionId, name, node, end, addHistory, publishEvent }: RunnerContext) =>
  async (input: any) => {
    const startedAt = Date.now();
    return safe(node)
      .watch(
        publishEvent.bind(null, {
          executionId,
          eventType: 'NODE_START',
          startedAt,
          node: { name, input },
        } as GraphNodeStartEvent)
      )
      .effect((node) => {
        if (!node) throw new Error(`Not Found Node "${name}"`);
      })
      .map((node) => node.execute(input))
      .map(async (output): Promise<{ name: string[]; output: any }> => {
        if ((end != undefined && name == end) || !node.edge) return { name: [], output };
        if (node.edge.type == 'direct') {
          return {
            output,
            name: node.edge.next,
          };
        }
        const router = node.edge.next;
        const next = await router(output);
        if (next == undefined) return { name: [], output };

        if (typeof next == 'string') return { name: [next], output };

        return { name: next.name, output };
      })
      .watch((result) => {
        const history = {
          startedAt,
          endedAt: Date.now(),
          error: result.error,
          node: {
            input,
            name: name,
            output: result.value?.output,
          },
          isOk: result.isOk,
        } as GraphNodeHistory;
        addHistory(history);
        publishEvent({
          eventType: 'NODE_END',
          executionId,
          ...history,
        } as GraphNodeEndEvent);
      })
      .unwrap();
  };

const createGraphRunnable = ({
  start,
  end,
  registry,
}: {
  registry: RegistryContext;
  start: string;
  end?: string;
}): GraphRunnable<never> => {
  const { publish, subscribe, unsubscribe } = createPubSub();

  return {
    subscribe,
    unsubscribe,
    getStructure() {
      return Array.from(registry.entries()).map(([name, item]) => ({
        name,
        edge: item.edge
          ? {
              name: item.edge.type == 'direct' ? item.edge.next : undefined,
              type: item.edge.type,
            }
          : undefined,
      })) as GraphStructure;
    },
    async run(input, options) {
      const opt: RunOptions = { timeout: 600000, maxNodeVisits: 100, ...(options as any) };
      const executionId = randomId();
      const startedAt = Date.now();
      const mergeTargetByNode = Array.from(registry.entries()).reduce(
        (prev, [name, context]) => {
          if (context.sources) {
            context.sources.forEach((brachNodeName) => {
              prev[brachNodeName] = name;
            });
          }
          return prev;
        },
        {} as Record<string, string>
      );

      const histories: GraphNodeHistory[] = [];

      const addHistory = (h) => {
        histories.push(h);
      };

      const runNode = async (name: string, input: any) => {
        if (opt.maxNodeVisits-- <= 0) throw new Error(`Maximum node visits exceeded`);
        const nodeContext = registry.get(name);

        const runner = createRunner({
          executionId,
          addHistory,
          name,
          end,
          node: nodeContext!,
          mergeTarget: mergeTargetByNode[name],
          publishEvent: publish,
        });

        const { name: nextNodes, output } = await runner(input);

        if (nextNodes?.length) {
          if (nextNodes.length === 1) {
            return runNode(nextNodes[0], output);
          } else {
            // 병렬 실행
            await Promise.all(nextNodes.map((nextName) => runNode(nextName, output)));
            return output;
          }
        }

        return output;
      };

      const emitGraphStartMessage = () => {
        publish({
          eventType: 'WORKFLOW_START',
          executionId,
          startedAt,
          input,
        } as GraphStartEvent);
      };

      const emitGraphEndMessage = (result: SafeResult) => {
        publish({
          eventType: 'WORKFLOW_END',
          executionId,
          startedAt,
          endedAt: Date.now(),
          histories,
          isOk: result.isOk,
          error: result.error,
          output: result.value,
        } as GraphEndEvent);
      };

      const toResult = (isOk: boolean) => (output: unknown) => {
        return {
          startedAt,
          endedAt: Date.now(),
          histories,
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
                .map(runNode.bind(null, start, input))
                .watch(emitGraphEndMessage)
                .unwrap() as never,
              Math.max(0, opt.timeout)
            ) as Promise<never>
        )
        .map(toResult(true))
        .catch(toResult(false))
        .unwrap();
    },
  };
};

export const createGraph = (): GraphRegistry => {
  const context: RegistryContext = new Map();

  const registry: GraphRegistry = {
    addNode(node) {
      if (context.has(node.name)) {
        throw new Error(`Node with name "${node.name}" already exists in the graph`);
      }
      context.set(node.name, {
        execute: node.execute,
        isMergeNode: false,
      });
      return registry;
    },
    addMergeNode(node) {
      if (context.has(node.name)) {
        throw new Error(`Node with name "${node.name}" already exists in the graph`);
      }
      context.set(node.name, {
        execute: node.execute,
        isMergeNode: true,
        sources: node.sources,
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
        next: [to].flat() as string[],
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
    compile(start, end) {
      return createGraphRunnable({
        start,
        end,
        registry: context,
      });
    },
  };
  return registry;
};

export const graphNode = <Name extends string = string, Input = any, Output = any>(node: {
  name: Name;
  execute: (input: Input) => Output;
}) => {
  return node;
};

export namespace graphNode {
  export type infer<T extends ReturnType<typeof graphNode>> = T extends {
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

export const graphNodeRouter = (router: GraphNodeRouter<GraphNode, string, string>) => router as FlexibleRouterType;

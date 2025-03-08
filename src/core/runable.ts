import { safe, SafeResult } from 'ts-safe';
import {
  GraphEndEvent,
  GraphNodeHistory,
  GraphResult,
  GraphRunnable,
  GraphStartEvent,
  GraphStructure,
  RunOptions,
  GraphRegistryContext,
} from '../interfaces';
import { createPubSub, randomId, withTimeout } from '../shared';
import { createNodeExecutor } from './node-executor';
import { createThreadPool } from './thread-pool';

export const createGraphRunnable = ({
  start,
  end,
  registry,
}: {
  registry: GraphRegistryContext;
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
      const sourceToMergeNodeMap = Array.from(registry.entries()).reduce(
        (prev, [name, context]) => {
          context.sources?.forEach((branchNodeName) => {
            prev[branchNodeName] = name;
          });
          return prev;
        },
        {} as Record<string, string>
      );

      const histories: GraphNodeHistory[] = [];

      const recordExecution = (h) => {
        histories.push(h);
      };

      const processMergeNode = (nodeName: string, sourceNodeName: string, output: any) => {
        const status = mergeNodeStatus.get(nodeName)!;
        const sourceNode = status.find((v) => v.source === sourceNodeName)!;
        sourceNode.pending = false;
        sourceNode.output = output;

        if (status.some((v) => v.pending)) return null;

        const mergeInput = status.reduce((prev, v) => {
          prev[v.source] = v.output;
          return prev;
        }, {});

        return mergeInput;
      };

      const mergeNodeStatus = Array.from(registry.entries()).reduce(
        (prev, [name, context]) => {
          if (context.isMergeNode) {
            prev.set(
              name,
              context.sources.map((branchNodeName) => ({
                source: branchNodeName,
                output: undefined,
                pending: true,
              }))
            );
          }
          return prev;
        },
        new Map() as Map<
          string,
          Array<{
            source: string;
            output: any;
            pending: boolean;
          }>
        >
      );

      const threadPool = createThreadPool();

      const executeNode = (threadId: string, name: string, input: any) => {
        threadPool.scheduleTask(threadId, async () => {
          const nodeContext = registry.get(name);

          const execute = createNodeExecutor({
            executionId,
            name,
            end,
            baseBranch: sourceToMergeNodeMap[name],
            node: nodeContext!,
            recordExecution,
            publishEvent: publish,
          });

          if (opt.maxNodeVisits-- <= 0) throw new Error(`Maximum node visits exceeded`);
          const { name: nextNodes, output } = await execute(input);

          const threadIds = [Array.from({ length: nextNodes.length }).map(randomId), threadId].flat();

          const getThreadId = () => threadIds.pop()!;

          nextNodes.forEach(async (nextName) => {
            if (!mergeNodeStatus.has(nextName)) {
              return executeNode(getThreadId(), nextName, output);
            }

            const mergeInput = processMergeNode(nextName, name, output);
            if (mergeInput) {
              return executeNode(getThreadId(), nextName, mergeInput);
            }
          });

          return output;
        });
      };

      const emitGraphStartEvent = () => {
        publish({
          eventType: 'WORKFLOW_START',
          executionId,
          startedAt,
          input,
        } as GraphStartEvent);
      };

      const emitGraphEndEvent = (result: SafeResult) => {
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
              safe()
                .watch(emitGraphStartEvent)
                .map(executeNode.bind(null, randomId(), start, input))
                .map(threadPool.waitForCompletion)
                .watch(emitGraphEndEvent)
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

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
import { GraphExecutionError } from './error';

/**
 * Creates a runnable graph from a registry configuration
 */
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

    /**
     * Returns the structure of the graph for visualization
     */
    getStructure() {
      return Array.from(registry.entries()).map(([name, item]) => ({
        name,
        edge: item.edge
          ? {
              name: item.edge.type === 'direct' ? item.edge.next : undefined,
              type: item.edge.type,
            }
          : undefined,
      })) as GraphStructure;
    },

    /**
     * Executes the graph with the provided input
     */
    async run(input, options) {
      const opt: RunOptions = { timeout: 600000, maxNodeVisits: 100, ...(options as any) };
      const executionId = randomId();
      const startedAt = Date.now();

      // Map from source nodes to their target merge nodes
      const sourceToMergeNodeMap = Array.from(registry.entries()).reduce(
        (prev, [name, context]) => {
          context.sources?.forEach((branchNodeName) => {
            prev[branchNodeName] = name;
          });
          return prev;
        },
        {} as Record<string, string>
      );

      // History of node executions
      const histories: GraphNodeHistory[] = [];

      const recordExecution = (history: GraphNodeHistory) => {
        histories.push(history);
      };

      /**
       * Updates merge node status when a source node completes
       * and returns the combined inputs if all sources are ready
       */
      const processMergeNode = (nodeName: string, sourceNodeName: string, output: any) => {
        const status = mergeNodeStatus.get(nodeName)!;
        const sourceNode = status.find((v) => v.source === sourceNodeName)!;
        sourceNode.pending = false;
        sourceNode.output = output;

        // If any source is still pending, wait for it
        if (status.some((v) => v.pending)) return null;

        // Combine all source outputs into a single input object
        const mergeInput = status.reduce((prev, v) => {
          prev[v.source] = v.output;
          return prev;
        }, {});

        return mergeInput;
      };

      // Initialize status tracking for merge nodes
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

      /**
       * Schedules a node for execution in the thread pool
       */
      const scheduleNodeExecution = (threadId: string, name: string, input: any) => {
        threadPool.scheduleTask(threadId, async () => {
          const nodeContext = registry.get(name);

          if (!nodeContext) {
            throw GraphExecutionError.nodeExecutionFailed(name, new Error(`Node not found: "${name}"`), input);
          }

          // Check for maximum node visits
          if (opt.maxNodeVisits-- <= 0) {
            throw GraphExecutionError.maxVisitsExceeded(name, options?.maxNodeVisits || 100);
          }

          const execute = createNodeExecutor({
            executionId,
            name,
            end,
            baseBranch: sourceToMergeNodeMap[name],
            node: nodeContext,
            recordExecution,
            publishEvent: publish,
          });

          const { name: nextNodes, output } = await execute(input);

          // Allocate thread IDs for child nodes
          const allocateThreadIds = () => {
            // Create new thread IDs for each next node
            const newThreadIds = nextNodes.map(() => randomId());
            // Current thread ID can be reused
            return [...newThreadIds, threadId];
          };

          const threadIds = allocateThreadIds();
          const getThreadId = () => threadIds.pop()!;

          // Process each next node
          nextNodes.forEach(async (nextName) => {
            if (!mergeNodeStatus.has(nextName)) {
              // Normal node - execute directly
              return scheduleNodeExecution(getThreadId(), nextName, output);
            }

            // Merge node - check if all sources are ready
            const mergeInput = processMergeNode(nextName, name, output);
            if (mergeInput) {
              return scheduleNodeExecution(getThreadId(), nextName, mergeInput);
            }
          });

          return output;
        });
      };

      /**
       * Emits the graph start event
       */
      const emitGraphStartEvent = () => {
        publish({
          eventType: 'WORKFLOW_START',
          executionId,
          startedAt,
          input,
        } as GraphStartEvent);
      };

      /**
       * Emits the graph end event
       */
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

      /**
       * Converts the execution result to a GraphResult
       */
      const toResult = (isOk: boolean) => (output: unknown) => {
        if (end && histories.at(-1)?.node.name != end) {
          console.log({ end, lastNode: histories.at(-1)?.node.name });
          const endNode = [...histories].reverse().find((n) => n.node.name == end)?.node;
          if (endNode) output = endNode.output;
        }
        return {
          startedAt,
          endedAt: Date.now(),
          histories,
          error: isOk ? undefined : output instanceof Error ? output : new Error(String(output)),
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
                .map(scheduleNodeExecution.bind(null, randomId(), start, input))
                .map(threadPool.waitForCompletion)
                .watch(emitGraphEndEvent)
                .unwrap() as never,
              Math.max(0, opt.timeout),
              GraphExecutionError.timeout(opt.timeout)
            ) as Promise<never>
        )
        .map(toResult(true))
        .catch(toResult(false))
        .unwrap();
    },
  };
};

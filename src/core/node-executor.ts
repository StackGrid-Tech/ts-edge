import { safe } from 'ts-safe';
import { GraphNodeContext, GraphNodeEndEvent, GraphNodeHistory, GraphNodeStartEvent } from '../interfaces';
import { isNull } from '../shared';
import { GraphExecutionError } from './error';

/**
 * Context required for node execution
 */
interface NodeExecutionContext {
  executionId: string;
  end?: string;
  name: string;
  node: GraphNodeContext;
  baseBranch?: string;
  recordExecution: (history: GraphNodeHistory) => void;
  publishEvent: (event: GraphNodeStartEvent | GraphNodeEndEvent) => void;
}

/**
 * Creates a node executor function that processes input and determines the next nodes
 */
export const createNodeExecutor =
  ({ executionId, name, node, end, baseBranch, recordExecution, publishEvent }: NodeExecutionContext) =>
  async (input: any) => {
    const startedAt = Date.now();
    return (
      safe(node)
        // Publish node start event
        .watch(
          publishEvent.bind(null, {
            executionId,
            eventType: 'NODE_START',
            startedAt,
            node: { name, input },
          } as GraphNodeStartEvent)
        )
        // Validate node exists
        .effect((node) => {
          if (!node) {
            throw GraphExecutionError.nodeExecutionFailed(name, new Error(`Node not found: "${name}"`), input);
          }
        })
        // Execute node with input
        .map((node) => node.execute(input))
        // Determine next nodes based on edge configuration
        .map(async (output): Promise<{ name: string[]; output: any }> => {
          // If we're at the end node or there's no edge, return empty targets
          if ((!isNull(end) && name == end) || !node.edge) {
            return { name: [], output };
          }

          // Handle direct edges
          if (node.edge.type == 'direct') {
            return {
              output,
              name: node.edge.next,
            };
          }

          // Handle dynamic edges
          const router = node.edge.next;
          const next = await router(output);

          // If router returns null or undefined, no next nodes
          if (isNull(next)) {
            return { name: [], output };
          }

          // Handle string result (just node name)
          if (typeof next == 'string') {
            return { name: [next], output };
          }

          // Handle object result (node name and input)
          if (typeof next.name != 'string') {
            throw GraphExecutionError.invalidDynamicEdgeResult(name, next);
          }

          return { name: [next.name], output: next.input };
        })
        // Handle default branch if no next nodes but we have a merge target
        .map((next) => {
          if (!next.name.length && baseBranch && (isNull(end) || name != end)) {
            return { name: [baseBranch], output: next.output };
          }
          return next;
        })
        // Record execution history and publish end event
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

          recordExecution(history);

          publishEvent({
            eventType: 'NODE_END',
            executionId,
            ...history,
          } as GraphNodeEndEvent);
        })
        .unwrap()
    );
  };

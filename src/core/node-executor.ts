import { safe } from 'ts-safe';
import { GraphNodeContext, GraphNodeEndEvent, GraphNodeHistory, GraphNodeStartEvent } from '../interfaces';
import { isNull } from '../shared';

interface RunnerContext {
  executionId: string;
  end?: string;
  name: string;
  node: GraphNodeContext;
  baseBranch?: string;
  recordExecution: (history: GraphNodeHistory) => void;
  publishEvent: (event: GraphNodeStartEvent | GraphNodeEndEvent) => void;
}

export const createNodeExecutor =
  ({ executionId, name, node, end, baseBranch, recordExecution, publishEvent }: RunnerContext) =>
  async (input: any) => {
    const startedAt = Date.now();
    return (
      safe(node)
        // publish start event
        .watch(
          publishEvent.bind(null, {
            executionId,
            eventType: 'NODE_START',
            startedAt,
            node: { name, input },
          } as GraphNodeStartEvent)
        )
        // check
        .effect((node) => {
          if (!node) throw new Error(`Not Found Node "${name}"`);
        })
        // execute node
        .map((node) => node.execute(input))
        // find next node
        .map(async (output): Promise<{ name: string[]; output: any }> => {
          if ((!isNull(end) && name == end) || !node.edge) return { name: [], output };
          if (node.edge.type == 'direct') {
            return {
              output,
              name: node.edge.next,
            };
          }
          const router = node.edge.next;
          const next = await router(output);
          if (isNull(next)) return { name: [], output };

          if (typeof next == 'string') return { name: [next], output };
          if (typeof next.name != 'string') throw new Error('Invalid dynamic edge result');
          return { name: [next.name], output: next.input };
        })
        // find next node 2
        .map((next) => {
          if (!next.name.length && baseBranch && (isNull(end) || name != end)) {
            return { name: [baseBranch], output: next.output };
          }
          return next;
        })
        // publish end event  and record history
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

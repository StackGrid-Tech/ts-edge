import { GraphNode, GraphNodeRouter } from '../interfaces';

export const graphNode = <Name extends string = string, Input = any, Output = any>(node: {
  name: Name;
  execute: (input: Input) => Output;
}) => {
  return node;
};

export namespace graphNode {
  export type infer<T extends ReturnType<typeof graphNode>> = T extends {
    name: infer N;
    description?: string;
    execute: (input: infer I) => infer O;
  }
    ? { name: N; input: I; output: O extends PromiseLike<any> ? Awaited<O> : O }
    : never;
}

export function graphNodeRouter(router: GraphNodeRouter<GraphNode, string, string>);
export function graphNodeRouter<PossibleNode extends string[]>(
  possibleTargets: [...PossibleNode],
  router: GraphNodeRouter<any, any, PossibleNode[number]>
);
export function graphNodeRouter(...args: any[]) {
  if (typeof args[0] == 'function') return args[0] as GraphNodeRouter<any, never, never>;
  return { possibleTargets: args[0], router: args[1] } as unknown as GraphNodeRouter<any, never, never>;
}

export const graphMergeNode = <Name extends string, Branch extends readonly string[], Output = any>(mergedNode: {
  branch: [...Branch];
  name: Name;
  description?: string;
  execute: (inputs: { [K in Branch[number]]: any }) => Output;
}) => {
  return mergedNode;
};

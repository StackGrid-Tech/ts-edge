import { GraphNodeRouter } from '../interfaces';

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

export const graphNodeRouter = (router: GraphNodeRouter<any, any, any>) => router as GraphNodeRouter<any, never, never>;

export const graphMergeNode = <Name extends string, Branch extends readonly string[], Output = any>(mergedNode: {
  branch: [...Branch];
  name: Name;
  execute: (inputs: { [K in Branch[number]]: any }) => Output;
}) => {
  return mergedNode;
};

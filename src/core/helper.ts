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

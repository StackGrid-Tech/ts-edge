export type GraphNode<Name extends string = string, Input = any, Output = any> = {
  readonly name: Name;

  input: Input;

  output: Output extends PromiseLike<any> ? Awaited<Output> : Output;
};

export type InputOf<T extends GraphNode, Name extends T['name']> = Extract<T, { name: Name }>['input'];

export type OutputOf<T extends GraphNode, Name extends T['name'] = T['name']> = Extract<T, { name: Name }>['output'];

export type GraphNodeWithOptionalOutput<T extends GraphNode> = {
  [K in keyof T]: K extends 'output' ? T[K] | undefined : T[K];
};

export type GraphNodeHistory<T extends GraphNode = GraphNode> = {
  startedAt: number;

  endedAt: number;

  error?: Error;
} & (
  | {
      isOk: true;

      error?: Error;

      node: T;
    }
  | {
      isOk: false;

      error: Error;

      node: GraphNodeWithOptionalOutput<T>;
    }
);

export type GraphStartEvent<Input = any> = {
  executionId: string;

  eventType: 'WORKFLOW_START';

  startedAt: number;

  input: Input;
};

export type GraphEndEvent<T extends GraphNode = GraphNode, Output = any> = {
  executionId: string;

  eventType: 'WORKFLOW_END';

  startedAt: number;

  endedAt: number;

  histories: GraphNodeHistory<T>[];
} & (
  | {
      isOk: false;
      error: Error;
      output?: Output;
    }
  | {
      isOk: true;
      error?: Error;
      output: Output;
    }
);

export type GraphNodeStartEvent<T extends GraphNode = GraphNode> = {
  executionId: string;
  eventType: 'NODE_START';
} & Pick<GraphNodeHistory<T>, 'startedAt' | 'node'>;

export type GraphNodeEndEvent<T extends GraphNode = GraphNode> = {
  executionId: string;

  eventType: 'NODE_END';
} & GraphNodeHistory<T>;

export type GraphEvent<
  T extends GraphNode = GraphNode,
  StartNodeName extends T['name'] = T['name'],
  EndNodeName extends T['name'] = T['name'],
> =
  | GraphStartEvent<InputOf<T, StartNodeName>>
  | GraphEndEvent<T, OutputOf<T, EndNodeName>>
  | GraphNodeStartEvent<T>
  | GraphNodeEndEvent<T>;

export type ConnectableNode<T extends GraphNode, InputNode extends GraphNode> = {
  [ToName in T['name']]: OutputOf<InputNode, InputNode['name']> extends InputOf<T, ToName> ? ToName : never;
}[T['name']];

export interface RunOptions {
  maxNodeVisits: number;
  timeout: number;
}
export type GraphStructure = Array<{
  name: string;
  edge?:
    | {
        type: 'direct';
        name: string | string[];
      }
    | {
        type: 'dynamic';
        name?: string;
      };
}>;

export type GraphResult<T extends GraphNode = never, Output = unknown> = {
  startedAt: number;

  endedAt: number;

  error?: Error;

  histories: GraphNodeHistory<T>[];
} & (
  | {
      isOk: true;
      error?: Error;
      output: Output;
    }
  | {
      isOk: false;
      error: Error;
      output?: Output;
    }
);

export type GraphNodeRouter<
  AllNode extends GraphNode,
  FromNodeName extends AllNode['name'],
  ToNodeName extends AllNode['name'],
> = (output: Extract<AllNode, { name: FromNodeName }>['output']) =>
  | {
      name: ToNodeName;
      input: InputOf<AllNode, ToNodeName>;
    }
  | ToNodeName
  | undefined
  | null
  | void
  | PromiseLike<
      | {
          name: ToNodeName;
          input: InputOf<AllNode, ToNodeName>;
        }
      | ToNodeName
      | undefined
      | void
    >;

export interface GraphRunnable<
  T extends GraphNode = never,
  StartNode extends T['name'] = never,
  EndNode extends T['name'] = never,
> {
  getStructure(): GraphStructure;

  subscribe(handler: (event: GraphEvent<T, StartNode, EndNode>) => any): void;

  unsubscribe(handler: (event: any) => any): void;
  run(input: InputOf<T, StartNode>, options?: Partial<RunOptions>): Promise<GraphResult<T, OutputOf<T, EndNode>>>;
}

export interface GraphRegistry<T extends GraphNode = never, Connected extends string = never> {
  addNode<Name extends string = string, Input = any, Output = any>(node: {
    name: Name;
    execute: (input: Input) => Output;
  }): GraphRegistry<T | GraphNode<Name, Input, Output>, Connected>;
  addMergeNode<Name extends string = string, NodeNames extends T['name'][] = T['name'][], Output = any>(node: {
    name: Name;
    sources: NodeNames;
    execute: (inputs: { [K in NodeNames[number]]: OutputOf<T, K> }) => Output;
  }): GraphRegistry<T | GraphNode<Name, any, Output>, Connected>;
  edge<
    FromName extends Exclude<T['name'], Connected>,
    ToName extends Exclude<ConnectableNode<T, Extract<T, { name: FromName }>>, FromName>,
  >(
    from: FromName,
    to: ToName | ToName[]
  ): GraphRegistry<T, Connected | FromName>;

  dynamicEdge<FromName extends T['name'], ToName extends T['name']>(
    from: FromName,
    router: GraphNodeRouter<T, FromName, ToName>
  ): GraphRegistry<T, Connected | FromName>;

  compile<StartName extends string = T['name'], EndName extends string = T['name']>(
    startNode: StartName,
    endNode?: EndName
  ): GraphRunnable<T, StartName, EndName>;
}

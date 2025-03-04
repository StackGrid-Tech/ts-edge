export type Node<Name extends string = string, Input = any, Output = any> = {
  readonly name: Name;

  input: Input;

  output: Output extends PromiseLike<any> ? Awaited<Output> : Output;
};

export type InputOf<T extends Node, Name extends T['name']> = Extract<T, { name: Name }>['input'];

export type OutputOf<T extends Node, Name extends T['name'] = T['name']> = Extract<T, { name: Name }>['output'];

export type NodeWithOptionalOutput<T extends Node> = {
  [K in keyof T]: K extends 'output' ? T[K] | undefined : T[K];
};

export type NodeHistory<T extends Node = Node> = {
  startedAt: number;

  endedAt: number;

  nextNode?: T['name'];

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

      node: NodeWithOptionalOutput<T>;
    }
);

export interface NodeContext {
  histories: NodeHistory[];
  node: {
    name: string;
    input: any;
    output?: any;
  };
  timestamp: number;
  next: {
    name?: string;
    input?: any;
  };
}

export type WorkFlowStartEvent<Input = any> = {
  executionId: string;

  eventType: 'WORKFLOW_START';

  startedAt: number;

  input: Input;
};

export type WorkFlowEndEvent<T extends Node = Node, Output = any> = {
  executionId: string;

  eventType: 'WORKFLOW_END';

  startedAt: number;

  endedAt: number;

  histories: NodeHistory<T>[];
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

export type NodeStartEvent<T extends Node = Node> = {
  executionId: string;

  eventType: 'NODE_START';
} & Pick<NodeHistory<T>, 'startedAt' | 'node'>;

export type NodeEndEvent<T extends Node = Node> = {
  executionId: string;

  eventType: 'NODE_END';
} & NodeHistory<T>;

export type WorkFlowEvent<
  T extends Node = Node,
  StartNodeName extends T['name'] = T['name'],
  EndNodeName extends T['name'] = T['name'],
> =
  | WorkFlowStartEvent<InputOf<T, StartNodeName>>
  | WorkFlowEndEvent<T, OutputOf<T, EndNodeName>>
  | NodeStartEvent<T>
  | NodeEndEvent<T>;

export type ConnectableNode<T extends Node, InputNode extends Node> = {
  [ToName in T['name']]: OutputOf<InputNode, InputNode['name']> extends InputOf<T, ToName> ? ToName : never;
}[T['name']];

export interface RunOptions {
  maxNodeVisits: number;

  timeout: number;
}

export interface WorkFlowStructure<T extends Node = Node> {
  nodes: Map<T['name'], Function>;

  routes: Map<T['name'], Function>;

  edges: Map<T['name'], T['name']>;
}

export type WorkFlowResult<T extends Node = never, Output = unknown> = {
  startedAt: number;

  endedAt: number;

  error?: Error;

  histories: NodeHistory<T>[];
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

export interface WorkFlowRunner<
  T extends Node = never,
  StartNode extends T['name'] = never,
  EndNode extends T['name'] = never,
> {
  getStructure(): WorkFlowStructure;
  subscribe(handler: (event: WorkFlowEvent<T, StartNode, EndNode>) => any): void;
  unsubscribe(handler: (event: any) => any): void;
  attachHook<EntryPointNode extends T>(entryPoint: EntryPointNode['name']): HookRegistry<never, never, EntryPointNode>;
  run(input: InputOf<T, StartNode>, options?: Partial<RunOptions>): Promise<WorkFlowResult<T, OutputOf<T, EndNode>>>;
}

export interface HookConnector<
  T extends Node = never,
  StartNode extends T['name'] = never,
  EndNode extends T['name'] = never,
> {
  getStructure(): WorkFlowStructure;
  subscribe(handler: (event: WorkFlowEvent<T, StartNode, EndNode>) => any): void;
  unsubscribe(handler: (event: any) => any): void;
  attachHook<EntryPointNode extends T>(entryPoint: EntryPointNode['name']): HookRegistry<never, never, EntryPointNode>;
  connect(
    options?: Partial<
      RunOptions & {
        onResult: (data: WorkFlowResult<T, OutputOf<T, EndNode>>) => any;
      }
    >
  ): void;
  disconnect(): void;
}

export interface DefaultRegistry<T extends Node = never, Connected extends string = never> {
  addNode<Name extends string = string, Input = any, Output = any>(node: {
    name: Name;
    processor: (input: Input) => Output;
  });

  edge<
    FromName extends Exclude<T['name'], Connected>,
    ToName extends Exclude<ConnectableNode<T, Extract<T, { name: FromName }>>, Extract<T, { name: FromName }>>,
  >(
    from: FromName,
    to: ToName
  );

  dynamicEdge<FromName extends Exclude<T['name'], Connected>, ToName extends T['name']>(
    from: FromName,
    router: (result: {
      input: Extract<T, { name: FromName }>['input'];
      output: Extract<T, { name: FromName }>['output'];
    }) =>
      | {
          name: ToName;
          input: InputOf<T, ToName>;
        }
      | ToName
      | null
      | undefined
      | PromiseLike<
          | {
              name: ToName;
              input: InputOf<T, ToName>;
            }
          | null
          | ToName
          | undefined
        >
  );
}

export interface WorkFlowRegistry<T extends Node = never, Connected extends string = never>
  extends DefaultRegistry<T, Connected> {
  addNode<Name extends string = string, Input = any, Output = any>(node: {
    name: Name;
    processor: (input: Input) => Output;
  }): WorkFlowRegistry<T | Node<Name, Input, Output>, Connected>;

  edge<
    FromName extends Exclude<T['name'], Connected>,
    ToName extends Exclude<ConnectableNode<T, Extract<T, { name: FromName }>>, Extract<T, { name: FromName }>>,
  >(
    from: FromName,
    to: ToName
  ): WorkFlowRegistry<T, Connected | FromName>;

  dynamicEdge<FromName extends Exclude<T['name'], Connected>, ToName extends T['name']>(
    from: FromName,
    router: (result: {
      input: Extract<T, { name: FromName }>['input'];
      output: Extract<T, { name: FromName }>['output'];
    }) =>
      | {
          name: ToName;
          input: InputOf<T, ToName>;
        }
      | ToName
      | null
      | undefined
      | PromiseLike<
          | {
              name: ToName;
              input: InputOf<T, ToName>;
            }
          | null
          | ToName
          | undefined
        >
  ): WorkFlowRegistry<T, Connected | FromName>;

  compile<StartName extends T['name'], EndName extends T['name']>(
    startNode: StartName,
    endNode?: EndName
  ): WorkFlowRunner<T, StartName, EndName>;
}

export interface HookRegistry<
  T extends Node = never,
  Connected extends string = never,
  EntryPointNode extends Node = never,
> extends DefaultRegistry<T, Connected> {
  addNode<Name extends string = string, Input = any, Output = any>(node: {
    name: Name;
    processor: (input: Input) => Output;
  }): HookRegistry<T | Node<Name, Input, Output>, Connected, EntryPointNode>;

  edge<
    FromName extends Exclude<T['name'], Connected>,
    ToName extends Exclude<ConnectableNode<T, Extract<T, { name: FromName }>>, Extract<T, { name: FromName }>>,
  >(
    from: FromName,
    to: ToName
  ): HookRegistry<T, Connected | FromName, EntryPointNode>;

  dynamicEdge<FromName extends Exclude<T['name'], Connected>, ToName extends T['name']>(
    from: FromName,
    router: (result: {
      input: Extract<T, { name: FromName }>['input'];
      output: Extract<T, { name: FromName }>['output'];
    }) =>
      | {
          name: ToName;
          input: InputOf<T, ToName>;
        }
      | ToName
      | null
      | undefined
      | PromiseLike<
          | {
              name: ToName;
              input: InputOf<T, ToName>;
            }
          | null
          | ToName
          | undefined
        >
  ): HookRegistry<T, Connected | FromName, EntryPointNode>;
  compile<StartName extends ConnectableNode<T, EntryPointNode>, EndName extends T['name']>(
    startNode: StartName,
    endNode?: EndName
  ): HookConnector<T, StartName, EndName>;
}

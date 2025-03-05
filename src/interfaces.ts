import type { ZodType } from 'zod';

/**
 * Represents a node in the workflow with a name, input, and output.
 * @template Name - The node name type
 * @template Input - The input data type
 * @template Output - The output data type
 */
export type Node<Name extends string = string, Input = any, Output = any> = {
  /** The unique name of the node */
  readonly name: Name;

  /** The input data for the node */
  input: Input;

  /** The output data produced by the node */
  output: Output extends PromiseLike<any> ? Awaited<Output> : Output;
};

/**
 * Extracts the input type of a node with a specific name from a collection of nodes.
 * @template T - The collection of nodes
 * @template Name - The name of the node to extract the input type from
 */
export type InputOf<T extends Node, Name extends T['name']> = Extract<T, { name: Name }>['input'];

/**
 * Extracts the output type of a node with a specific name from a collection of nodes.
 * @template T - The collection of nodes
 * @template Name - The name of the node to extract the output type from
 */
export type OutputOf<T extends Node, Name extends T['name'] = T['name']> = Extract<T, { name: Name }>['output'];

/**
 * Represents a node with an optional output.
 * Used in error cases where the node might not have produced an output.
 * @template T - The node type
 */
export type NodeWithOptionalOutput<T extends Node> = {
  [K in keyof T]: K extends 'output' ? T[K] | undefined : T[K];
};

/**
 * Records the execution history of a node, including timing and result status.
 * @template T - The node type
 */
export type NodeHistory<T extends Node = Node> = {
  /** Timestamp when the node execution started */
  startedAt: number;

  /** Timestamp when the node execution ended */
  endedAt: number;

  /** The name of the next node to execute (if any) */
  nextNode?: T['name'];

  /** Error that occurred during execution (if any) */
  error?: Error;
} & (
  | {
      /** Indicates successful execution */
      isOk: true;

      /** Error that occurred (should be undefined for successful execution) */
      error?: Error;

      /** The executed node with its input and output */
      node: T;
    }
  | {
      /** Indicates failed execution */
      isOk: false;

      /** Error that occurred during execution */
      error: Error;

      /** The executed node with its input and possibly undefined output */
      node: NodeWithOptionalOutput<T>;
    }
);

/**
 * Context information maintained during workflow execution.
 * Contains the current node, execution history, and information about the next node.
 */
export interface NodeContext {
  /** History of all executed nodes */
  histories: NodeHistory[];

  /** The current node being executed */
  node: {
    name: string;
    input: any;
    output?: any;
  };

  /** Timestamp of the current node execution */
  timestamp: number;

  /** Information about the next node to execute */
  next: {
    name?: string;
    input?: any;
  };
}

/**
 * Event emitted when a workflow starts execution.
 * @template Input - The input type for the workflow
 */
export type GraphStartEvent<Input = any> = {
  /** Unique ID for this workflow execution */
  executionId: string;

  /** The type of event */
  eventType: 'WORKFLOW_START';

  /** Timestamp when the workflow started */
  startedAt: number;

  /** The input data provided to the workflow */
  input: Input;
};

/**
 * Event emitted when a workflow completes execution.
 * @template T - The node type
 * @template Output - The output type of the workflow
 */
export type GraphEndEvent<T extends Node = Node, Output = any> = {
  /** Unique ID for this workflow execution */
  executionId: string;

  /** The type of event */
  eventType: 'WORKFLOW_END';

  /** Timestamp when the workflow started */
  startedAt: number;

  /** Timestamp when the workflow ended */
  endedAt: number;

  /** History of all nodes executed during the workflow */
  histories: NodeHistory<T>[];
} & (
  | {
      /** Indicates workflow failed */
      isOk: false;

      /** Error that caused the workflow to fail */
      error: Error;

      /** The output data of the workflow (may be undefined for failed workflows) */
      output?: Output;
    }
  | {
      /** Indicates workflow succeeded */
      isOk: true;

      /** Error that occurred (should be undefined for successful workflows) */
      error?: Error;

      /** The output data produced by the workflow */
      output: Output;
    }
);

/**
 * Event emitted when a node starts execution.
 * @template T - The node type
 */
export type NodeStartEvent<T extends Node = Node> = {
  /** Unique ID for this workflow execution */
  executionId: string;

  /** The type of event */
  eventType: 'NODE_START';
} & Pick<NodeHistory<T>, 'startedAt' | 'node'>;

/**
 * Event emitted when a node completes execution.
 * @template T - The node type
 */
export type NodeEndEvent<T extends Node = Node> = {
  /** Unique ID for this workflow execution */
  executionId: string;

  /** The type of event */
  eventType: 'NODE_END';
} & NodeHistory<T>;

/**
 * Union type for all workflow-related events.
 * @template T - The node type
 * @template StartNodeName - The name of the start node
 * @template EndNodeName - The name of the end node
 */
export type GraphEvent<
  T extends Node = Node,
  StartNodeName extends T['name'] = T['name'],
  EndNodeName extends T['name'] = T['name'],
> =
  | GraphStartEvent<InputOf<T, StartNodeName>>
  | GraphEndEvent<T, OutputOf<T, EndNodeName>>
  | NodeStartEvent<T>
  | NodeEndEvent<T>;

/**
 * Represents a node that can be connected to an input node based on compatible input/output types.
 * @template T - The collection of possible target nodes
 * @template InputNode - The source node that will provide output
 */
export type ConnectableNode<T extends Node, InputNode extends Node> = {
  [ToName in T['name']]: OutputOf<InputNode, InputNode['name']> extends InputOf<T, ToName> ? ToName : never;
}[T['name']];

/**
 * Configuration options for workflow execution.
 */
export interface RunOptions {
  /** Maximum number of nodes that can be visited during execution (prevents infinite loops) */
  maxNodeVisits: number;

  /** Maximum execution time in milliseconds before timing out */
  timeout: number;
}

/**
 * Represents the structure of a workflow with nodes, routes, and edges.
 * @template T - The node type
 */
export interface GraphStructure<T extends Node = Node> {
  /** Map of node names to their execute functions */
  nodes: Map<T['name'], Function>;

  /** Map of node names to their routing functions (for dynamic edges) */
  routes: Map<T['name'], Function>;

  /** Map of node names to their next node names (for static edges) */
  edges: Map<T['name'], T['name']>;
}

/**
 * The result of a workflow execution.
 * @template T - The node type
 * @template Output - The output type of the workflow
 */
export type GraphResult<T extends Node = never, Output = unknown> = {
  /** Timestamp when the workflow started */
  startedAt: number;

  /** Timestamp when the workflow ended */
  endedAt: number;

  /** Error that occurred during execution (if any) */
  error?: Error;

  /** History of all nodes executed during the workflow */
  histories: NodeHistory<T>[];
} & (
  | {
      /** Indicates workflow succeeded */
      isOk: true;

      /** Error that occurred (should be undefined for successful execution) */
      error?: Error;

      /** The output data produced by the workflow */
      output: Output;
    }
  | {
      /** Indicates workflow failed */
      isOk: false;

      /** Error that caused the workflow to fail */
      error: Error;

      /** The output data of the workflow (may be undefined for failed workflows) */
      output?: Output;
    }
);

/**
 * Interface for executing workflows.
 * @template T - The node type
 * @template StartNode - The name of the start node
 * @template EndNode - The name of the end node
 */
export interface GraphRunner<
  T extends Node = never,
  StartNode extends T['name'] = never,
  EndNode extends T['name'] = never,
> {
  /**
   * Gets the structure of the workflow.
   * @returns The workflow structure including nodes, routes, and edges
   */
  getStructure(): GraphStructure;

  /**
   * Subscribes to workflow events.
   * @param handler - Function to handle workflow events
   */
  subscribe(handler: (event: GraphEvent<T, StartNode, EndNode>) => any): void;

  /**
   * Unsubscribes from workflow events.
   * @param handler - Previously registered event handler
   */
  unsubscribe(handler: (event: any) => any): void;

  /**
   * Attaches a hook to a specific node in the workflow.
   * @template EntryPointNode - The node to attach the hook to
   * @param entryPoint - The name of the node to attach the hook to
   * @returns A hook registry for building a hook workflow
   */
  attachHook<EntryPointNode extends T>(entryPoint: EntryPointNode['name']): HookRegistry<never, never, EntryPointNode>;

  /**
   * Runs the workflow with the given input.
   * @param input - The input data for the start node
   * @param options - Execution options
   * @returns A promise that resolves to the workflow result
   */
  run(input: InputOf<T, StartNode>, options?: Partial<RunOptions>): Promise<GraphResult<T, OutputOf<T, EndNode>>>;
}

/**
 * Interface for connecting hook workflows.
 * @template T - The node type
 * @template StartNode - The name of the start node
 * @template EndNode - The name of the end node
 */
export interface HookConnector<
  T extends Node = never,
  StartNode extends T['name'] = never,
  EndNode extends T['name'] = never,
> {
  /**
   * Gets the structure of the workflow.
   * @returns The workflow structure including nodes, routes, and edges
   */
  getStructure(): GraphStructure;

  /**
   * Subscribes to workflow events.
   * @param handler - Function to handle workflow events
   */
  subscribe(handler: (event: GraphEvent<T, StartNode, EndNode>) => any): void;

  /**
   * Unsubscribes from workflow events.
   * @param handler - Previously registered event handler
   */
  unsubscribe(handler: (event: any) => any): void;

  /**
   * Attaches a hook to a specific node in the workflow.
   * @template EntryPointNode - The node to attach the hook to
   * @param entryPoint - The name of the node to attach the hook to
   * @returns A hook registry for building a hook workflow
   */
  attachHook<EntryPointNode extends T>(entryPoint: EntryPointNode['name']): HookRegistry<never, never, EntryPointNode>;

  /**
   * Connects this hook to its parent workflow.
   * @param options - Connection options including execution options and result callback
   */
  connect(
    options?: Partial<
      RunOptions & {
        /** Callback function that receives the result of the hook workflow */
        onResult: (data: GraphResult<T, OutputOf<T, EndNode>>) => any;
      }
    >
  ): void;

  /**
   * Disconnects this hook from its parent workflow.
   */
  disconnect(): void;
}

/**
 * Base registry interface for both workflow and hook registries.
 * @template T - The node type
 * @template Connected - Names of nodes that already have outgoing connections
 */
export interface DefaultRegistry<T extends Node = never, Connected extends string = never> {
  /**
   * Adds a node to the workflow.
   * @template Name - The node name type
   * @template Input - The input data type
   * @template Output - The output data type
   * @param node - The node definition including name and execute function
   */
  addNode<Name extends string = string, Input = any, Output = any>(node: {
    name: Name;
    execute: (input: Input) => Output;
    parameters?: ZodType<Input>;
  });

  /**
   * Creates a static edge between two nodes.
   * @template FromName - The name of the source node
   * @template ToName - The name of the target node
   * @param from - The name of the source node
   * @param to - The name of the target node
   */
  edge<
    FromName extends Exclude<T['name'], Connected>,
    ToName extends Exclude<ConnectableNode<T, Extract<T, { name: FromName }>>, FromName>,
  >(
    from: FromName,
    to: ToName
  );

  /**
   * Creates a dynamic edge from a node using a router function.
   * @template FromName - The name of the source node
   * @template ToName - The possible names of target nodes
   * @param from - The name of the source node
   * @param router - Function that determines the next node based on the output of the source node
   */
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

/**
 * Registry for building workflows.
 * @template T - The node type
 * @template Connected - Names of nodes that already have outgoing connections
 */
export interface GraphRegistry<T extends Node = never, Connected extends string = never>
  extends DefaultRegistry<T, Connected> {
  /**
   * Adds a node to the workflow.
   * @template Name - The node name type
   * @template Input - The input data type
   * @template Output - The output data type
   * @param node - The node definition including name and execute function
   * @returns Updated workflow registry with the new node
   */
  addNode<Name extends string = string, Input = any, Output = any>(node: {
    name: Name;
    execute: (input: Input) => Output;
    parameters?: ZodType<Input>;
  }): GraphRegistry<T | Node<Name, Input, Output>, Connected>;

  /**
   * Creates a static edge between two nodes.
   * @template FromName - The name of the source node
   * @template ToName - The name of the target node
   * @param from - The name of the source node
   * @param to - The name of the target node
   * @returns Updated workflow registry with the new edge
   */
  edge<
    FromName extends Exclude<T['name'], Connected>,
    ToName extends Exclude<ConnectableNode<T, Extract<T, { name: FromName }>>, FromName>,
  >(
    from: FromName,
    to: ToName
  ): GraphRegistry<T, Connected | FromName>;

  /**
   * Creates a dynamic edge from a node using a router function.
   * @template FromName - The name of the source node
   * @template ToName - The possible names of target nodes
   * @param from - The name of the source node
   * @param router - Function that determines the next node based on the output of the source node
   * @returns Updated workflow registry with the new dynamic edge
   */
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
  ): GraphRegistry<T, Connected | FromName>;

  /**
   * Compiles the workflow into an executable workflow runner.
   * @template StartName - The name of the start node
   * @template EndName - The name of the end node
   * @param startNode - The name of the start node
   * @param endNode - The name of the end node (optional)
   * @returns A workflow runner that can execute the workflow
   */
  compile<StartName extends T['name'], EndName extends T['name']>(
    startNode: StartName,
    endNode?: EndName
  ): GraphRunner<T, StartName, EndName>;
}

/**
 * Registry for building hook workflows.
 * @template T - The node type
 * @template Connected - Names of nodes that already have outgoing connections
 * @template EntryPointNode - The node type of the entry point in the parent workflow
 */
export interface HookRegistry<
  T extends Node = never,
  Connected extends string = never,
  EntryPointNode extends Node = never,
> extends DefaultRegistry<T, Connected> {
  /**
   * Adds a node to the hook workflow.
   * @template Name - The node name type
   * @template Input - The input data type
   * @template Output - The output data type
   * @param node - The node definition including name and execute function
   * @returns Updated hook registry with the new node
   */
  addNode<Name extends string = string, Input = any, Output = any>(node: {
    name: Name;
    execute: (input: Input) => Output;
    parameters?: ZodType<Input>;
  }): HookRegistry<T | Node<Name, Input, Output>, Connected, EntryPointNode>;

  /**
   * Creates a static edge between two nodes.
   * @template FromName - The name of the source node
   * @template ToName - The name of the target node
   * @param from - The name of the source node
   * @param to - The name of the target node
   * @returns Updated hook registry with the new edge
   */
  edge<
    FromName extends Exclude<T['name'], Connected>,
    ToName extends Exclude<ConnectableNode<T, Extract<T, { name: FromName }>>, FromName>,
  >(
    from: FromName,
    to: ToName
  ): HookRegistry<T, Connected | FromName, EntryPointNode>;

  /**
   * Creates a dynamic edge from a node using a router function.
   * @template FromName - The name of the source node
   * @template ToName - The possible names of target nodes
   * @param from - The name of the source node
   * @param router - Function that determines the next node based on the output of the source node
   * @returns Updated hook registry with the new dynamic edge
   */
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

  /**
   * Compiles the hook workflow into a hook connector.
   * @template StartName - The name of the start node
   * @template EndName - The name of the end node
   * @param startNode - The name of the start node
   * @param endNode - The name of the end node (optional)
   * @returns A hook connector that can connect to the parent workflow
   */
  compile<StartName extends ConnectableNode<T, EntryPointNode>, EndName extends T['name']>(
    startNode: StartName,
    endNode?: EndName
  ): HookConnector<T, StartName, EndName>;
}

import { GraphStoreState } from './core/store';

/**
 * Function signature for middleware that can intercept and modify node execution.
 *
 * @template T - The GraphNode type
 * @param node - The node that is about to be executed without its output
 * @param next - Callback function to continue execution, optionally with a modified route
 * @returns Any value or Promise
 */
export type GraphNodeMiddleware<T extends GraphNode> = (
  node: GraphNodeWithOutOutput<T>,
  next: (route?: GraphNodeWithOutOutput<T>) => void
) => any;

/**
 * Base interface for a graph node.
 * Represents an executable unit that processes input data and produces output.
 *
 * @template Name - The type of the node name
 * @template Input - The type of the node input
 * @template Output - The type of the node output
 */
export type GraphNode<
  Name extends string = string,
  Input = any,
  Output = any,
  Metadata extends GraphNodeMetadata = GraphNodeMetadata,
> = {
  /** Unique identifier for the node */
  readonly name: Name;

  /** Input data for the node */
  input: Input;

  /** Output data from the node. For async outputs, the resolved value is used. */
  output: Output extends PromiseLike<any> ? Awaited<Output> : Output;

  /** Metadata for the node */
  metadata?: Metadata;
};

export type GraphNodeMetadata = { [key: string]: any };

/**
 * Extracts the input type of a node with a specific name.
 *
 * @template T - The GraphNode type
 * @template Name - The name of the node to extract the input type from
 */
export type InputOf<T extends GraphNode, Name extends T['name']> = Extract<T, { name: Name }>['input'];

/**
 * Extracts the output type of a node with a specific name.
 *
 * @template T - The GraphNode type
 * @template Name - The name of the node to extract the output type from (defaults to T['name'])
 */
export type OutputOf<T extends GraphNode, Name extends T['name'] = T['name']> = Extract<T, { name: Name }>['output'];

/**
 * A GraphNode type with optional output.
 * Used to represent nodes that may not have an output when an error occurs during processing.
 *
 * @template T - The GraphNode type
 */
export type GraphNodeWithOptionalOutput<T extends GraphNode> = {
  [K in keyof T]: K extends 'output' ? T[K] | undefined : T[K];
};

export type GraphNodeWithOutOutput<T extends GraphNode> = {
  [K in T['name']]: {
    name: K;
    input: Extract<T, { name: K }>['input'];
  };
}[T['name']];

/**
 * Records the execution history of a node.
 * Contains timing information, success/failure status, and error details.
 *
 * @template T - The GraphNode type
 */
export type GraphNodeHistory<T extends GraphNode = GraphNode> = {
  nodeExecutionId: string;
  /** Timestamp when the node execution started */
  startedAt: number;

  threadId: string;
  /** Timestamp when the node execution ended */
  endedAt: number;

  /** Error object if an error occurred during execution (optional) */
  error?: Error;
} & (
  | {
      /** Indicates the node execution was successful */
      isOk: true;

      /** Error object (optional even for successful executions) */
      error?: Error;

      /** The executed node with its input and output */
      node: T;
    }
  | {
      /** Indicates the node execution failed */
      isOk: false;

      /** Error object for the failed execution */
      error: Error;

      /** The executed node with its input and possibly undefined output */
      node: GraphNodeWithOptionalOutput<T>;
    }
);

/**
 * Event emitted when a graph workflow starts execution.
 *
 * @template Input - The input type for the workflow
 */
export type GraphStartEvent<Input = any> = {
  /** Event type identifier */
  eventType: 'WORKFLOW_START';

  /** Timestamp when the workflow started */
  startedAt: number;

  /** Input data provided to the workflow */
  input: Input;
};

/**
 * Event emitted when a graph workflow completes execution.
 *
 * @template T - The GraphNode type
 * @template Output - The output type of the workflow
 */
export type GraphEndEvent<T extends GraphNode = GraphNode, Output = any> = {
  /** Unique identifier for this execution instance */
  executionId: string;

  /** Event type identifier */
  eventType: 'WORKFLOW_END';

  /** Timestamp when the workflow started */
  startedAt: number;

  /** Timestamp when the workflow ended */
  endedAt: number;

  /** Array of node execution histories */
  histories: GraphNodeHistory<T>[];
} & (
  | {
      /** Indicates the workflow execution failed */
      isOk: false;
      /** Error object for the failed workflow */
      error: Error;
      /** Optional output from the workflow (may be undefined for failures) */
      output?: Output;
    }
  | {
      /** Indicates the workflow execution was successful */
      isOk: true;
      /** Optional error object (for successful workflows with warnings) */
      error?: Error;
      /** Output data from the workflow */
      output: Output;
    }
);

/**
 * Event emitted when a node begins execution.
 *
 * @template T - The GraphNode type
 */
export type GraphNodeStartEvent<T extends GraphNode = GraphNode> = {
  /** Unique identifier for this execution instance */
  executionId: string;
  /** Event type identifier */
  eventType: 'NODE_START';
  node: GraphNodeWithOutOutput<T>;
} & Pick<GraphNodeHistory<T>, 'startedAt' | 'threadId' | 'nodeExecutionId'>;

/**
 * Represents a labeled stream chunk emitted during node execution.
 *
 * @template T - The GraphNode type
 */
export type GraphNodeStreamEvent<T extends GraphNode = GraphNode> = {
  /** Unique identifier for this execution instance */
  executionId: string;
  /** Event type identifier */
  eventType: 'NODE_STREAM';
  /** Timestamp when the stream chunk was emitted */
  timestamp: number;
  /** Information about the node and the stream chunk */
  node: {
    /** Name of the node that emitted the stream chunk */
    name: T['name'];
    /** The data chunk being streamed */
    chunk: string;
  };
} & Pick<GraphNodeHistory<T>, 'threadId' | 'nodeExecutionId'>;
/**
 * Event emitted when a node completes execution.
 *
 * @template T - The GraphNode type
 */
export type GraphNodeEndEvent<T extends GraphNode = GraphNode> = {
  /** Unique identifier for this execution instance */
  executionId: string;
  /** Event type identifier */
  eventType: 'NODE_END';
} & GraphNodeHistory<T>;

/**
 * Union type for all possible graph-related events.
 *
 * @template T - The GraphNode type
 * @template StartNodeName - The name of the starting node
 * @template EndNodeName - The name of the ending node
 */
export type GraphEvent<
  T extends GraphNode = GraphNode,
  StartNodeName extends T['name'] = T['name'],
  EndNodeName extends T['name'] = T['name'],
> =
  | GraphStartEvent<InputOf<T, StartNodeName>>
  | GraphEndEvent<T, OutputOf<T, EndNodeName>>
  | GraphNodeStartEvent<T>
  | GraphNodeEndEvent<T>
  | GraphNodeStreamEvent<T>;

/**
 * Utility type to find nodes that can be connected to a given input node.
 * A node is connectable if its input type matches the output type of the input node.
 *
 * @template T - The node type to check if it's connectable
 * @template InputNode - The source node that provides the output
 */
export type ConnectableNode<T extends GraphNode, InputNode extends GraphNode> = {
  [ToName in T['name']]: OutputOf<InputNode, InputNode['name']> extends InputOf<T, ToName> ? ToName : never;
}[T['name']];

/**
 * Options for running a graph workflow.
 */
export interface GraphRunOptions {
  /** Maximum number of times a node can be visited during execution */
  maxNodeVisits: number;
  /** Maximum execution time in milliseconds before timeout */
  timeout: number;
  /** Disable history recording */
  disableHistory: boolean;
}

/**
 * Context object passed to node execution functions.
 * Provides utilities for streaming data and accessing metadata.
 */
export type GraphNodeExecuteContext = {
  /**
   * Emits a stream chunk during node execution.
   *
   * @param chunk - The data to stream
   */
  stream: (chunk: string) => void;

  /**
   * Metadata associated with the node.
   */
  metadata: Record<string, any>;
};

/**
 * Represents the structure of a graph.
 * Used for visualization and analysis purposes.
 */
export type GraphNodeStructure = {
  /** Name of the node */
  name: string;
  /** Edge information for the node (if any) */
  edge?: {
    /** Direct edge with explicit target node(s) */
    type: 'direct' | 'dynamic';
    name: string[];
  };
  metadata: GraphNodeMetadata;
  isMergeNode: boolean;
};

/**
 * Represents the result of executing a graph workflow.
 *
 * @template T - The GraphNode type
 * @template Output - The output type of the workflow
 */
export type GraphResult<T extends GraphNode = never, Output = unknown> = {
  /** Timestamp when the workflow started */
  startedAt: number;

  /** Timestamp when the workflow ended */
  endedAt: number;

  /** Error object if an error occurred (optional) */
  error?: Error;

  /** Array of node execution histories */
  histories: GraphNodeHistory<T>[];
} & (
  | {
      /** Indicates the workflow execution was successful */
      isOk: true;
      /** Optional error object (for successful workflows with warnings) */
      error?: Error;
      /** Output data from the workflow */
      output: Output;
    }
  | {
      /** Indicates the workflow execution failed */
      isOk: false;
      /** Error object for the failed workflow */
      error: Error;
      /** Optional output from the workflow (may be undefined for failures) */
      output?: Output;
    }
);

type Router<T, U> = (output: T) => U | U[] | undefined | null | void | PromiseLike<U | U[] | undefined | null | void>;

/**
 * Function that determines the next node to execute based on a previous node's output.
 * Used for dynamic routing between nodes.
 *
 * @template AllNode - Union type of all possible nodes
 * @template FromNodeName - The name of the source node
 * @template ToNodeName - The name of the target node
 */
export type GraphNodeRouter<
  AllNode extends GraphNode,
  FromNodeName extends AllNode['name'],
  ConnectableNodeName extends AllNode['name'],
> = Router<Extract<AllNode, { name: FromNodeName }>['output'], ConnectableNodeName>;

/**
 * Default interface for runnable graph workflows.
 * Provides common methods for both regular and state-based graph workflows.
 *
 * @template T - The GraphNode type
 * @template StartNode - The name of the starting node
 * @template EndNode - The name of the ending node
 */
export interface GraphDefaultRunnable<
  T extends GraphNode = never,
  StartNode extends T['name'] = never,
  EndNode extends T['name'] = never,
> {
  /**
   * Returns true if the graph is currently running, false otherwise.
   *
   * @returns Boolean indicating whether the graph is currently executing
   */
  isRunning(): boolean;

  /**
   * Gets the structure of the graph.
   * @returns The graph structure for visualization and analysis
   */
  getStructure(): GraphNodeStructure[];

  /**
   * Subscribes to graph execution events.
   * @param handler - Function to handle emitted events
   */
  subscribe(handler: (event: GraphEvent<T, StartNode, EndNode>) => any): void;

  /**
   * Subscribes to graph execution events.
   * @param event
   */
  publish(event: GraphNodeStartEvent | GraphNodeEndEvent | GraphNodeStreamEvent): void;

  /**
   * Unsubscribes from graph execution events.
   * @param handler - The handler function to remove
   */
  unsubscribe(handler: (event: any) => any): void;

  /**
   * Executes the graph workflow.
   * @param input - Input data for the starting node
   * @param options - Optional configuration for execution
   * @returns Promise resolving to the execution result
   */
  run(
    input?: Partial<InputOf<T, StartNode>>,
    options?: Partial<GraphRunOptions>
  ): Promise<GraphResult<T, OutputOf<T, EndNode>>>;

  exit(reason?: string): void;
  use(middleware: GraphNodeMiddleware<T>): any;
}

/**
 * Interface for a runnable graph workflow.
 * Provides methods to execute, visualize, and monitor the graph.
 *
 * @template T - The GraphNode type
 * @template StartNode - The name of the starting node
 * @template EndNode - The name of the ending node
 */
export interface GraphRunnable<
  T extends GraphNode = never,
  StartNode extends T['name'] = never,
  EndNode extends T['name'] = never,
> extends GraphDefaultRunnable<T, StartNode, EndNode> {
  /**
   * Executes the graph workflow.
   * @param input - Input data for the starting node
   * @param options - Optional configuration for execution
   * @returns Promise resolving to the execution result
   */
  run(input: InputOf<T, StartNode>, options?: Partial<GraphRunOptions>): Promise<GraphResult<T, OutputOf<T, EndNode>>>;

  use(middleware: GraphNodeMiddleware<T>): GraphRunnable<T, StartNode, EndNode>;
}

export interface StateGraphRunnable<
  T extends GraphNode = never,
  StartNode extends T['name'] = never,
  EndNode extends T['name'] = never,
> extends GraphDefaultRunnable<T, StartNode, EndNode> {
  run(
    input?: Partial<T['input']>,
    options?: Partial<
      GraphRunOptions & {
        noResetState?: boolean;
      }
    >
  ): Promise<GraphResult<T, T['output']>>;

  use(
    middleware: (node: GraphNodeWithOutOutput<T>, next: (route?: GraphNodeWithOutOutput<T>) => void) => any
  ): StateGraphRunnable<T, StartNode, EndNode>;
}

/**
 * Interface for building and configuring a graph.
 * Provides methods to add nodes, define edges, and compile the graph into a runnable workflow.
 *
 * @template T - The GraphNode type
 * @template Connected - Names of nodes that already have outgoing connections
 */
export interface GraphRegistry<T extends GraphNode = never, Connected extends string = never> {
  /**
   * Adds a new node to the graph.
   *
   * @param node - Node configuration with name and execution function
   * @returns Updated graph registry
   */
  addNode<Name extends string = string, Input = any, Output = any>(node: {
    name: Name;
    execute: (input: Input, context: GraphNodeExecuteContext) => Output;
    metadata?: GraphNodeMetadata;
  }): GraphRegistry<T | GraphNode<Name, Input, Output>, Connected>;

  /**
   * Adds a merge node that combines outputs from multiple branch nodes.
   * This overload accepts a single configuration object.
   *
   * @param mergeNode - Complete merge node configuration including branches and execution logic
   * @returns Updated graph registry
   */
  addMergeNode<Name extends string, Branch extends T['name'][], Output = any>(mergeNode: {
    branch: Branch;
    name: Name;
    execute: (inputs: { [K in Branch[number]]: OutputOf<T, K> }, context: GraphNodeExecuteContext) => Output;
    metadata?: GraphNodeMetadata;
  }): GraphRegistry<T | GraphNode<Name, any, Output>, Connected>;

  /**
   * Creates a direct edge between nodes.
   *
   * @param from - Source node name
   * @param to - Target node name(s)
   * @returns Updated graph registry
   */
  edge<
    FromName extends Exclude<T['name'], Connected>,
    ToName extends Exclude<ConnectableNode<T, Extract<T, { name: FromName }>>, FromName>,
  >(
    from: FromName,
    to: ToName | ToName[]
  ): GraphRegistry<T, Connected | FromName>;

  /**
   * Creates a dynamic edge that determines the next node at runtime.
   *
   * @param from - Source node name
   * @param routerOrConfig - Either a direct router function or a configuration object
   *                         with possible target nodes and a router function
   * @returns Updated graph registry
   */
  dynamicEdge<
    FromName extends Exclude<T['name'], Connected>,
    PossibleNode extends ConnectableNode<T, Extract<T, { name: FromName }>>[],
  >(
    from: FromName,
    routerOrConfig:
      | GraphNodeRouter<T, FromName, ConnectableNode<T, Extract<T, { name: FromName }>>>
      | {
          possibleTargets: [...PossibleNode];
          router: GraphNodeRouter<T, FromName, PossibleNode[number]>;
        }
  ): GraphRegistry<T, Connected | FromName>;
  /**
   * Compiles the graph into a runnable workflow.
   *
   * @param startNode - Name of the node to start execution from
   * @param endNode - Optional name of the node to end execution at
   * @returns Runnable graph instance
   */
  compile<StartName extends string = T['name'], EndName extends string = T['name']>(
    startNode: StartName,
    endNode?: EndName
  ): GraphRunnable<T, StartName, EndName>;
}

/**
 * Interface for building and configuring a state-based graph workflow.
 * Unlike standard GraphRegistry, StateGraphRegistry uses a shared state object (GraphStore)
 * that all nodes can access and modify.
 *
 * State graphs are useful for workflows where:
 * - Multiple nodes need to read from and write to a shared state
 * - The overall state evolution is more important than individual node transformations
 * - Workflow decisions depend on the accumulated state rather than just the previous node's output
 *
 * @template T - The GraphStoreState type that defines the shape of the shared state
 * @template NodeName - Union type of all registered node names
 * @template Connected - Names of nodes that already have outgoing connections
 */
export interface StateGraphRegistry<
  T extends GraphStoreState = GraphStoreState,
  NodeName extends string = never,
  Connected extends string = never,
> {
  /**
   * Adds a new node to the state graph.
   * These nodes receive the current state as their input and can modify it directly.
   *
   * @param node - Node configuration with name and execution function
   * @param node.name - Unique identifier for the node
   * @param node.execute - Function that receives the current state and can modify it
   * @param node.metadata - Optional metadata for the node (used for visualization)
   * @returns Updated state graph registry
   *
   * @example
   * ```typescript
   * const workflow = createStateGraph(counterStore)
   *   .addNode({
   *     name: 'incrementCounter',
   *     execute: (state) => {
   *       state.increment();
   *     },
   *   });
   * ```
   */
  addNode<Name extends string = string, Output = any>(node: {
    name: Name;
    execute: (state: T, context: GraphNodeExecuteContext) => Output;
    metadata?: GraphNodeMetadata;
  }): StateGraphRegistry<T, NodeName | Name, Connected>;

  /**
   * Adds a merge node that combines execution paths from multiple branch nodes.
   * In state graphs, merge nodes receive the same state object from each branch,
   * allowing them to coordinate or combine effects from parallel execution paths.
   *
   * @param mergeNode - Merge node configuration including branch nodes and execution logic
   * @param mergeNode.branch - Array of source node names that feed into this merge node
   * @param mergeNode.name - Unique identifier for the merge node
   * @param mergeNode.execute - Function that receives state objects from each branch
   * @param mergeNode.metadata - Optional metadata for the node
   * @returns Updated state graph registry
   *
   * @example
   * ```typescript
   * workflow.addMergeNode({
   *   name: 'combineBranches',
   *   branch: ['processA', 'processB'],
   *   execute: (inputs) => {
   *     // inputs.processA and inputs.processB both refer to the same state object
   *     // since the state is shared across all nodes
   *   },
   * });
   * ```
   */
  addMergeNode<Name extends string, Branch extends NodeName[]>(mergeNode: {
    branch: Branch;
    name: Name;
    execute: (inputs: { [K in Branch[number]]: T }, context: GraphNodeExecuteContext) => any;
    metadata?: GraphNodeMetadata;
  }): StateGraphRegistry<T, NodeName | Name, Connected>;

  /**
   * Creates a direct edge between nodes to define execution flow.
   *
   * @param from - Source node name
   * @param to - Target node name(s)
   * @returns Updated state graph registry
   *
   * @example
   * ```typescript
   * workflow
   *   .edge('validateData', 'processData')
   *   .edge('processData', ['saveResults', 'logAction']);
   * ```
   */
  edge<FromName extends Exclude<NodeName, Connected>, ToName extends Exclude<NodeName, FromName>>(
    from: FromName,
    to: ToName | ToName[]
  ): StateGraphRegistry<T, NodeName, Connected | FromName>;

  /**
   * Creates a dynamic edge that determines the next node at runtime based on the current state.
   *
   * @param from - Source node name
   * @param routerOrConfig - Either a router function or a configuration object with
   *                         possible target nodes and a router function
   * @returns Updated state graph registry
   *
   * @example
   * ```typescript
   * // Simple router function
   * workflow.dynamicEdge('checkState', (state) => {
   *   return state.count > 0 ? 'positiveHandler' : 'zeroHandler';
   * });
   *
   * // Router with explicit possible targets (helps with visualization)
   * workflow.dynamicEdge('checkState', {
   *   possibleTargets: ['lowHandler', 'mediumHandler', 'highHandler'],
   *   router: (state) => {
   *     if (state.count < 10) return 'lowHandler';
   *     if (state.count < 50) return 'mediumHandler';
   *     return 'highHandler';
   *   }
   * });
   * ```
   */
  dynamicEdge<FromName extends Exclude<NodeName, Connected>, PossibleNode extends NodeName[]>(
    from: FromName,
    routerOrConfig:
      | Router<T, NodeName>
      | {
          possibleTargets: [...PossibleNode];
          router: Router<T, PossibleNode[number]>;
        }
  ): StateGraphRegistry<T, NodeName, Connected | FromName>;

  /**
   * Compiles the state graph into a runnable workflow.
   *
   * @param startNode - Name of the node to start execution from
   * @param endNode - Optional name of the node to end execution at
   * @returns Runnable state graph instance
   *
   * @example
   * ```typescript
   * // Compile with explicit start and end nodes
   * const app = workflow.compile('inputNode', 'outputNode');
   *
   * // Run the workflow with initial state
   * const result = await app.run({ count: 5 });
   *
   * // Or run with current state
   * const result = await app.run();
   * ```
   */
  compile<StartName extends NodeName = NodeName, EndName extends NodeName = NodeName>(
    startNode: StartName,
    endNode?: EndName
  ): StateGraphRunnable<GraphNode<NodeName, T, T>, StartName, EndName>;
}

export type GraphNodeContext = {
  execute: Function;
  metadata: GraphNodeMetadata;
  edge?: {
    type: 'direct' | 'dynamic';
    next: string[];
    router?: Function;
  };
} & ({ isMergeNode: true; branch: string[] } | { isMergeNode: false; branch?: string[] });

export type GraphRegistryContext = Map<string, GraphNodeContext>;

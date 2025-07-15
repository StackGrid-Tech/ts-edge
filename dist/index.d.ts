type GraphStoreState = Record<string, any>;
type StateSetter<T> = Partial<T> | ((prev: T) => Partial<T>);
type GraphStoreInitializer<T extends GraphStoreState> = {
  (set: (update: StateSetter<T>) => void, get: () => T): T;
};
type GraphStore<T extends GraphStoreState> = {
  (): T;
  get(): T;
  set(update: StateSetter<T>): void;
  reset(): void;
};
declare const graphStore: <T extends GraphStoreState = GraphStoreState>(
  initializer: GraphStoreInitializer<T>
) => GraphStore<T>;

/**
 * Function signature for middleware that can intercept and modify node execution.
 *
 * @template T - The GraphNode type
 * @param node - The node that is about to be executed without its output
 * @param next - Callback function to continue execution, optionally with a modified route
 * @returns Any value or Promise
 */
type GraphNodeMiddleware<T extends GraphNode> = (
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
type GraphNode<
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
type GraphNodeMetadata = {
  [key: string]: any;
};
/**
 * Extracts the input type of a node with a specific name.
 *
 * @template T - The GraphNode type
 * @template Name - The name of the node to extract the input type from
 */
type InputOf<T extends GraphNode, Name extends T['name']> = Extract<
  T,
  {
    name: Name;
  }
>['input'];
/**
 * Extracts the output type of a node with a specific name.
 *
 * @template T - The GraphNode type
 * @template Name - The name of the node to extract the output type from (defaults to T['name'])
 */
type OutputOf<T extends GraphNode, Name extends T['name'] = T['name']> = Extract<
  T,
  {
    name: Name;
  }
>['output'];
/**
 * A GraphNode type with optional output.
 * Used to represent nodes that may not have an output when an error occurs during processing.
 *
 * @template T - The GraphNode type
 */
type GraphNodeWithOptionalOutput<T extends GraphNode> = {
  [K in keyof T]: K extends 'output' ? T[K] | undefined : T[K];
};
type GraphNodeWithOutOutput<T extends GraphNode> = {
  [K in T['name']]: {
    name: K;
    input: Extract<
      T,
      {
        name: K;
      }
    >['input'];
  };
}[T['name']];
/**
 * Records the execution history of a node.
 * Contains timing information, success/failure status, and error details.
 *
 * @template T - The GraphNode type
 */
type GraphNodeHistory<T extends GraphNode = GraphNode> = {
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
type GraphStartEvent<Input = any> = {
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
type GraphEndEvent<T extends GraphNode = GraphNode, Output = any> = {
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
type GraphNodeStartEvent<T extends GraphNode = GraphNode> = {
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
type GraphNodeStreamEvent<T extends GraphNode = GraphNode> = {
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
type GraphNodeEndEvent<T extends GraphNode = GraphNode> = {
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
type GraphEvent<
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
type ConnectableNode<T extends GraphNode, InputNode extends GraphNode> = {
  [ToName in T['name']]: OutputOf<InputNode, InputNode['name']> extends InputOf<T, ToName> ? ToName : never;
}[T['name']];
/**
 * Options for running a graph workflow.
 */
interface GraphRunOptions {
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
type GraphNodeExecuteContext = {
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
type GraphNodeStructure = {
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
type GraphResult<T extends GraphNode = never, Output = unknown> = {
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
type GraphNodeRouter<
  AllNode extends GraphNode,
  FromNodeName extends AllNode['name'],
  ConnectableNodeName extends AllNode['name'],
> = Router<
  Extract<
    AllNode,
    {
      name: FromNodeName;
    }
  >['output'],
  ConnectableNodeName
>;
/**
 * Default interface for runnable graph workflows.
 * Provides common methods for both regular and state-based graph workflows.
 *
 * @template T - The GraphNode type
 * @template StartNode - The name of the starting node
 * @template EndNode - The name of the ending node
 */
interface GraphDefaultRunnable<
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
interface GraphRunnable<
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
interface StateGraphRunnable<
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
interface GraphRegistry<T extends GraphNode = never, Connected extends string = never> {
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
    execute: (
      inputs: {
        [K in Branch[number]]: OutputOf<T, K>;
      },
      context: GraphNodeExecuteContext
    ) => Output;
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
    ToName extends Exclude<
      ConnectableNode<
        T,
        Extract<
          T,
          {
            name: FromName;
          }
        >
      >,
      FromName
    >,
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
    PossibleNode extends ConnectableNode<
      T,
      Extract<
        T,
        {
          name: FromName;
        }
      >
    >[],
  >(
    from: FromName,
    routerOrConfig:
      | GraphNodeRouter<
          T,
          FromName,
          ConnectableNode<
            T,
            Extract<
              T,
              {
                name: FromName;
              }
            >
          >
        >
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
interface StateGraphRegistry<
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
    execute: (
      inputs: {
        [K in Branch[number]]: T;
      },
      context: GraphNodeExecuteContext
    ) => any;
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

declare const graphNode: <
  Name extends string = string,
  Input = any,
  Output = any,
  Metadata extends GraphNodeMetadata = GraphNodeMetadata,
>(node: {
  name: Name;
  execute: (input: Input, context: GraphNodeExecuteContext) => Output;
  metadata?: Metadata;
}) => {
  name: Name;
  execute: (input: Input, context: GraphNodeExecuteContext) => Output;
  metadata?: Metadata;
};
declare namespace graphNode {
  type infer<T> = T extends {
    name: infer N;
    execute: (input: infer I, context: GraphNodeExecuteContext) => infer O;
    metadata?: infer M;
  }
    ? {
        name: N;
        input: I;
        output: O extends PromiseLike<any> ? Awaited<O> : O;
        metadata: M;
      }
    : never;
}
declare function graphNodeRouter(router: GraphNodeRouter<GraphNode, string, string>): any;
declare function graphNodeRouter<PossibleNode extends string[]>(
  possibleTargets: [...PossibleNode],
  router: GraphNodeRouter<any, any, PossibleNode[number]>
): any;
declare const graphMergeNode: <Name extends string, Branch extends readonly string[], Output = any>(mergedNode: {
  branch: [...Branch];
  name: Name;
  metadata?: GraphNodeMetadata;
  execute: (inputs: { [K in Branch[number]]: any }, context: GraphNodeExecuteContext) => Output;
}) => {
  branch: [...Branch];
  name: Name;
  metadata?: GraphNodeMetadata;
  execute: (inputs: { [K in Branch[number]]: any }, context: GraphNodeExecuteContext) => Output;
};
declare const graphStateNode: <State extends GraphStoreState, Name extends string = string, Output = any>(node: {
  name: Name;
  execute: (state: State, context: GraphNodeExecuteContext) => Output;
  metadata?: GraphNodeMetadata;
}) => {
  name: Name;
  execute: (state: State, context: GraphNodeExecuteContext) => Output;
  metadata?: GraphNodeMetadata;
};
declare const graphStateMergeNode: <State extends GraphStoreState, Name extends string = string, Output = any>(node: {
  name: Name;
  branch: string[];
  execute: (state: State, context: GraphNodeExecuteContext) => Output;
  metadata?: GraphNodeMetadata;
}) => {
  branch: string[];
  name: Name;
  metadata?: GraphNodeMetadata;
  execute: (
    inputs: {
      [x: string]: any;
    },
    context: GraphNodeExecuteContext
  ) => Output;
};

declare const createGraph: () => GraphRegistry;
declare const createStateGraph: <T extends GraphStoreState>(store: GraphStore<T>) => StateGraphRegistry<T>;

/**
 * Error codes with associated default messages for the graph system
 */
declare enum GraphErrorCode {
  INVALID_NODE_NAME = 'Node name cannot be empty or is invalid',
  DUPLICATE_NODE_NAME = 'Node with this name already exists in the graph',
  NODE_NOT_FOUND = 'Node not found in the graph',
  CIRCULAR_DEPENDENCY = 'Circular dependency detected in graph',
  INVALID_EDGE = 'Invalid edge configuration',
  MISSING_SOURCE_NODE = 'Source node not found for edge',
  DUPLICATE_EDGE = 'Node already has an outgoing connection',
  MERGE_NODE_MISSING_BRANCH = 'Merge node references non-existent source nodes',
  MAX_NODE_VISITS_EXCEEDED = 'Maximum node visits exceeded',
  EXECUTION_TIMEOUT = 'Graph execution timed out',
  NODE_EXECUTION_FAILED = 'Node execution failed',
  INVALID_DYNAMIC_EDGE_RESULT = 'Invalid result from dynamic edge router',
  THREAD_POOL_FAILURE = 'Thread pool execution failed',
  EXECUTION_ABORTED = 'Graph execution was aborted',
  MIDDLEWARE_FAIL = 'Error thrown in graph middleware',
  EXIT = 'EXIT',
  INVALID_INPUT = 'Invalid input data provided',
  INVALID_OUTPUT = 'Node produced invalid output data',
  TYPE_MISMATCH = 'Data type mismatch between nodes',
  UNKNOWN_ERROR = 'Unknown error occurred in graph execution',
}
/**
 * Base class for all graph-related errors
 */
declare class GraphError extends Error {
  readonly code: GraphErrorCode;
  readonly nodeName?: string;
  readonly context?: Record<string, any>;
  readonly cause?: Error;
  constructor(
    code: GraphErrorCode,
    options?: {
      message?: string;
      nodeName?: string;
      cause?: Error;
      context?: Record<string, any>;
    }
  );
  /**
   * Creates a string representation of the error with detailed information
   */
  toString(): string;
  /**
   * Formats the error with node name if available
   */
  formatWithNode(nodeName?: string): string;
}
/**
 * Error thrown during graph configuration
 */
declare class GraphConfigurationError extends GraphError {
  constructor(
    code: GraphErrorCode,
    options?: {
      message?: string;
      nodeName?: string;
      cause?: Error;
      context?: Record<string, any>;
    }
  );
  /**
   * Creates a node not found error
   */
  static nodeNotFound(nodeName: string): GraphConfigurationError;
  /**
   * Creates a duplicate node error
   */
  static duplicateNode(nodeName: string): GraphConfigurationError;
  /**
   * Creates an error for a node that already has an edge
   */
  static duplicateEdge(nodeName: string): GraphConfigurationError;
  /**
   * Creates an error for invalid merge node branch
   */
  static invalidMergeBranch(nodeName: string, missingBranch: string[]): GraphConfigurationError;
}
/**
 * Error thrown during graph execution
 */
declare class GraphExecutionError extends GraphError {
  constructor(
    code: GraphErrorCode,
    options?: {
      message?: string;
      nodeName?: string;
      cause?: Error;
      context?: Record<string, any>;
    }
  );
  /**
   * Creates an error for node execution failure
   */
  static nodeExecutionFailed(nodeName: string, error: Error, input?: any): GraphExecutionError;
  /**
   * Creates an error for execution timeout
   */
  static timeout(timeoutMs: number): GraphExecutionError;
  /**
   * Creates an error for maximum node visits exceeded
   */
  static maxVisitsExceeded(nodeName: string, maxVisits: number): GraphExecutionError;
  /**
   * Creates an error for invalid dynamic edge result
   */
  static invalidDynamicEdgeResult(nodeName: string, result: any): GraphExecutionError;
}
/**
 * Error thrown for data-related issues
 */
declare class GraphDataError extends GraphError {
  constructor(
    code: GraphErrorCode,
    options?: {
      message?: string;
      nodeName?: string;
      cause?: Error;
      context?: Record<string, any>;
    }
  );
  /**
   * Creates an error for invalid input data
   */
  static invalidInput(nodeName: string, details: string, input?: any): GraphDataError;
  /**
   * Creates an error for invalid output data
   */
  static invalidOutput(nodeName: string, details: string, output?: any): GraphDataError;
  /**
   * Creates an error for type mismatch between nodes
   */
  static typeMismatch(sourceNode: string, targetNode: string, details: string): GraphDataError;
}

export {
  type ConnectableNode,
  GraphConfigurationError,
  GraphDataError,
  type GraphDefaultRunnable,
  type GraphEndEvent,
  GraphError,
  GraphErrorCode,
  type GraphEvent,
  GraphExecutionError,
  type GraphNode,
  type GraphNodeEndEvent,
  type GraphNodeHistory,
  type GraphNodeMiddleware,
  type GraphNodeRouter,
  type GraphNodeStartEvent,
  type GraphNodeStreamEvent,
  type GraphNodeStructure,
  type GraphNodeWithOptionalOutput,
  type GraphNodeWithOutOutput,
  type GraphRegistry,
  type GraphResult,
  type GraphRunOptions,
  type GraphRunnable,
  type GraphStartEvent,
  type GraphStore,
  type GraphStoreInitializer,
  type StateGraphRegistry,
  type StateGraphRunnable,
  createGraph,
  createStateGraph,
  graphMergeNode,
  graphNode,
  graphNodeRouter,
  graphStateMergeNode,
  graphStateNode,
  graphStore,
};

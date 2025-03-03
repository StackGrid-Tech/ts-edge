/**
 * Represents a node in the graph with typed input and output
 * @template Name - Unique identifier for the node
 * @template Input - Type of input the node accepts
 * @template Output - Type of output the node produces
 */
export type Node<Name extends string = string, Input = any, Output = any> = {
  /** Unique identifier for the node */
  readonly name: Name;
  /** Type of input that the node accepts */
  input: Input;
  /** Type of output that the node produces, unwrapped if it's a Promise */
  output: Output extends PromiseLike<any> ? Awaited<Output> : Output;
};

/**
 * Extracts the input type of a specific node by its name from a node type collection
 * @template T - Collection of node types
 * @template Name - Name of the node whose input type is being extracted
 */
export type InputOf<T extends Node, Name extends T['name']> = Extract<T, { name: Name }>['input'];

/**
 * Extracts the output type of a specific node by its name from a node type collection
 * @template T - Collection of node types
 * @template Name - Name of the node whose output type is being extracted
 */
export type OutputOf<T extends Node, Name extends T['name'] = T['name']> = Extract<T, { name: Name }>['output'];

/**
 * Modifies a Node type to make its output property optional
 * Used primarily for error cases where a node execution may not complete successfully
 * @template T - The node type to modify
 */
export type NodeWithOptionalOutput<T extends Node> = {
  [K in keyof T]: K extends 'output' ? T[K] | undefined : T[K];
};

/**
 * Represents the execution history of a single node in the graph
 * Contains timing information, execution status, and node details
 * @template T - Type of the node being executed
 */
export type History<T extends Node = Node> = {
  /** Timestamp when node execution started */
  startedAt: number;
  /** Timestamp when node execution ended */
  endedAt: number;
  /** Next node to be executed (if any) */
  nextNode?: T['name'];
  /** Indicates whether the node execution was successful */
  isOk: boolean;
  /** Error information if execution failed */
  error?: Error;
} & (
  | {
      /** Successful execution */
      isOk: true;
      /** Optional error information */
      error?: Error;
      /** The node with its input and output values */
      node: T;
    }
  | {
      /** Failed execution */
      isOk: false;
      /** Error that caused the failure */
      error: Error;
      /** The node with input and possibly partial output */
      node: NodeWithOptionalOutput<T>;
    }
);

/**
 * Event emitted when graph execution begins
 * @template Input - Type of the input data for graph execution
 */
export type GraphStartEvent<Input = any> = {
  /** Unique identifier for this execution */
  executionId: string;
  /** Event type identifier */
  eventType: 'GRAPH_START';
  /** Timestamp when execution started */
  startedAt: number;
  /** Input data for graph execution */
  input: Input;
};

/**
 * Event emitted when graph execution completes, either successfully or with error
 * @template T - Node type
 * @template Output - Output type of the final node
 */
export type GraphEndEvent<T extends Node = Node, Output = any> = {
  /** Unique identifier for this execution */
  executionId: string;
  /** Event type identifier */
  eventType: 'GRAPH_END';
  /** Timestamp when execution started */
  startedAt: number;
  /** Timestamp when execution completed */
  endedAt: number;
  /** Complete history of node executions */
  histories: History<T>[];
} & (
  | {
      /** Indicates graph execution failed */
      isOk: false;
      /** The error that caused the failure */
      error: Error;
      /** Optional partial output (may be undefined if error occurred early) */
      output?: Output;
    }
  | {
      /** Indicates graph executed successfully */
      isOk: true;
      /** Optional error information */
      error?: Error;
      /** Final output of graph execution */
      output: Output;
    }
);

/**
 * Event emitted when a node execution starts
 * @template T - The node type
 */
export type NodeStartEvent<T extends Node = Node> = {
  /** Unique identifier for this execution */
  executionId: string;
  /** Event type identifier */
  eventType: 'NODE_START';
} & Pick<History<T>, 'startedAt' | 'node'>;

/**
 * Event emitted when a node execution completes
 * @template T - The node type
 */
export type NodeEndEvent<T extends Node = Node> = {
  /** Unique identifier for this execution */
  executionId: string;
  /** Event type identifier */
  eventType: 'NODE_END';
} & History<T>;

/**
 * Union type for all graph-related events
 * @template T - The node type
 * @template StartNodeName - Name of the starting node
 * @template EndNodeName - Name of the ending node
 */
export type GraphEvent<T extends Node, StartNodeName extends T['name'], EndNodeName extends T['name']> =
  | GraphStartEvent<InputOf<T, StartNodeName>>
  | GraphEndEvent<T, OutputOf<T, EndNodeName>>
  | NodeStartEvent<T>
  | NodeEndEvent<T>;

/**
 * Utility type that identifies valid nodes that can be connected from a source node
 * Filters node names that can accept the output type of the source node as their input
 * @template T - Collection of node types
 * @template InputNode - The source node from which connections are being determined
 */
export type ConnectableNode<T extends Node, InputNode extends Node> = {
  [ToName in T['name']]: OutputOf<InputNode, InputNode['name']> extends InputOf<T, ToName> ? ToName : never;
}[T['name']];

/**
 * Configuration options for graph execution
 */
export interface RunOptions {
  /** Maximum number of node visits allowed during execution (prevents infinite loops) */
  maxNodeVisits: number;
  /** Timeout duration in milliseconds for the entire graph execution */
  timeout: number;
}

/**
 * Represents the structure of a compiled graph
 * Contains the nodes, edges, and dynamic routing functions
 * @template T - The node type
 */
export interface GraphStructure<T extends Node = Node> {
  /** Map of node names to their processor functions */
  nodes: Map<T['name'], Function>;
  /** Map of node names to their dynamic routing functions */
  routes: Map<T['name'], Function>;
  /** Map of node names to their destination node names */
  edges: Map<T['name'], T['name']>;
}

/**
 * Interface for a compiled graph that can be executed
 * @template T - The node type
 * @template StartNode - Name of the starting node
 * @template EndNode - Name of the ending node
 */
export interface GraphExecutor<
  T extends Node = Node,
  StartNode extends T['name'] = T['name'],
  EndNode extends T['name'] = T['name'],
> {
  /**
   * Returns the structure of the compiled graph
   */
  getStructure(): GraphStructure;

  /**
   * Executes the graph with the given input
   * @param input - The input data for the starting node
   * @param options - Optional configuration for execution
   * @returns output of the final node
   */
  run(input: InputOf<T, StartNode>, options?: Partial<RunOptions>): Promise<OutputOf<T, EndNode>>;

  /**
   * Registers an event handler to receive graph execution events
   * @param handler - Function that will be called with graph events
   */
  addEventListener(handler: (event: GraphEvent<T, StartNode, EndNode>) => any): void;

  /**
   * Removes a previously registered event handler
   * @param handler - The handler function to remove
   */
  removeEventListener(handler: (event: any) => any): void;
}

/**
 * Main interface for building and manipulating a graph
 * Allows adding nodes, creating connections, and compiling the graph for execution
 * @template T - Union of all node types in the graph
 * @template Connected - Union of node names that already have outgoing connections
 */
export interface Graph<T extends Node = never, Connected extends string = never> {
  /**
   * Adds a new node to the graph
   * @param node - The node configuration with name and processor function
   * @returns The graph with the new node added
   */
  addNode<Name extends string = string, Input = any, Output = any>(node: {
    name: Name;
    processor: (input: Input) => Output;
  }): Graph<T | Node<Name, Input, Output>, Connected>;

  /**
   * Creates a direct edge between two nodes
   * @param from - Name of the source node
   * @param to - Name of the destination node
   * @returns The graph with the new edge added
   */
  edge<
    FromName extends Exclude<T['name'], Connected>,
    ToName extends Exclude<ConnectableNode<T, Extract<T, { name: FromName }>>, Extract<T, { name: FromName }>>,
  >(
    from: FromName,
    to: ToName
  ): Graph<T, Connected | FromName>;

  /**
   * Creates a dynamic edge that uses a router function to determine the next node
   * @param from - Name of the source node
   * @param router - Function that determines the next node based on input/output of the source node
   * @returns The graph with the dynamic edge added
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
  ): Graph<T, Connected | FromName>;

  /**
   * Compiles the graph into an executable form
   * @param startNode - Name of the node to start execution from
   * @param endNode - Optional name of the node to end execution at
   * @returns An executor for the compiled graph
   */
  compile<StartName extends T['name'], EndName extends T['name']>(
    startNode: StartName,
    endNode?: EndName
  ): GraphExecutor<T, StartName, EndName>;
}
export type NodeContext = {
  histories: History[];
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
};

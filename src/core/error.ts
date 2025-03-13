// src/errors.ts
/**
 * Error codes with associated default messages for the graph system
 */
export enum GraphErrorCode {
  // Graph Configuration Errors (1000-1999)
  INVALID_NODE_NAME = 'Node name cannot be empty or is invalid',
  DUPLICATE_NODE_NAME = 'Node with this name already exists in the graph',
  NODE_NOT_FOUND = 'Node not found in the graph',
  CIRCULAR_DEPENDENCY = 'Circular dependency detected in graph',
  INVALID_EDGE = 'Invalid edge configuration',
  MISSING_SOURCE_NODE = 'Source node not found for edge',
  DUPLICATE_EDGE = 'Node already has an outgoing connection',
  MERGE_NODE_MISSING_BRANCH = 'Merge node references non-existent source nodes',

  // Runtime Errors (2000-2999)
  MAX_NODE_VISITS_EXCEEDED = 'Maximum node visits exceeded',
  EXECUTION_TIMEOUT = 'Graph execution timed out',
  NODE_EXECUTION_FAILED = 'Node execution failed',
  INVALID_DYNAMIC_EDGE_RESULT = 'Invalid result from dynamic edge router',
  THREAD_POOL_FAILURE = 'Thread pool execution failed',
  EXECUTION_ABORTED = 'Graph execution was aborted',
  MIDDLEWARE_FAIL = 'Error thrown in graph middleware',

  // Data Errors (3000-3999)
  INVALID_INPUT = 'Invalid input data provided',
  INVALID_OUTPUT = 'Node produced invalid output data',
  TYPE_MISMATCH = 'Data type mismatch between nodes',

  // System Errors (9000-9999)
  UNKNOWN_ERROR = 'Unknown error occurred in graph execution',
  EXIT = 'EXIT',
}

/**
 * Base class for all graph-related errors
 */
export class GraphError extends Error {
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
  ) {
    const message = options?.message || code;
    super(message);

    this.code = code;
    this.nodeName = options?.nodeName;
    this.context = options?.context;
    this.cause = options?.cause;
    this.name = 'GraphError';
  }

  /**
   * Creates a string representation of the error with detailed information
   */
  toString(): string {
    let result = `[${this.name}] ${this.message}`;

    if (this.nodeName) {
      result += `\nNode: ${this.nodeName}`;
    }

    if (this.context && Object.keys(this.context).length > 0) {
      result += `\nContext: ${JSON.stringify(this.context, null, 2)}`;
    }

    if (this.cause) {
      result += `\nCaused by: ${this.cause}`;
    }

    return result;
  }

  /**
   * Formats the error with node name if available
   */
  formatWithNode(nodeName?: string): string {
    if (!nodeName && !this.nodeName) return this.message;
    const name = nodeName || this.nodeName;
    return `${this.message} (Node: ${name})`;
  }
}

/**
 * Error thrown during graph configuration
 */
export class GraphConfigurationError extends GraphError {
  constructor(
    code: GraphErrorCode,
    options?: {
      message?: string;
      nodeName?: string;
      cause?: Error;
      context?: Record<string, any>;
    }
  ) {
    super(code, options);
    this.name = 'GraphConfigurationError';
  }

  /**
   * Creates a node not found error
   */
  static nodeNotFound(nodeName: string): GraphConfigurationError {
    return new GraphConfigurationError(GraphErrorCode.NODE_NOT_FOUND, {
      message: `Node "${nodeName}" not found in the graph`,
      nodeName,
    });
  }

  /**
   * Creates a duplicate node error
   */
  static duplicateNode(nodeName: string): GraphConfigurationError {
    return new GraphConfigurationError(GraphErrorCode.DUPLICATE_NODE_NAME, {
      message: `Node with name "${nodeName}" already exists in the graph`,
      nodeName,
    });
  }

  /**
   * Creates an error for a node that already has an edge
   */
  static duplicateEdge(nodeName: string): GraphConfigurationError {
    return new GraphConfigurationError(GraphErrorCode.DUPLICATE_EDGE, {
      message: `Node "${nodeName}" already has an outgoing connection`,
      nodeName,
    });
  }

  /**
   * Creates an error for invalid merge node branch
   */
  static invalidMergeBranch(nodeName: string, missingBranch: string[]): GraphConfigurationError {
    return new GraphConfigurationError(GraphErrorCode.MERGE_NODE_MISSING_BRANCH, {
      message: `Merge node "${nodeName}" references non-existent source node(s): ${missingBranch.join(', ')}`,
      nodeName,
      context: { missingBranch },
    });
  }
}

/**
 * Error thrown during graph execution
 */
export class GraphExecutionError extends GraphError {
  constructor(
    code: GraphErrorCode,
    options?: {
      message?: string;
      nodeName?: string;
      cause?: Error;
      context?: Record<string, any>;
    }
  ) {
    super(code, options);
    this.name = 'GraphExecutionError';
  }

  /**
   * Creates an error for node execution failure
   */
  static nodeExecutionFailed(nodeName: string, error: Error, input?: any): GraphExecutionError {
    return new GraphExecutionError(GraphErrorCode.NODE_EXECUTION_FAILED, {
      message: `Execution of node "${nodeName}" failed: ${error.message}`,
      nodeName,
      cause: error,
      context: input ? { input } : undefined,
    });
  }

  /**
   * Creates an error for execution timeout
   */
  static timeout(timeoutMs: number): GraphExecutionError {
    return new GraphExecutionError(GraphErrorCode.EXECUTION_TIMEOUT, {
      message: `Graph execution timed out after ${timeoutMs}ms`,
      context: { timeoutMs },
    });
  }

  /**
   * Creates an error for maximum node visits exceeded
   */
  static maxVisitsExceeded(nodeName: string, maxVisits: number): GraphExecutionError {
    return new GraphExecutionError(GraphErrorCode.MAX_NODE_VISITS_EXCEEDED, {
      message: `Maximum node visits (${maxVisits}) exceeded for node "${nodeName}"`,
      nodeName,
      context: { maxVisits },
    });
  }

  /**
   * Creates an error for invalid dynamic edge result
   */
  static invalidDynamicEdgeResult(nodeName: string, result: any): GraphExecutionError {
    return new GraphExecutionError(GraphErrorCode.INVALID_DYNAMIC_EDGE_RESULT, {
      message: `Node "${nodeName}" returned invalid dynamic edge result`,
      nodeName,
      context: { result },
    });
  }
}

/**
 * Error thrown for data-related issues
 */
export class GraphDataError extends GraphError {
  constructor(
    code: GraphErrorCode,
    options?: {
      message?: string;
      nodeName?: string;
      cause?: Error;
      context?: Record<string, any>;
    }
  ) {
    super(code, options);
    this.name = 'GraphDataError';
  }

  /**
   * Creates an error for invalid input data
   */
  static invalidInput(nodeName: string, details: string, input?: any): GraphDataError {
    return new GraphDataError(GraphErrorCode.INVALID_INPUT, {
      message: `Invalid input for node "${nodeName}": ${details}`,
      nodeName,
      context: input ? { input } : undefined,
    });
  }

  /**
   * Creates an error for invalid output data
   */
  static invalidOutput(nodeName: string, details: string, output?: any): GraphDataError {
    return new GraphDataError(GraphErrorCode.INVALID_OUTPUT, {
      message: `Invalid output from node "${nodeName}": ${details}`,
      nodeName,
      context: output ? { output } : undefined,
    });
  }

  /**
   * Creates an error for type mismatch between nodes
   */
  static typeMismatch(sourceNode: string, targetNode: string, details: string): GraphDataError {
    return new GraphDataError(GraphErrorCode.TYPE_MISMATCH, {
      message: `Type mismatch between nodes "${sourceNode}" and "${targetNode}": ${details}`,
      context: { sourceNode, targetNode },
    });
  }
}

/**
 * Helper function to wrap a function with error handling
 */
export function wrapWithGraphError<T extends (...args: any[]) => any>(
  fn: T,
  errorFactory: (error: Error) => GraphError
): (...args: Parameters<T>) => ReturnType<T> {
  return ((...args: Parameters<T>) => {
    try {
      return fn(...args);
    } catch (error) {
      throw errorFactory(error instanceof Error ? error : new Error(String(error)));
    }
  }) as (...args: Parameters<T>) => ReturnType<T>;
}

/**
 * Helper function to assert a condition or throw a GraphError
 */
export function assertGraph(condition: boolean, errorFactory: () => GraphError): asserts condition {
  if (!condition) {
    throw errorFactory();
  }
}

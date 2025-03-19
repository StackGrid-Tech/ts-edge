import { GraphRegistry, GraphRegistryContext, StateGraphRegistry } from '../interfaces';
import { createGraphRunnable } from './runable';
import { GraphConfigurationError, GraphErrorCode } from './error';
import { GraphStore, GraphStoreState } from './create-state';
import { safe } from 'ts-safe';
import { isNull } from '../shared';

export const createGraph = (): GraphRegistry => {
  const context: GraphRegistryContext = new Map();

  const validateGraphConnections = () => {
    Array.from(context.entries()).forEach(([nodeName, node]) => {
      // Validate source nodes for merge nodes
      if (node.isMergeNode) {
        const invalidBranch = node.branch.filter((sourceName) => !context.has(sourceName));
        if (invalidBranch.length > 0) {
          throw GraphConfigurationError.invalidMergeBranch(nodeName, invalidBranch);
        }
        node.branch.forEach((branch) => {
          const branchNode = context.get(branch);
          if (!branchNode) return;
          if (branchNode.edge?.type != 'dynamic') {
            const edge = {
              type: 'direct' as const,
              next: Array.from(new Set([...(branchNode.edge?.next ?? []), nodeName])),
            };
            branchNode.edge = edge;
          }
        });
      }
      // Validate target nodes for direct edges
      else if (node.edge?.type === 'direct') {
        const invalidTargets = node.edge.next.filter((targetName) => !context.has(targetName));
        if (invalidTargets.length > 0) {
          throw new GraphConfigurationError(GraphErrorCode.MISSING_SOURCE_NODE, {
            message: `Node "${nodeName}" has direct edge to non-existent node(s): ${invalidTargets.join(', ')}`,
            nodeName,
            context: { invalidTargets },
          });
        }
      }
    });
  };

  const registry: GraphRegistry = {
    addNode({ name, execute, metadata }) {
      // Validate that node name doesn't already exist
      if (context.has(name)) {
        throw GraphConfigurationError.duplicateNode(name);
      }

      context.set(name, {
        execute,
        isMergeNode: false,
        metadata: metadata ?? {},
      });

      return registry as any;
    },

    addMergeNode({ branch, execute, name, metadata }) {
      // Validate that node name doesn't already exist
      if (context.has(name)) {
        throw GraphConfigurationError.duplicateNode(name);
      }

      context.set(name, {
        execute,
        isMergeNode: true,
        branch,
        metadata: metadata ?? {},
      });

      return registry as any;
    },

    edge(from, to) {
      // Validate that source node exists
      const node = context.get(from);
      if (!node) {
        throw GraphConfigurationError.nodeNotFound(from);
      }

      // Validate that node doesn't already have an edge
      if (node.edge) {
        throw GraphConfigurationError.duplicateEdge(from);
      }

      node.edge = {
        type: 'direct',
        next: [to].flat() as string[],
      };

      return registry;
    },

    dynamicEdge(from, router) {
      // Validate that source node exists
      const node = context.get(from);
      if (!node) {
        throw GraphConfigurationError.nodeNotFound(from);
      }

      // Validate that node doesn't already have an edge
      if (node.edge) {
        throw GraphConfigurationError.duplicateEdge(from);
      }

      node.edge = {
        type: 'dynamic',
        next: typeof router == 'function' ? [] : router.possibleTargets,
        router: typeof router == 'function' ? router : router.router,
      };

      return registry;
    },

    compile(start, end) {
      // Validate that start node exists
      if (!context.has(start)) {
        throw GraphConfigurationError.nodeNotFound(start);
      }

      // Validate that end node exists if specified
      if (end && !context.has(end)) {
        throw GraphConfigurationError.nodeNotFound(end);
      }

      // Validate all graph connections
      validateGraphConnections();

      return createGraphRunnable({
        start,
        end,
        registry: context,
      });
    },
  };

  return registry;
};

export const createStateGraph = <T extends GraphStoreState>(store: GraphStore<T>): StateGraphRegistry<T> => {
  const registry = createGraph();

  const originAddNode = registry.addNode;
  const originAddMergeNode = registry.addMergeNode;
  const originCompile = registry.compile;

  registry.addNode = (node) => {
    originAddNode({
      ...node,
      execute: (_, context) => {
        return safe(() => (node.execute as Function)(store.get(), context))
          .map(() => store.get())
          .unwrap();
      },
    });
    return registry as any;
  };

  registry.addMergeNode = (node) => {
    originAddMergeNode({
      ...node,
      execute: (inputs, context) => {
        return safe(() => node.execute(inputs, context))
          .map(() => store.get())
          .unwrap();
      },
    });
    return registry as any;
  };

  registry.compile = (start, end) => {
    const runnable = originCompile(start, end);
    const originalRun = runnable.run as Function;
    runnable.run = (input, options) => {
      if (!(options as any)?.noResetState) store.reset();
      if (!isNull(input)) store.set(input);
      return originalRun(undefined, options);
    };
    return runnable as any;
  };

  return registry as StateGraphRegistry<T>;
};

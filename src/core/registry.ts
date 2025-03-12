import { GraphRegistry, GraphRegistryContext } from '../interfaces';
import { createGraphRunnable } from './runable';
import { GraphConfigurationError, GraphErrorCode } from './error';

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
    addNode({ name, execute, description }) {
      // Validate that node name doesn't already exist
      if (context.has(name)) {
        throw GraphConfigurationError.duplicateNode(name);
      }

      context.set(name, {
        execute,
        isMergeNode: false,
        description,
      });

      return registry as any;
    },

    addMergeNode({ branch, execute, name, description }) {
      // Validate that node name doesn't already exist
      if (context.has(name)) {
        throw GraphConfigurationError.duplicateNode(name);
      }

      context.set(name, {
        execute,
        isMergeNode: true,
        branch,
        description,
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

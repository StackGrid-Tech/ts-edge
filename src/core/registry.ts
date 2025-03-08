import { GraphRegistry, GraphRegistryContext } from '../interfaces';
import { createGraphRunnable } from './runable';
import { GraphConfigurationError, GraphErrorCode } from './error';

export const createGraph = (): GraphRegistry => {
  const context: GraphRegistryContext = new Map();

  const validateGraphConnections = () => {
    Array.from(context.entries()).forEach(([nodeName, node]) => {
      // Validate source nodes for merge nodes
      if (node.isMergeNode) {
        const invalidSources = node.sources.filter((sourceName) => !context.has(sourceName));
        if (invalidSources.length > 0) {
          throw GraphConfigurationError.invalidMergeSources(nodeName, invalidSources);
        }
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
    addNode(node) {
      // Validate that node name doesn't already exist
      if (context.has(node.name)) {
        throw GraphConfigurationError.duplicateNode(node.name);
      }

      context.set(node.name, {
        execute: node.execute,
        isMergeNode: false,
      });

      return registry;
    },

    addMergeNode(node) {
      // Validate that node name doesn't already exist
      if (context.has(node.name)) {
        throw GraphConfigurationError.duplicateNode(node.name);
      }

      context.set(node.name, {
        execute: node.execute,
        isMergeNode: true,
        sources: node.sources,
      });

      return registry;
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
        next: router,
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

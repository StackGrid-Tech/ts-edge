import { GraphRegistry, GraphRegistryContext } from '../interfaces';
import { createGraphRunnable } from './runable';

export const createGraph = (): GraphRegistry => {
  const context: GraphRegistryContext = new Map();

  const validNodeEdge = () => {
    Array.from(context.entries()).forEach(([nodeName, node]) => {
      if (node.isMergeNode) {
        const invalidSources = node.sources.filter((sourceName) => !context.has(sourceName));
        if (invalidSources.length > 0) {
          throw new Error(
            `Merge node "${nodeName}" references non-existent source node(s): ${invalidSources.join(', ')}`
          );
        }
      } else if (node.edge?.type == 'direct') {
        const invalidTargets = node.edge.next.filter((targetName) => !context.has(targetName));
        if (invalidTargets.length > 0) {
          throw new Error(`Node "${nodeName}" has direct edge to non-existent node(s): ${invalidTargets.join(', ')}`);
        }
      }
    });
  };
  const registry: GraphRegistry = {
    addNode(node) {
      if (context.has(node.name)) {
        throw new Error(`Node with name "${node.name}" already exists in the graph`);
      }
      context.set(node.name, {
        execute: node.execute,
        isMergeNode: false,
      });
      return registry;
    },
    addMergeNode(node) {
      if (context.has(node.name)) {
        throw new Error(`Node with name "${node.name}" already exists in the graph`);
      }
      context.set(node.name, {
        execute: node.execute,
        isMergeNode: true,
        sources: node.sources,
      });
      return registry;
    },
    edge(from, to) {
      const node = context.get(from);
      if (!node) {
        throw new Error(`Node "${from}" not Define`);
      }
      if (node.edge) {
        throw new Error(`Node "${from}" already has an outgoing connection`);
      }
      node.edge = {
        type: 'direct',
        next: [to].flat() as string[],
      };
      return registry;
    },
    dynamicEdge(from, router) {
      const node = context.get(from);
      if (!node) {
        throw new Error(`Node "${from}" not Define`);
      }
      if (node.edge) {
        throw new Error(`Node "${from}" already has an outgoing connection`);
      }
      node.edge = {
        type: 'dynamic',
        next: router,
      };
      return registry;
    },
    compile(start, end) {
      validNodeEdge();
      return createGraphRunnable({
        start,
        end,
        registry: context,
      });
    },
  };
  return registry;
};

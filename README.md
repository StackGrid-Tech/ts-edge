# ts-edge

A powerful, type-safe workflow orchestration library for TypeScript that enables you to create, connect, and execute graph-based workflows with full type inference.

## Features

- **Type-safe Node Connections**: All node connections are validated at compile time
- **Flexible Workflow Design**: Create simple linear workflows or complex conditional branching
- **Dynamic Routing**: Route workflow execution based on node outputs
- **Hooks System**: Attach auxiliary workflows to monitor and react to main workflow execution
- **Comprehensive Event System**: Subscribe to workflow and node execution events
- **Error Handling**: Graceful error management with full execution history
- **Async Support**: First-class support for asynchronous node executes
- **Execution Control**: Timeouts and maximum node visit limits to prevent infinite loops

## Installation

```bash
npm install ts-edge
```

## Basic Usage

Here's a simple example to get you started:

```typescript
import { createGraph } from 'ts-edge';

// Create a workflow definition
const workflow = createGraph()
  .addNode({
    name: 'input',
    execute: (input: string) => input.toUpperCase(),
  })
  .addNode({
    name: 'transform',
    execute: (input: string) => `Processed: ${input}`,
  })
  .addNode({
    name: 'output',
    execute: (input: string) => ({ result: input }),
  })
  .edge('input', 'transform')
  .edge('transform', 'output');

// Compile the workflow to create a runnable app
const app = workflow.compile('input', 'output'); 

// Execute the workflow
app.run('hello world').then((result) => {
  console.log(result.output); // { result: 'Processed: HELLO WORLD' }
});
```

## Core Concepts

### Nodes

A node is the basic building block of a workflow. Each node has:

- A unique name
- An input type
- An output type
- A execute function that transforms input to output

```typescript
// You can define nodes directly in addNode
workflow.addNode({
  name: 'myNode',
  execute: (input: number) => input * 2,
});

// Or use the node() helper for pre-defining nodes in separate files
import { node } from 'ts-edge';

// This can be useful for organizing complex workflows
export const myReusableNode = node({
  name: 'myNode',
  execute: (input: number) => input * 2,
});
```

### Edges

Edges connect nodes together, defining the flow of data through your workflow:

```typescript
// Static edge from nodeA to nodeB
workflow.edge('nodeA', 'nodeB');

// Dynamic edge that returns just the next node name
workflow.dynamicEdge('nodeA', ({ output }) => {
  return output > 10 ? 'largeValueNode' : 'smallValueNode';
});

// Dynamic edge that customizes the input for the next node
workflow.dynamicEdge('nodeA', ({ output }) => {
  return {
    name: output > 10 ?'nodeB':'nodeC',
    input: output * 2,
  };
});
```

### Node Routers

For complex routing logic, you can define router functions separately and reuse them:

```typescript
import { GraphNodeRouter } from 'ts-edge';

// Define a reusable router
const myRouter = GraphNodeRouter((node) => {
  return node.output > 10 ? 'largeValueNode' : 'smallValueNode';
});

// Use in workflow
workflow.dynamicEdge('nodeA', myRouter);
```

For flexibility with pre-defined routers, use the loosely typed version:


### Workflow Compilation

After defining your nodes and edges, compile the workflow to create an executable app:

```typescript
// Basic usage with defined start and end nodes
const app = workflow.compile('startNode', 'endNode');

// End node is optional - nodes without outgoing edges will automatically complete the workflow
const app = workflow.compile('startNode');
```

When no end node is specified, any node without outgoing edges is treated as a potential end point. This allows for more flexible workflow designs where multiple paths can lead to different completion points.

### Workflow Execution

Run your workflow with a specific input:

```typescript
const result = await app.run(initialInput, {
  timeout: 30000, // Maximum execution time (ms)
  maxNodeVisits: 100, // Prevent infinite loops
});

if (result.isOk) {
  console.log('Success:', result.output);
} else {
  console.error('Error:', result.error);
}
```

### Hooks

Hooks let you attach auxiliary workflows that run in response to node execution:

```typescript
// Create the main workflow definition
const workflow = createGraph().addNode({
  name: 'main',
  execute: (input: number) => input * 2,
});

// Compile the workflow to create a runnable app
const app = workflow.compile('main');

// Create a hook from the compiled app
const hook = app.attachHook('main').addNode({
  name: 'hook',
  execute: (input: number) => input + 5,
});

// Compile the hook to create a connector
const connector = hook.compile('hook');

// Connect the hook with a result handler
connector.connect({
  onResult: (result) => {
    console.log('Hook result:', result.output);
  },
});
```

## Event System

Subscribe to workflow events to monitor execution:

```typescript
app.subscribe((event) => {
  switch (event.eventType) {
    case 'WORKFLOW_START':
      console.log('Workflow started with input:', event.input);
      break;
    case 'NODE_START':
      console.log('Node started:', event.node.name);
      break;
    case 'NODE_END':
      console.log('Node ended:', event.node.name, 'Output:', event.node.output);
      break;
    case 'WORKFLOW_END':
      console.log('Workflow ended. Success:', event.isOk);
      break;
  }
});
```

## License

MIT
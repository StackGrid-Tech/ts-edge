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
import { createGraph, node } from 'ts-edge';

// Create a workflow definition
const workflow = createGraph()
  .addNode({
    name: 'input',
    execute: (input: string) => input.toUpperCase()
  })
  .addNode({
    name: 'transform',
    execute: (input: string) => `Processed: ${input}`
  })
  .addNode({
    name: 'output',
    execute: (input: string) => ({ result: input })
  })
  .edge('input', 'transform')
  .edge('transform', 'output');

// Compile the workflow to create a runnable app
const app = workflow.compile('input', 'output');

// Execute the workflow
app.run('hello world')
  .then(result => {
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
  execute: (input: number) => input * 2
});

// Or use the node() helper for pre-defining nodes in separate files
import { node } from 'ts-edge';

// This can be useful for organizing complex workflows
export const myReusableNode = node({
  name: 'myNode',
  execute: (input: number) => input * 2
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
    name: 'processingNode',
    input: { 
      originalValue: output,
      processedValue: output * 2,
      timestamp: Date.now()
    }
  };
});
```

### Workflow Compilation

After defining your nodes and edges, compile the workflow to create an executable app:

```typescript
const app = workflow.compile('startNode', 'endNode');
```

### Workflow Execution

Run your workflow with a specific input:

```typescript
const result = await app.run(initialInput, {
  timeout: 30000,          // Maximum execution time (ms)
  maxNodeVisits: 100       // Prevent infinite loops
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
const workflow = createGraph()
  .addNode({
    name: 'main',
    execute: (input: number) => input * 2
  });

// Compile the workflow to create a runnable app
const app = workflow.compile('main');

// Create a hook from the compiled app
const hook = app.attachHook('main')
  .addNode({
    name: 'hook',
    execute: (input: number) => input + 5
  });

// Compile the hook to create a connector
const connector = hook.compile('hook');

// Connect the hook with a result handler
connector.connect({
  onResult: (result) => {
    console.log('Hook result:', result.output);
  }
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

## Advanced Examples

### Conditional Branching with Custom Input

```typescript
const workflow = createGraph()
  .addNode({
    name: 'input',
    execute: (input: { value: number; metadata: any }) => ({
      value: input.value,
      timestamp: Date.now(),
      metadata: input.metadata
    })
  })
  .addNode({
    name: 'processHigh',
    execute: (input: { original: number; category: string }) => 
      `Value ${input.original} is categorized as ${input.category}`
  })
  .addNode({
    name: 'processLow',
    execute: (input: { original: number; category: string }) => 
      `Value ${input.original} is categorized as ${input.category}`
  })
  .addNode({
    name: 'output',
    execute: (input: string) => ({ message: input })
  })
  // Dynamic edge with custom input transformation
  .dynamicEdge('input', ({ output }) => {
    const category = output.value > 50 ? 'high' : 'low';
    const targetNode = output.value > 50 ? 'processHigh' : 'processLow';
    
    return {
      name: targetNode,
      input: {
        original: output.value,
        category: category,
        // We can also pass through additional metadata if needed
        metadata: output.metadata
      }
    };
  })
  .edge('processHigh', 'output')
  .edge('processLow', 'output');

const app = workflow.compile('input', 'output');


```typescript
const workflow = createGraph()
  .addNode({
    name: 'input',
    execute: (input: number) => input
  })
  .addNode({
    name: 'processEven',
    execute: (input: number) => `${input} is even`
  })
  .addNode({
    name: 'processOdd',
    execute: (input: number) => `${input} is odd`
  })
  .addNode({
    name: 'output',
    execute: (input: string) => input
  })
  .dynamicEdge('input', ({ output }) => 
    output % 2 === 0 ? 'processEven' : 'processOdd'
  )
  .edge('processEven', 'output')
  .edge('processOdd', 'output');

const app = workflow.compile('input', 'output');
```

### Data Transformation Workflow

```typescript
interface UserData {
  name: string;
  age: number;
}

const workflow = createGraph()
  .addNode({
    name: 'validate',
    execute: (input: UserData) => {
      if (!input.name) throw new Error('Name is required');
      if (input.age < 0) throw new Error('Age must be positive');
      return input;
    }
  })
  .addNode({
    name: 'transform',
    execute: (input: UserData) => ({
      displayName: input.name.toUpperCase(),
      isAdult: input.age >= 18,
      ageCategory: input.age < 18 ? 'minor' : 'adult'
    })
  })
  .edge('validate', 'transform');

const app = workflow.compile('validate', 'transform');

// Run with validation error
app.run({ name: '', age: 25 })
  .then(result => {
    console.log(result.isOk); // false
    console.log(result.error); // Error: Name is required
  });

// Run with valid data
app.run({ name: 'John', age: 25 })
  .then(result => {
    console.log(result.isOk); // true
    console.log(result.output); // { displayName: 'JOHN', isAdult: true, ageCategory: 'adult' }
  });
```

## Testing

The library includes a comprehensive test suite. To run the tests:

```bash
npm test
```

Example test snippet:

```typescript
test('should run a simple workflow', async () => {
  const workflow = createGraph()
    .addNode({
      name: 'start',
      execute: (input: number) => input * 2
    })
    .addNode({
      name: 'end',
      execute: (input: number) => input + 10
    })
    .edge('start', 'end');
  
  const app = workflow.compile('start', 'end');
  const result = await app.run(5);
  
  expect(result.isOk).toBe(true);
  expect(result.output).toBe(20); // (5 * 2) + 10
});
```

## API Reference

### Core Functions

#### `createGraph()`
Creates a new workflow registry for building workflows.

#### `node({ name, execute })` (Optional)
Helper function to pre-define nodes that can be imported from separate files. Useful for organizing complex workflows into smaller parts, but using `addNode()` directly is also fine for most cases.

### Workflow Methods

#### `addNode({ name, execute })`
Adds a node to the workflow directly.

#### `edge(fromNode, toNode)`
Creates a static edge between two nodes.

#### `dynamicEdge(fromNode, routerFunction)`
Creates a dynamic edge using a router function. The router can return a node name or an object with `{ name, input }`.

#### `compile(startNode, endNode?)`
Compiles the workflow into an executable app.

### App Methods

#### `run(input, options?)`
Runs the workflow with the given input and options.

#### `subscribe(handler)`
Subscribes to workflow events.

#### `unsubscribe(handler)`
Unsubscribes from workflow events.

#### `attachHook(entryPoint)`
Attaches a hook to a specific node in the workflow. Returns a hook registry.

### Hook Registry Methods

#### `addNode({ name, execute })`
Adds a node to the hook workflow.

#### `edge(fromNode, toNode)`
Creates a static edge between two nodes in the hook workflow.

#### `dynamicEdge(fromNode, routerFunction)`
Creates a dynamic edge in the hook workflow.

#### `compile(startNode, endNode?)`
Compiles the hook workflow into a connector.

### Connector Methods

#### `connect(options?)`
Connects the hook to the main workflow.

#### `disconnect()`
Disconnects the hook from the main workflow.

## License

MIT
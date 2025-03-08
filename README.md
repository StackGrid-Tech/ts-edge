# 🔗 ts-edge 🔗

English | [한국어](./docs/kr.md)

A lightweight, type-safe workflow engine for TypeScript that helps you create flexible, reusable graph-based execution flows. Inspired by directed graph execution patterns in AI systems and data pipelines, ts-edge provides a simple yet powerful framework for defining complex computational workflows with robust type safety.

With ts-edge, you can model your business logic as a series of interconnected nodes, each processing data and passing results to the next stage. This approach brings clarity to complex processes, enables better organization of code, and facilitates powerful patterns like conditional branching, parallel processing, and result merging.

## Quick Start

![Reasoning Acting](./docs/simple.png)

```typescript
import { createGraph } from 'ts-edge';

// Define a simple AI agent workflow
const workflow = createGraph()
  .addNode({
    name: 'input',
    execute: (query: string) => ({ query })
  })
  .addNode({
    name: 'reasoning',
    execute: (data) => {
      const isComplex = data.query.length > 20;
      return { ...data, isComplex };
    }
  })
  .addNode({
    name: 'acting',
    execute: (data) => {
      return { ...data, result: `Performed action for: ${data.query}` };
    }
  })
  .addNode({
    name: 'output',
    execute: (data) => {
      return { answer: data.result || `Simple answer for: ${data.query}` };
    }
  })
  .edge('input', 'reasoning')
  .dynamicEdge('reasoning', (data) => {
    return data.isComplex ? 'acting' : 'output';
  })
  .edge('acting', 'output');

// Compile and run the workflow
const app = workflow.compile('input', 'output');
const result = await app.run('What is the weather today?');
console.log(result.output); // { answer: "Simple answer for: What is the weather today?" }
```



## Overview

ts-edge lets you define computational workflows as directed graphs, where:
- **Nodes** process data and produce output
- **Edges** define the flow between nodes
- **Dynamic routing** makes decisions based on node outputs
- **Parallel execution** and **merge nodes** enable complex patterns

Perfect for:
- AI agent workflows
- ETL pipelines
- Business process automation
- Multi-step data processing


## Installation

```bash
npm install ts-edge
```

## Key Features

### Basic Node and Edge Definition

Nodes process input and produce output. Edges define the flow between nodes.

```typescript
const workflow = createGraph()
  .addNode({
    name: 'nodeA',
    execute: (input) => ({ value: input * 2 })
  })
  .addNode({
    name: 'nodeB',
    execute: (input) => ({ result: input.value + 10 })
  })
  .edge('nodeA', 'nodeB');
```

### Creating Reusable Nodes with `graphNode`

For better organization and reusability, you can define nodes separately using the `graphNode` helper:

```typescript
import { graphNode } from 'ts-edge';

// Define reusable nodes in a separate file
export const fetchUserNode = graphNode({
  name: 'fetchUser',
  execute: async (userId: string) => {
    const user = await userService.getUser(userId);
    return { user };
  }
});

export const validateUserNode = graphNode({
  name: 'validateUser',
  execute: (data: { user: User }) => {
    const isValid = data.user.status === 'active';
    return { ...data, isValid };
  }
});

// Then use them in your workflow
const workflow = createGraph()
  .addNode(fetchUserNode)
  .addNode(validateUserNode)
  .edge('fetchUser', 'validateUser');
```

The `graphNode` helper provides better type inference for your nodes.

### Dynamic Routing with `graphNodeRouter`

For type-safe dynamic routing, you can use the `graphNodeRouter` helper:

```typescript
import { graphNodeRouter } from 'ts-edge';

const userRouter = graphNodeRouter((data) => {
  if (data.isValid) {
    return 'processValidUser';
  } else {
    return {
      name: 'handleInvalidUser',
      input: { userId: data.user.id, reason: 'User is not active' }
    };
  }
});

workflow.dynamicEdge('validateUser', userRouter);
```

This approach keeps your routing logic organized and enables better type checking.

### Dynamic Routing

Make execution decisions based on node outputs:

```typescript
workflow.dynamicEdge('processData', (data) => {
  if (data.value > 100) return 'highValueProcess';
  if (data.value < 0) return 'errorHandler';
  return 'standardProcess';
});
```

You can also pass modified input to the next node:

```typescript
workflow.dynamicEdge('analyze', (data) => {
  return {
    name: 'process',
    input: { ...data, priority: data.score > 0.8 ? 'high' : 'normal' }
  };
});
```

### Parallel Processing with Merge Nodes

![parallel](./docs/parallel.png)

Process data in parallel branches and merge the results:

```typescript
const workflow = createGraph()
  .addNode({
    name: 'fetchData',
    execute: (query) => ({ query })
  })
  .addNode({
    name: 'processBranch1',
    execute: (data) => ({ summary: summarize(data.query) })
  })
  .addNode({
    name: 'processBranch2',
    execute: (data) => ({ details: getDetails(data.query) })
  })
  .addMergeNode({
    name: 'combineResults',
    sources: ['processBranch1', 'processBranch2'],
    execute: (inputs) => ({
      result: {
        summary: inputs.processBranch1.summary,
        details: inputs.processBranch2.details
      }
    })
  })
  .edge('fetchData', ['processBranch1', 'processBranch2']);
```

### Execution Options

Control the behavior of your workflows:

```typescript
const result = await app.run(input, {
  timeout: 5000,            // Maximum execution time in ms
  maxNodeVisits: 50,        // Prevent infinite loops
});
```

### Start and End Nodes

When compiling a workflow, you specify:
- A required **start node** where execution begins
- An optional **end node** where execution stops

```typescript
// Both start and end nodes specified
const app = workflow.compile('inputNode', 'outputNode');

// Only start node specified - runs until a node with no outgoing edges
const app = workflow.compile('inputNode');
```

When an end node is specified, the workflow returns that node's output. Otherwise, it returns the output of the last executed node.

### Event Subscription

Monitor workflow execution with events:

```typescript
app.subscribe((event) => {
  if (event.eventType === 'NODE_START') {
    console.log(`Starting node: ${event.node.name}`);
  }
});
```

## Error Handling

ts-edge provides a robust error handling system:

```typescript
  const result = await app.run(input);
  if (result.isOk) {
    console.log(result.output)
  }else {
      console.error(result.error);
  }
```


## License

MIT
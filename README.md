# Graph

A powerful workflow orchestration system that allows you to build and execute complex processing pipelines with clear separation of concerns, strong typing, and robust error handling.

## Introduction

The Graph module lets you model complex workflows as a series of connected nodes, where each node performs a specific operation. This approach brings several benefits:

- **Separation of Concerns**: Each node has a single responsibility
- **Reusability**: Nodes can be reused across different workflows
- **Testability**: Individual nodes can be tested in isolation
- **Visualization**: Workflow structure can be easily visualized
- **Maintainability**: Graph structure makes dependencies explicit

## Key Concepts

- **Node**: A processing unit that takes an input and produces an output
- **Edge**: A type-safe connection between nodes that defines the flow of data
- **Dynamic Edge**: A conditional connection that determines the next node at runtime
- **Graph**: A collection of nodes and edges that form a workflow
- **Executor**: An engine that runs a compiled graph with specific input

## Getting Started

```typescript
import { createGraph, node } from 'ts-graph';
```

## Basic Usage

Let's build a simple user registration workflow:

```typescript
// Create and compile the graph with inline node definitions
const userRegistration = createGraph()
  // Define nodes directly in the graph
  .addNode({
    name: 'validate',
    processor: (userData) => {
      if (!userData.email) throw new Error('Email is required');
      if (!userData.password) throw new Error('Password is required');
      return userData;
    }
  })
  .addNode({
    name: 'hashPassword',
    processor: async (userData) => {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      return { ...userData, password: hashedPassword };
    }
  })
  .addNode({
    name: 'saveUser',
    processor: async (userData) => {
      const user = await db.users.create(userData);
      return user.id;
    }
  })
  .addNode({
    name: 'sendEmail',
    processor: async (userId) => {
      const user = await db.users.findById(userId);
      await emailService.sendWelcomeEmail(user.email);
      return { success: true, userId };
    }
  })
  // Connect nodes with type-safe edges
  .edge('validate', 'hashPassword')
  .edge('hashPassword', 'saveUser')
  .edge('saveUser', 'sendEmail')
  .compile('validate');

// Execute the graph
try {
  const result = await userRegistration.run({
    email: 'user@example.com',
    password: 'secure123',
    name: 'John Doe'
  });
  
  console.log('Registration complete:', result);
} catch (error) {
  console.error('Registration failed:', error.message);
}
```

## Advanced Features

### Dynamic Routing

You can create conditional paths in your graph using `dynamicEdge`, with two powerful return options:

```typescript
const paymentGraph = createGraph()
  .addNode({
    name: 'validatePayment',
    processor: (payment) => {
      // Validation logic
      return payment;
    }
  })
  .addNode({
    name: 'processCreditCard',
    processor: (payment) => processWithStripe(payment)
  })
  .addNode({
    name: 'processPayPal',
    processor: (payment) => processWithPayPal(payment)
  })
  .addNode({
    name: 'applyDiscount',
    processor: (payment) => {
      // Apply special discount
      return { ...payment, amount: payment.amount * 0.9 };
    }
  })
  .addNode({
    name: 'completeOrder',
    processor: (paymentResult) => finalizeOrder(paymentResult)
  })
  // Choose processor based on payment method
  .dynamicEdge('validatePayment', (result) => {
    // Option 1: Return just the node name (uses original output as input)
    if (result.output.method === 'credit_card') {
      return 'processCreditCard';
    } 
    // Option 2: Return node name and custom input (allows transformation)
    else if (result.output.method === 'paypal') {
      // For PayPal payments, always apply discount first
      return {
        name: 'applyDiscount',
        input: {
          ...result.output,
          promotion: 'PAYPAL_SPECIAL'
        }
      };
    } else {
      throw new Error('Unsupported payment method');
    }
  })
  .edge('processCreditCard', 'completeOrder')
  .edge('applyDiscount', 'processPayPal')
  .edge('processPayPal', 'completeOrder')
  .compile('validatePayment');

// Run the graph
const result = await paymentGraph.run({
  amount: 99.99,
  method: 'credit_card',
  details: { /* card details */ }
});
```

### Event Listeners

You can monitor the execution of your graph using event listeners:

```typescript
const executor = workflow.compile('startNode');

// Add an event listener
executor.addEventListener((event) => {
  if (event.eventType === 'NODE_START') {
    console.log(`Starting node: ${event.node.name}`);
  } else if (event.eventType === 'NODE_END') {
    if (event.isOk) {
      console.log(`Node ${event.node.name} completed successfully`);
    } else {
      console.error(`Node ${event.node.name} failed: ${event.error.message}`);
    }
  } else if (event.eventType === 'GRAPH_END') {
    console.log(`Graph execution completed in ${event.endedAt - event.startedAt}ms`);
  }
});

// Execute the graph
const result = await executor.run(inputData);
```

### Timeout and Execution Limits

You can set limits to prevent infinite loops or long-running executions:

```typescript
const result = await executor.run(inputData, {
  timeout: 30000,       // Maximum execution time (30 seconds)
  maxNodeVisits: 100    // Maximum number of node visits (prevents infinite loops)
});
```

## Practical Examples

### Data Processing Pipeline

```typescript
const dataPipeline = createGraph()
  .addNode(node({
    name: 'fetchData',
    processor: async (source) => fetchFromAPI(source)
  }))
  .addNode(node({
    name: 'transform',
    processor: (data) => transformData(data)
  }))
  .addNode(node({
    name: 'validate',
    processor: (data) => validateData(data)
  }))
  .addNode(node({
    name: 'saveToDatabase',
    processor: async (data) => saveData(data)
  }))
  .addNode(node({
    name: 'generateReport',
    processor: async (result) => createReport(result)
  }))
  .edge('fetchData', 'transform')
  .edge('transform', 'validate')
  .edge('validate', 'saveToDatabase')
  .edge('saveToDatabase', 'generateReport')
  .compile('fetchData');

// Run the pipeline
const report = await dataPipeline.run('https://api.example.com/data');
```

### Order Processing System

```typescript
const orderSystem = createGraph()
  // Define nodes
  .addNode(node({
    name: 'validateOrder',
    processor: (order) => validateOrderData(order)
  }))
  .addNode(node({
    name: 'checkInventory',
    processor: async (order) => checkItemsAvailability(order)
  }))
  .addNode(node({
    name: 'processPayment',
    processor: async (order) => chargeCustomer(order)
  }))
  .addNode(node({
    name: 'updateInventory',
    processor: async (order) => reduceInventoryLevels(order)
  }))
  .addNode(node({
    name: 'createShipment',
    processor: async (order) => scheduleShipment(order)
  }))
  .addNode(node({
    name: 'sendNotification',
    processor: async (order) => notifyCustomer(order)
  }))
  
  // Define edges
  .edge('validateOrder', 'checkInventory')
  .edge('checkInventory', 'processPayment')
  .edge('processPayment', 'updateInventory')
  .edge('updateInventory', 'createShipment')
  .edge('createShipment', 'sendNotification')
  
  // Add conditional routing
  .dynamicEdge('checkInventory', (result) => {
    const order = result.output;
    if (order.items.some(item => item.backorder)) {
      // Handle special case for backordered items
      return { 
        name: 'processBackorder',
        input: { ...order, isBackorder: true }
      };
    }
    return 'processPayment';
  })
  
  // Compile the graph
  .compile('validateOrder');

// Process an order
const orderResult = await orderSystem.run({
  orderId: 'ORD-12345',
  customerId: 'CUST-789',
  items: [
    { id: 'PROD-001', quantity: 2, price: 29.99 },
    { id: 'PROD-005', quantity: 1, price: 49.99 }
  ],
  shippingAddress: {
    // Address details
  },
  paymentMethod: {
    // Payment details
  }
});
```

## Type Safety

The Graph module leverages TypeScript to provide exceptional type safety throughout your workflow:

### Type-Safe Edge Connections

One of the most powerful features of SafeChain's Graph is its ability to enforce type compatibility between connected nodes:

```typescript
interface UserData {
  email: string;
  password: string;
}

interface HashedUserData extends UserData {
  password: string; // Now contains a hashed password
}

// Type definitions for clarity
// Using node is optional but useful for separate node definitions
const validateNode = node<'validate', UserData, UserData>({
  name: 'validate',
  processor: (userData) => {
    if (!userData.email) throw new Error('Email is required');
    return userData;
  }
});

// Build the graph with inline node definitions (more common approach)
const userRegistration = createGraph()
  .addNode({
    name: 'validate',
    processor: (userData: UserData) => {
      if (!userData.email) throw new Error('Email is required');
      return userData;
    }
  })
  .addNode({
    name: 'hashPassword',
    processor: async (userData: UserData): Promise<HashedUserData> => {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      return { ...userData, password: hashedPassword };
    }
  })
  .edge('validate', 'hashPassword') // Type-safe connection
  .compile('validate');
```

The TypeScript compiler will prevent you from:
- Creating duplicate edges from the same source node
- Connecting nodes where the output type doesn't match the required input type
- Using node names that don't exist in the graph

This type safety catches potential errors at compile time rather than runtime.

## API Reference

### createGraph()

Creates a new graph builder.

### node()

Creates a reusable node definition with a name and processor function. This is mostly useful for defining nodes in separate files or creating reusable node libraries.

```typescript
node<Name extends string, Input, Output>({
  name: Name;
  processor: (input: Input) => Output | Promise<Output>;
})
```

> **Note**: While `node()` is useful for separating node definitions, it's often simpler to define nodes directly with `.addNode()` when building a graph.

### Methods on createGraph

#### addNode()

Adds a node to the graph.

```typescript
addNode<Name extends string, Input, Output>(node: {
  name: Name;
  processor: (input: Input) => Output;
}): createGraph
```

#### edge()

Creates a direct connection between two nodes. TypeScript enforces that:
- The source node exists and doesn't already have an outgoing connection
- The destination node exists and can accept the output type of the source node

```typescript
edge<FromName extends string, ToName extends string>(
  from: FromName,
  to: ToName
): createGraph
```

#### dynamicEdge()

Creates a conditional connection that determines the next node at runtime.

```typescript
dynamicEdge<FromName extends string>(
  from: FromName,
  router: (result: {
    input: any;
    output: any;
  }) => 
    | string               // Just the next node name (uses original output as input)
    | { name: string; input: any }  // Next node name with custom input
    | null                 // No next node (end of flow)
): createGraph
```

#### compile()

Compiles the graph into an executable form.

```typescript
compile<StartName extends string, EndName extends string>(
  startNode: StartName,
  endNode?: EndName
): GraphExecutor
```

### Methods on GraphExecutor

#### run()

Executes the graph with the given input.

```typescript
run(input: any, options?: {
  timeout?: number;
  maxNodeVisits?: number;
}): SafeChain<Promise<any>>
```

#### addEventListener()

Registers an event listener for graph execution events.

```typescript
addEventListener(handler: (event: GraphEvent) => any): void
```

#### removeEventListener()

Removes a previously registered event listener.

```typescript
removeEventListener(handler: (event: GraphEvent) => any): void
```

#### getStructure()

Returns the structure of the compiled graph.

```typescript
getStructure(): GraphStructure
```
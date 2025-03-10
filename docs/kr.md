# 🔗 ts-edge 🔗

타입스크립트를 위한 경량화된 workflow 엔진으로, 복잡한 설정 없이 타입 안전성이 보장된 그래프 기반 실행 흐름을 만들 수 있습니다.

## 특징

- **가벼움**: 최소한의 API와 옵션으로 빠르게 배우고 적용할 수 있습니다
- **고급 타입 추론**: 컴파일 타임에 node 간 입출력 타입 호환성을 검증하여 안전한 연결을 보장합니다
- **간결한 API**: 꼭 필요한 기능만 제공하여 쉽게 사용 가능합니다
- **유연한 workflow**: 조건부 분기, 병렬 처리, 결과 병합 등 다양한 패턴을 지원합니다

## 빠른 시작

![Reasoning Acting](./simple.png)

```typescript
import { createGraph } from 'ts-edge';

// 간단한 AI 에이전트 workflow 정의
const workflow = createGraph()
  .addNode({
    name: 'input',
    execute: (query: string) => ({ query }),
  })
  .addNode({
    name: 'reasoning',
    execute: (data) => {
      const isComplex = data.query.length > 20;
      return { ...data, isComplex };
    },
  })
  .addNode({
    name: 'acting',
    execute: (data) => {
      return { ...data, result: `다음에 대한 작업 수행: ${data.query}` };
    },
  })
  .addNode({
    name: 'output',
    execute: (data) => {
      return { answer: data.result || `간단한 답변: ${data.query}` };
    },
  })
  .edge('input', 'reasoning')
  .dynamicEdge('reasoning', (data) => {
    return data.isComplex ? 'acting' : 'output';
  })
  .edge('acting', 'output');

// workflow 컴파일 및 실행
const app = workflow.compile('input', 'output');
const result = await app.run('오늘 날씨는 어때요?');
console.log(result.output); // { answer: "간단한 답변: 오늘 날씨는 어때요?" }
```

## 개요

ts-edge는 다음과 같은 방식으로 방향성 그래프로 계산 workflow를 정의할 수 있게 해줍니다:

- **Node**: 데이터를 처리하고 출력을 생성
- **Edge**: node 간의 흐름을 정의
- **Dynamic routing**: node 출력을 기반으로 결정
- **Parallel execution**과 **merge node**: 복잡한 패턴 구현

## 설치

```bash
npm install ts-edge
```

## 주요 기능

### 기본 Node 및 Edge 정의

Node는 입력을 처리하고 출력을 생성합니다. Edge는 node 간의 흐름을 정의합니다.

```typescript
const workflow = createGraph()
  .addNode({
    name: 'nodeA',
    execute: (input) => ({ value: input * 2 }),
  })
  .addNode({
    name: 'nodeB',
    execute: (input) => ({ result: input.value + 10 }),
  })
  .edge('nodeA', 'nodeB');
```

### Dynamic Routing

Node 출력을 기반으로 실행 결정을 할 수 있습니다:

```typescript
workflow.dynamicEdge('processData', (data) => {
  if (data.value > 100) return 'highValueProcess';
  if (data.value < 0) return 'errorHandler';
  return 'standardProcess';
});
```

### 병렬 처리와 Merge Node

![parallel](./parallel.png)

병렬 branch에서 데이터를 처리하고 결과를 병합할 수 있습니다:

```typescript
const workflow = createGraph()
  .addNode({
    name: 'fetchData',
    execute: (query) => ({ query }),
  })
  .addNode({
    name: 'processBranch1',
    execute: (data) => ({ summary: summarize(data.query) }),
  })
  .addNode({
    name: 'processBranch2',
    execute: (data) => ({ details: getDetails(data.query) }),
  })
  .addMergeNode({
    name: 'combineResults',
    branches: ['processBranch1', 'processBranch2'],
    execute: (inputs) => ({
      result: {
        summary: inputs.processBranch1.summary,
        details: inputs.processBranch2.details,
      },
    }),
  })
  .edge('fetchData', ['processBranch1', 'processBranch2']);
```

### 실행 옵션

Workflow의 동작을 제어할 수 있습니다:

```typescript
const result = await app.run(input, {
  timeout: 5000, // 최대 실행 시간(ms)
  maxNodeVisits: 50, // 무한 루프 방지
});
```

### Start Node와 End Node

Workflow를 컴파일할 때 다음을 지정합니다:

- 필수 **start node**: 실행이 시작되는 곳
- 선택적 **end node**: 명시적으로 지정한 종료 지점

```typescript
// start node와 end node 모두 지정
const app = workflow.compile('inputNode', 'outputNode');

// start node만 지정 - 나가는 edge가 없는 node까지 실행
const app = workflow.compile('inputNode');
```

End node 동작 방식:

- **End node를 지정한 경우**: workflow가 end node에 도달하면 즉시 종료되고, 해당 node의 출력이 반환됩니다.
- **End node를 지정하지 않은 경우**: 더 이상 나가는 edge가 없는 node(리프 node)에 도달할 때까지 실행되며, 마지막으로 실행된 node의 출력이 반환됩니다.

End node를 지정하면 특정 지점에서 workflow를 강제로 종료할 수 있어 복잡한 workflow에서 유용합니다.

### Event 구독

Event로 workflow 실행을 모니터링할 수 있습니다:

```typescript
app.subscribe((event) => {
  if (event.eventType === 'NODE_START') {
    console.log(`Node 시작: ${event.node.name}`);
  }
});
```

### Middleware 지원

미들웨어를 추가하여 노드 실행을 가로채거나, 수정하거나, 리디렉션할 수 있습니다:

```typescript
const app = workflow.compile('startNode');

// 미들웨어 추가
app.use((node, next) => {
  console.log(`실행할 노드: ${node.name}, 입력값:`, node.input);

  // 입력값 수정
  if (node.name === 'validation') {
    next({ name: node.name, input: { ...node.input, validated: true } });
  }
  // 실행 흐름 리디렉션
  else if (node.name === 'router' && node.input.special) {
    next({ name: 'specialHandler', input: node.input });
  }

  // 일반 실행 계속
});
```

## 오류 처리

```typescript
const result = await app.run(input);
if (result.isOk) {
  console.log(result.output);
} else {
  console.error(result.error);
}
```

## Helper 함수

이 helper 함수들은 node를 별도로 정의하여 코드 구성을 개선하고, 여러 파일에서 재사용할 수 있게 해줍니다.

### `graphNode` - Node 생성

```typescript
import { graphNode } from 'ts-edge';

// Node 생성
const userNode = graphNode({
  name: 'getUser',
  execute: (id: string) => fetchUser(id),
});

// 그래프에서 사용
graph.addNode(userNode);
```

### `graphMergeNode` - Merge Node 생성

```typescript
import { graphMergeNode } from 'ts-edge';

// Merge node 생성
const mergeNode = graphMergeNode({
  name: 'combine',
  branches: ['userData', 'userStats'] as const,
  execute: (inputs) => ({ ...inputs.userData, stats: inputs.userStats }),
});

// 그래프에서 사용
graph.addMergeNode(mergeNode);
```

### `graphNodeRouter` - Router 생성

```typescript
import { graphNodeRouter } from 'ts-edge';

// Router 생성
const router = graphNodeRouter((data) => (data.isValid ? 'success' : 'error'));

// 그래프에서 사용
graph.dynamicEdge('validate', router);
```

## 라이선스

MIT

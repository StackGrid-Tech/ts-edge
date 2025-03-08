# 🔗 ts-edge 🔗

TypeScript를 위한 가볍고 타입 안전한 워크플로우 엔진으로, 유연하고 재사용 가능한 그래프 기반 실행 흐름을 만들 수 있습니다. AI 시스템과 데이터 파이프라인의 방향성 그래프 실행 패턴에서 영감을 받은 ts-edge는 강력한 타입 안전성을 갖춘 복잡한 계산 워크플로우를 정의하기 위한 간단하면서도 강력한 프레임워크를 제공합니다.

ts-edge를 사용하면 비즈니스 로직을 상호 연결된 노드 시리즈로 모델링할 수 있으며, 각 노드는 데이터를 처리하고 결과를 다음 단계로 전달합니다. 이러한 접근 방식은 복잡한 프로세스를 명확하게 하고, 코드를 더 잘 구성할 수 있게 하며, 조건부 분기, 병렬 처리, 결과 병합과 같은 강력한 패턴을 용이하게 합니다.

## 빠른 시작

![Reasoning Acting](./simple.png)

```typescript
import { createGraph } from 'ts-edge';

// 간단한 AI 에이전트 워크플로우 정의
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
      return { ...data, result: `다음에 대한 작업 수행: ${data.query}` };
    }
  })
  .addNode({
    name: 'output',
    execute: (data) => {
      return { answer: data.result || `간단한 답변: ${data.query}` };
    }
  })
  .edge('input', 'reasoning')
  .dynamicEdge('reasoning', (data) => {
    return data.isComplex ? 'acting' : 'output';
  })
  .edge('acting', 'output');

// 워크플로우 컴파일 및 실행
const app = workflow.compile('input', 'output');
const result = await app.run('오늘 날씨는 어때요?');
console.log(result.output); // { answer: "간단한 답변: 오늘 날씨는 어때요?" }
```

## 개요

ts-edge는 다음과 같은 방식으로 방향성 그래프로 계산 워크플로우를 정의할 수 있게 해줍니다:
- **노드**: 데이터를 처리하고 출력을 생성
- **엣지**: 노드 간의 흐름을 정의
- **동적 라우팅**: 노드 출력을 기반으로 결정
- **병렬 실행**과 **병합 노드**: 복잡한 패턴 구현

다음과 같은 용도에 적합합니다:
- AI 에이전트 워크플로우
- ETL 파이프라인
- 비즈니스 프로세스 자동화
- 다단계 데이터 처리

## 설치

```bash
npm install ts-edge
```

## 주요 기능

### 기본 노드 및 엣지 정의

노드는 입력을 처리하고 출력을 생성합니다. 엣지는 노드 간의 흐름을 정의합니다.

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

### `graphNode`로 재사용 가능한 노드 생성

더 나은 구조화와 재사용성을 위해 `graphNode` 헬퍼를 사용하여 노드를 별도로 정의할 수 있습니다:

```typescript
import { graphNode } from 'ts-edge';

// 별도 파일에서 재사용 가능한 노드 정의
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

// 워크플로우에서 사용
const workflow = createGraph()
  .addNode(fetchUserNode)
  .addNode(validateUserNode)
  .edge('fetchUser', 'validateUser');
```

`graphNode` 헬퍼는 노드에 대한 더 나은 타입 추론을 제공합니다.

### `graphNodeRouter`로 타입 안전한 동적 라우팅

타입 안전한 동적 라우팅을 위해 `graphNodeRouter` 헬퍼를 사용할 수 있습니다:

```typescript
import { graphNodeRouter } from 'ts-edge';

const userRouter = graphNodeRouter((data) => {
  if (data.isValid) {
    return 'processValidUser';
  } else {
    return {
      name: 'handleInvalidUser',
      input: { userId: data.user.id, reason: '사용자가 활성 상태가 아닙니다' }
    };
  }
});

workflow.dynamicEdge('validateUser', userRouter);
```

이 접근 방식은 라우팅 로직을 체계적으로 유지하고 더 나은 타입 검사를 가능하게 합니다.

### 동적 라우팅

노드 출력을 기반으로 실행 결정을 할 수 있습니다:

```typescript
workflow.dynamicEdge('processData', (data) => {
  if (data.value > 100) return 'highValueProcess';
  if (data.value < 0) return 'errorHandler';
  return 'standardProcess';
});
```

다음 노드에 수정된 입력을 전달할 수도 있습니다:

```typescript
workflow.dynamicEdge('analyze', (data) => {
  return {
    name: 'process',
    input: { ...data, priority: data.score > 0.8 ? 'high' : 'normal' }
  };
});
```

### 병렬 처리와 병합 노드

![parallel](./parallel.png)

병렬 브랜치에서 데이터를 처리하고 결과를 병합할 수 있습니다:

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

### 실행 옵션

워크플로우의 동작을 제어할 수 있습니다:

```typescript
const result = await app.run(input, {
  timeout: 5000,            // 최대 실행 시간(ms)
  maxNodeVisits: 50,        // 무한 루프 방지
});
```

### 시작 및 종료 노드

워크플로우를 컴파일할 때 다음을 지정합니다:
- 필수 **시작 노드**: 실행이 시작되는 곳
- 선택적 **종료 노드**: 실행이 중지되는 곳

```typescript
// 시작 및 종료 노드 모두 지정
const app = workflow.compile('inputNode', 'outputNode');

// 시작 노드만 지정 - 나가는 엣지가 없는 노드까지 실행
const app = workflow.compile('inputNode');
```

종료 노드가 지정되면 워크플로우는 해당 노드의 출력을 반환합니다. 그렇지 않으면 마지막으로 실행된 노드의 출력을 반환합니다.

### 이벤트 구독

이벤트로 워크플로우 실행을 모니터링할 수 있습니다:

```typescript
app.subscribe((event) => {
  if (event.eventType === 'NODE_START') {
    console.log(`노드 시작: ${event.node.name}`);
  }
});
```

## 오류 처리

```typescript
  const result = await app.run(input);
  if (result.isOk) {
    console.log(result.output)
  }else {
      console.error(result.error);
  }
```

## 라이선스

MIT
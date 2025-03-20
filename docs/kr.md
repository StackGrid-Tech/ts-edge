# 🔗 ts-edge 🔗

타입스크립트를 위한 경량 워크플로우 엔진으로, 타입 안전성과 최소한의 복잡성으로 그래프 기반 실행 흐름을 생성할 수 있습니다.

![parallel](./parallel.png)

## 목차

- [특징](#특징)
- [설치](#설치)
- [타입 안전 워크플로우](#타입-안전-워크플로우) - 노드 간 타입 호환성 보장
- [상태 기반 워크플로우](#상태-기반-워크플로우) - 노드 간 상태 공유
- [주요 기능](#주요-기능)
- [도우미 함수](#도우미-함수)

## 특징

- **경량화**: 빠르게 배우고 적용할 수 있는 최소한의 API와 옵션
- **고급 타입 추론**: 컴파일 타임 검증으로 입출력 타입이 일치할 때만 노드를 연결할 수 있도록 보장
- **간단한 API**: 사용 편의성을 위한 필수 기능만 제공
- **유연한 워크플로우**: 조건부 분기, 병렬 처리, 결과 병합과 같은 다양한 패턴 지원
- **상태 관리**: 상태 기반 워크플로우를 위한 내장 스토어 제공

## 설치

```bash
npm install ts-edge
```

## 타입 안전 워크플로우

ts-edge의 타입 안전 워크플로우는 연결된 노드 간의 타입 호환성을 보장합니다:

```typescript
import { createGraph } from 'ts-edge';

// 각 노드는 이전 노드의 출력을 입력으로 받음
// TypeScript는 연결된 노드 간의 타입 호환성을 컴파일 시간에 검사
const workflow = createGraph()
  .addNode({
    name: 'number to string',
    execute: (input: number) => {
      // 숫자를 문자열로 변환
      return `${input}을 입력 하였습니다.`;
    },
  })
  .addNode({
    name: 'string to boolean',
    execute: (input: string) => {
      // 문자열을 불리언으로 변환
      return input !== '';
    },
  })
  .addNode({
    name: 'boolean to array',
    execute: (input: boolean) => {
      // 불리언을 배열로 변환
      return input ? [] : [1, 2, 3];
    },
  })
  .edge('number to string', 'string to boolean') // 타입 호환성 검사 통과
  // .edge('number to string', 'boolean to array') // ❌ 타입 오류 발생
  .edge('string to boolean', 'boolean to array'); // 타입 호환성 검사 통과

// 워크플로우 컴파일 및 실행
const app = workflow.compile('number to string');
const result = await app.run(100);
console.log(result.output); // [1,2,3]
```

## 상태 기반 워크플로우

노드 간에 공유 상태를 사용하는 상태 기반 워크플로우입니다:

```typescript
import { createStateGraph, graphStore } from 'ts-edge';

// 카운터 상태 타입 정의
type CounterState = {
  count: number;
  increment: () => void;
  decrement: () => void;
  updateCount: (count: number) => void;
};

// graphStore를 사용한 상태 스토어 생성
const store = graphStore<CounterState>((set, get) => {
  return {
    count: 0,
    increment: () =>
      set((prev) => {
        return { count: prev.count + 1 };
      }),
    decrement: () => set({ count: get().count - 1 }),
    updateCount: (count: number) => set({ count }),
  };
});

// 상태 기반 워크플로우 생성
// 상태 기반 워크플로우에서는 노드들이 공통 상태를 공유하고 수정합니다
// 참고: 상태 노드의 반환값은 무시됩니다
const workflow = createStateGraph(store)
  .addNode({
    name: 'increment',
    execute: (state) => {
      // 상태에 접근
      console.log(state.count); // 0

      state.increment();
    },
  })
  .addNode({
    name: 'checkCount',
    execute: (state) => {
      console.log(`현재 카운트: ${state.count}`);
    },
  })
  .addNode({
    name: 'reset',
    execute: (state) => {
      // 상태 초기화
      state.updateCount(0);
    },
  })
  .edge('increment', 'checkCount')
  .dynamicEdge('checkCount', (state) => {
    // 상태를 기반으로 다음 노드 결정
    return state.count > 10 ? 'reset' : 'increment';
  });

// 워크플로우 컴파일 및 실행
const app = workflow.compile('increment');
const result = await app.run(); // 초기 상태로 시작
// 또는 부분 상태로 시작: await app.run({ count:10 });
```

## 주요 기능

### 기본 노드 및 엣지 정의

노드는 입력을 처리하고 출력을 생성합니다. 엣지는 노드 간의 흐름을 정의합니다. 노드에는 문서화나 시각화를 위한 선택적 메타데이터를 포함할 수 있습니다.

```typescript
const workflow = createGraph()
  .addNode({
    name: 'nodeA',
    execute: (input: number) => ({ value: input * 2 }),
    metadata: { description: '입력값을 두 배로 만듭니다', category: '수학' },
  })
  .addNode({
    name: 'nodeB',
    execute: (input: { value: number }) => ({ result: input.value + 10 }),
    metadata: { description: '값에 10을 더합니다' },
  })
  .edge('nodeA', 'nodeB');
```

### 노드 실행 컨텍스트

각 노드의 실행 함수는 입력 데이터 외에도 컨텍스트 객체를 두 번째 인자로 받을 수 있습니다:

```typescript
addNode({
  name: 'streamingNode',
  metadata: { version: 1, role: 'processor' },
  execute: (input, context) => {
    // 노드에 설정된 메타데이터에 접근
    console.log(context.metadata); // { version: 1, role: 'processor' }

    // 스트림 이벤트 발생 (노드 실행 중 진행 상황 보고에 유용)
    context.stream('처리 시작...');
    // 작업 수행
    context.stream('50% 완료');
    // 최종 결과
    return { result: '완료됨' };
  },
});
```

### 동적 라우팅

노드 출력을 기반으로 실행 결정을 내립니다:

```typescript
workflow.dynamicEdge('processData', (data) => {
  if (data.value > 100) return ['highValueProcess', 'standardProcess']; // 여러 노드로 분기
  if (data.value < 0) return 'errorHandler'; // 단일 노드로 분기
  return 'standardProcess'; // 기본 경로
});
```

더 나은 시각화와 문서화를 위해 가능한 대상을 지정할 수 있습니다:

```typescript
workflow.dynamicEdge('processData', {
  possibleTargets: ['highValueProcess', 'errorHandler', 'standardProcess'],
  router: (data) => {
    if (data.value > 100) return ['highValueProcess', 'standardProcess'];
    if (data.value < 0) return 'errorHandler';
    return 'standardProcess';
  },
});
```

### 병렬 처리와 병합 노드

병렬 브랜치에서 데이터를 처리하고 결과를 병합합니다:

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
    branch: ['processBranch1', 'processBranch2'], // 병합할 브랜치 노드들
    execute: (inputs) => ({
      // inputs 객체에는 각 브랜치 노드의 출력이 포함됨
      result: {
        summary: inputs.processBranch1.summary,
        details: inputs.processBranch2.details,
      },
    }),
  })
  .edge('fetchData', ['processBranch1', 'processBranch2']); // 한 노드에서 여러 노드로 분기
```

### 실행 옵션

워크플로우의 동작을 제어합니다:

```typescript
// 기본 실행
const result = await app.run(input);

// 옵션을 포함한 실행
const resultWithOptions = await app.run(input, {
  timeout: 5000, // 최대 실행 시간(ms)
  maxNodeVisits: 50, // 무한 루프 방지
});

// 상태 그래프 초기화
const stateResult = await stateApp.run({ count: 10, name: '테스트' }); // 부분 상태로 초기화

// 상태 리셋 방지
const noResetResult = await stateApp.run(undefined, {
  noResetState: true, // 실행 전 상태 초기화하지 않음
});
```

### 시작 및 종료 노드

워크플로우를 컴파일할 때 다음을 지정합니다:

```typescript
// 시작 노드만 지정 - 출력 엣지가 없는 노드에 도달할 때까지 실행
const app = workflow.compile('inputNode');

// 시작 및 종료 노드 모두 지정 - 종료 노드에 도달하면 실행 종료
const appWithEnd = workflow.compile('inputNode', 'outputNode');
```

- **종료 노드가 지정된 경우**: 워크플로우는 종료 노드에 도달하면 종료되고 해당 노드의 출력을 반환합니다.
- **종료 노드가 지정되지 않은 경우**: 워크플로우는 리프 노드(출력 엣지가 없는 노드)에 도달할 때까지 실행되고 마지막으로 실행된 노드의 출력을 반환합니다.

### 이벤트 구독

이벤트를 통해 워크플로우 실행을 모니터링합니다:

```typescript
app.subscribe((event) => {
  // 워크플로우 시작 이벤트
  if (event.eventType === 'WORKFLOW_START') {
    console.log(`워크플로우 시작: 입력값:`, event.input);
  }

  // 노드 시작 이벤트
  else if (event.eventType === 'NODE_START') {
    console.log(`노드 시작: ${event.node.name}, 입력값:`, event.node.input);
  }

  // 노드 스트림 이벤트 (context.stream 호출시 발생)
  else if (event.eventType === 'NODE_STREAM') {
    console.log(`노드 ${event.node.name}에서 스트림: ${event.node.chunk}`);
  }

  // 노드 종료 이벤트
  else if (event.eventType === 'NODE_END') {
    if (event.isOk) {
      console.log(`노드 완료: ${event.node.name}, 출력값:`, event.node.output);
    } else {
      console.error(`노드 오류: ${event.node.name}, 오류:`, event.error);
    }
  }

  // 워크플로우 종료 이벤트
  else if (event.eventType === 'WORKFLOW_END') {
    if (event.isOk) {
      console.log(`워크플로우 완료, 출력값:`, event.output);
    } else {
      console.error(`워크플로우 오류:`, event.error);
    }
  }
});
```

### 미들웨어 지원

노드 실행을 가로채고, 수정하거나 리디렉션하는 미들웨어를 추가합니다:

```typescript
const app = workflow.compile('startNode');

// 미들웨어 추가
app.use((node, next) => {
  console.log(`노드 실행 예정: ${node.name}, 입력값:`, node.input);

  // 입력 수정 후 동일 노드 실행
  if (node.name === 'validation') {
    next({ name: node.name, input: { ...node.input, validated: true } });
  }

  // 다른 노드로 실행 흐름 리디렉션
  else if (node.name === 'router' && node.input.special) {
    next({ name: 'specialHandler', input: node.input });
  }

  // 일반 실행 흐름 계속
  else {
    next();
  }

  // next()를 호출하지 않으면 실행이 중단됨
});
```

### 오류 처리

ts-edge는 강력한 오류 처리 시스템을 제공합니다:

```typescript
try {
  const result = await app.run(input);

  if (result.isOk) {
    console.log('성공:', result.output);
  } else {
    console.error('실행 오류:', result.error);
  }
} catch (error) {
  console.error('예상치 못한 오류:', error);
}
```

## 도우미 함수

이러한 도우미 함수들은 더 나은 구성과 파일 간 재사용성을 위해 노드를 별도로 정의할 수 있게 합니다.

### `graphNode` - 노드 생성

```typescript
import { graphNode } from 'ts-edge';

// 노드 생성
const userNode = graphNode({
  name: 'getUser',
  execute: (id: string) => fetchUser(id),
  metadata: { description: '사용자 데이터를 가져옵니다' },
});

// 타입 추론
type UserNodeType = graphNode.infer<typeof userNode>;
// { name: 'getUser', input: string, output: User }

// 그래프에서 사용
graph.addNode(userNode);
```

### `graphStateNode` - 상태 노드 생성

```typescript
import { graphStateNode, graphStore } from 'ts-edge';

// 상태 정의 및 스토어 생성
type CounterState = {
  count: number;
  name: string;
  updateCount: (count: number) => void;
  updateName: (name: string) => void;
};

const store = graphStore<CounterState>((set) => {
  return {
    count: 0,
    name: '',
    updateName(name) {
      set({ name });
    },
    updateCount(count) {
      set({ count });
    },
  };
});

// 별도 파일/모듈에서 노드 정의
const countNode = graphStateNode({
  name: 'processCount',
  execute: ({ count, updateCount }: CounterState) => {
    if (count < 10) {
      updateCount(10);
    }
  },
});

// 상태 그래프에서 사용
const stateGraph = createStateGraph(store).addNode(countNode);
```

### `graphMergeNode` - 병합 노드 생성

```typescript
import { graphMergeNode } from 'ts-edge';

// 병합 노드 생성
const mergeNode = graphMergeNode({
  name: 'combine',
  branch: ['userData', 'userStats'],
  execute: (inputs) => ({ ...inputs.userData, stats: inputs.userStats }),
});

// 그래프에서 사용
graph.addMergeNode(mergeNode);
```

### `graphNodeRouter` - 라우터 생성

```typescript
import { graphNodeRouter } from 'ts-edge';

// 단순 라우터 생성
const simpleRouter = graphNodeRouter((data) => (data.isValid ? 'success' : 'error'));

// 명시적 대상이 있는 라우터 생성
const complexRouter = graphNodeRouter(['success', 'warning', 'error'], (data) => {
  if (data.score > 90) return 'success';
  if (data.score > 50) return 'warning';
  return 'error';
});

// 그래프에서 사용
graph.dynamicEdge('validate', simpleRouter);
```

## 라이센스

MIT

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { GraphEvent } from '../src/interfaces';
import { delay } from '../src/shared';
import { graphMergeNode, graphNodeRouter } from '../src/core/helper';
import { createGraph } from '../src/core/registry';
import { GraphConfigurationError } from '../src/core/error';

describe('Workflow Module', () => {
  // 콘솔 오류 스파이 설정
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('1. 기본 노드 생성 및 등록', () => {
    it('노드를 생성하고 등록할 수 있어야 함', () => {
      const workflow = createGraph().addNode({
        name: 'test',
        execute: (input: number) => input * 2,
      });

      const app = workflow.compile('test');
      expect(app).toBeDefined();
    });

    it('같은 이름의 노드를 중복 등록하면 오류가 발생해야 함', () => {
      const workflow = createGraph().addNode({
        name: 'test',
        execute: (input: number) => input * 2,
      });

      expect(() =>
        workflow.addNode({
          name: 'test',
          execute: (input: number) => input * 3,
        })
      ).toThrow('Node with name "test" already exists in the graph');
    });

    it('getStructure 메서드가 올바른 그래프 구조를 반환해야 함', () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'process',
          execute: (input: number) => input * 2,
        })
        .edge('start', 'process');

      const app = workflow.compile('start');
      const structure = app.getStructure();

      expect(structure).toHaveLength(2);
      expect(structure).toContainEqual(
        expect.objectContaining({
          name: 'start',
          edge: expect.objectContaining({
            type: 'direct',
            name: ['process'],
          }),
        })
      );
    });
  });

  describe('2. 단일 경로 워크플로우 실행', () => {
    it('단일 노드 워크플로우를 실행할 수 있어야 함', async () => {
      const workflow = createGraph().addNode({
        name: 'single',
        execute: (input: number) => input * 2,
      });

      const app = workflow.compile('single');
      const result = await app.run(5);

      expect(result.isOk).toBe(true);
      expect(result.output).toBe(10);
      expect(result.histories).toHaveLength(1);
      expect(result.histories[0].node.output).toBe(10);
    });

    it('여러 노드로 구성된 선형 워크플로우를 실행할 수 있어야 함', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input * 2,
        })
        .addNode({
          name: 'middle',
          execute: (input: number) => input + 5,
        })
        .addNode({
          name: 'end',
          execute: (input: number) => input * 3,
        })
        .edge('start', 'middle')
        .edge('middle', 'end');

      const app = workflow.compile('start');
      const result = await app.run(5);

      expect(result.isOk).toBe(true);
      expect(result.output).toBe(45); // ((5 * 2) + 5) * 3 = 45
      expect(result.histories).toHaveLength(3);
      expect(result.histories[0].node.name).toBe('start');
      expect(result.histories[1].node.name).toBe('middle');
      expect(result.histories[2].node.name).toBe('end');
    });

    it('지정된 end 노드에서 워크플로우가 종료되어야 함', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input * 2,
        })
        .addNode({
          name: 'middle',
          execute: (input: number) => input + 5,
        })
        .addNode({
          name: 'end',
          execute: (input: number) => input * 3,
        })
        .edge('start', 'middle')
        .edge('middle', 'end');

      const app = workflow.compile('start', 'middle');

      const result = await app.run(5);

      expect(result.isOk).toBe(true);
      expect(result.output).toBe(15); // (5 * 2) + 5 = 15
      expect(result.histories).toHaveLength(2);
      expect(result.histories[1].node.name).toBe('middle');
    });
  });

  describe('3. 이벤트 발행 및 구독', () => {
    it('워크플로우 실행 시 적절한 이벤트가 발행되어야 함', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input * 2,
        })
        .addNode({
          name: 'end',
          execute: (input: number) => input + 5,
        })
        .edge('start', 'end');

      const app = workflow.compile('start');

      const events: any[] = [];
      const handler = (event: GraphEvent) => {
        events.push(event);
      };

      app.subscribe(handler);
      await app.run(5);
      app.unsubscribe(handler);

      expect(events).toHaveLength(6); // WORKFLOW_START + 2 * NODE_START/END + WORKFLOW_END
      expect(events[0].eventType).toBe('WORKFLOW_START');
      expect(events[1].eventType).toBe('NODE_START');
      expect(events[1].node.name).toBe('start');
      expect(events[2].eventType).toBe('NODE_END');
      expect(events[5].eventType).toBe('WORKFLOW_END');
    });
  });

  describe('4. 동적 라우팅', () => {
    it('동적 라우팅으로 조건에 따라 다른 경로를 실행할 수 있어야 함', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'even',
          execute: (input: number) => input + ' is even',
        })
        .addNode({
          name: 'odd',
          execute: (input: number) => input + ' is odd',
        })
        .dynamicEdge('start', (output) => {
          return output % 2 === 0 ? 'even' : 'odd';
        });

      // 짝수 입력 테스트
      const app1 = workflow.compile('start');
      const result1 = await app1.run(4);
      expect(result1.output).toBe('4 is even');

      // 홀수 입력 테스트
      const app2 = workflow.compile('start');
      const result2 = await app2.run(5);
      expect(result2.output).toBe('5 is odd');
    });

    it('동적 라우팅에서 undefined 반환 시 워크플로우가 종료되어야 함', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'never',
          execute: () => 'Should not reach here',
        })
        .dynamicEdge(
          'start',
          graphNodeRouter(() => {
            return undefined;
          })
        );

      const app = workflow.compile('start');
      const result = await app.run(5);

      expect(result.output).toBe(5);
      expect(result.histories).toHaveLength(1);
    });
  });

  describe('5. 오류 처리', () => {
    it.skip('노드 실행 중 오류 발생 시 워크플로우가 실패해야 함', async () => {
      const workflow = createGraph().addNode({
        name: 'start',
        execute: () => {
          throw new Error('Test error');
        },
      });

      const app = workflow.compile('start');

      const result = await app.run(5);
      expect(result.isOk).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('Test error');
    });

    it('존재하지 않는 노드에 엣지를 추가하면 오류가 발생해야 함', () => {
      const workflow = createGraph().addNode({
        name: 'start',
        execute: (input: number) => input,
      });
      workflow.edge('start', 'nonexistent' as any);
      expect(() => workflow.compile('start')).toThrow();
    });

    it.skip('최대 노드 방문 횟수를 초과하면 오류가 발생해야 함', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'nodeA',
          execute: (input: number) => input + 1,
        })
        .addNode({
          name: 'nodeB',
          execute: (input: number) => input + 1,
        })
        .edge('nodeA', 'nodeB')
        .edge('nodeB', 'nodeA');

      const app = workflow.compile('nodeA');

      const result = await app.run(0, { maxNodeVisits: 5 });

      expect(result.isOk).toBe(false);
      expect(result.error?.message).toContain('Maximum node visits (5) exceeded for node "nodeB"');
    });

    it('타임아웃 시 워크플로우가 실패해야 함', async () => {
      const workflow = createGraph().addNode({
        name: 'slow',
        execute: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return input;
        },
      });

      const app = workflow.compile('slow');
      const result = await app.run(5, { timeout: 50 });

      expect(result.isOk).toBe(false);
      expect(result.error?.message).toContain('Graph execution timed out after 50ms');
    });
  });

  describe('6. 병렬 실행 및 병합 노드', () => {
    it('기본적인 병합 노드가 작동해야 함', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'branchA',
          execute: async (input: number) => delay(3000).then(() => String(input * 2)),
        })
        .addNode({
          name: 'branchB',
          execute: async (input: number) => delay(4000).then(() => String(input + 10)),
        })
        .addMergeNode({
          name: 'merge',
          branch: ['branchA', 'branchB'],
          execute: (inputs) => {
            return Number(inputs.branchA) + Number(inputs.branchB);
          },
        })
        .edge('start', ['branchA', 'branchB']);
      const app = workflow.compile('start');
      const result = await app.run(5);

      expect(result.isOk).toBe(true);
      // (5 * 2) + (5 + 10) = 10 + 15 = 25
      expect(result.output).toBe(25);
      expect(result.histories).toHaveLength(4);
    }, 10000);

    it('한 브랜치의 결과가 다른 브랜치로 영향을 주지 않아야 함', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'branchA',
          execute: (input: number) => {
            // 고의적으로 오래 걸리는 연산
            return new Promise((resolve) => setTimeout(() => resolve(input * 2), 50));
          },
        })
        .addNode({
          name: 'branchB',
          execute: (input: number) => input + 5,
        })
        .addMergeNode({
          name: 'merge',
          branch: ['branchA', 'branchB'],
          execute: (inputs) => {
            return [inputs.branchA, inputs.branchB];
          },
        })
        .edge('start', ['branchA', 'branchB']);

      const app = workflow.compile('start');
      const result = await app.run(5);

      expect(result.isOk).toBe(true);
      expect(result.output).toEqual([10, 10]); // [5*2, 5+5]
    });

    it('병합 노드는 모든 소스 노드가 완료될 때까지 기다려야 함', async () => {
      // 이 테스트에서는 소스 노드들의 실행 시간이 다름
      const completionTimes: Record<string, number> = {};

      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'fastBranch',
          execute: async (input: number) => {
            // 빨리 완료되는 브랜치
            await new Promise((resolve) => setTimeout(resolve, 10));
            completionTimes.fastBranch = Date.now();
            return input * 2;
          },
        })
        .addNode({
          name: 'slowBranch',
          execute: async (input: number) => {
            // 늦게 완료되는 브랜치
            await new Promise((resolve) => setTimeout(resolve, 50));
            completionTimes.slowBranch = Date.now();
            return input + 10;
          },
        })
        .addMergeNode({
          name: 'merge',
          branch: ['fastBranch', 'slowBranch'],
          execute: (inputs) => {
            completionTimes.merge = Date.now();
            return inputs;
          },
        })
        .edge('start', ['fastBranch', 'slowBranch']);

      const app = workflow.compile('start');
      await app.run(5);

      // 병합 노드는 가장 느린 브랜치보다 나중에 실행되어야 함
      expect(completionTimes.merge).toBeGreaterThanOrEqual(completionTimes.slowBranch);
      expect(completionTimes.merge).toBeGreaterThan(completionTimes.fastBranch);
    });

    it.skip('한 브랜치에서 오류가 발생하면 전체 워크플로우가 실패해야 함', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'goodBranch',
          execute: (input: number) => input * 2,
        })
        .addNode({
          name: 'errorBranch',
          execute: () => {
            throw new Error('Branch execution failed');
          },
        })
        .addMergeNode({
          name: 'merge',
          branch: ['goodBranch', 'errorBranch'],
          execute: (inputs) => inputs,
        })
        .edge('start', ['goodBranch', 'errorBranch']);

      const app = workflow.compile('start');
      const result = await app.run(5);

      expect(result.isOk).toBe(false);
      expect(result.histories.some((h) => h.node.name == 'merge')).toBe(false);
      expect(result.error?.message).toContain('Branch execution failed');
    });

    it('복잡한 병렬 및 순차 워크플로우가 올바르게 실행되어야 함', async () => {
      // 여러 단계의 병렬 및 순차 실행을 결합한 복잡한 워크플로우
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'processA',
          execute: (input: number) => input * 2,
        })
        .addNode({
          name: 'processB',
          execute: (input: number) => input + 5,
        })
        .addMergeNode({
          name: 'merge1',
          branch: ['processA', 'processB'],
          execute: (inputs: { processA: number; processB: number }) => {
            return inputs.processA + inputs.processB;
          },
        })
        .addNode({
          name: 'splitAgain',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'processC',
          execute: (input: number) => input / 2,
        })
        .addNode({
          name: 'processD',
          execute: (input: number) => input - 3,
        })
        .addMergeNode({
          name: 'finalMerge',
          branch: ['processC', 'processD'],
          execute: (inputs: { processC: number; processD: number }) => {
            return [inputs.processC, inputs.processD];
          },
        })
        .edge('start', ['processA', 'processB'])
        .edge('merge1', 'splitAgain')
        .edge('splitAgain', ['processC', 'processD']);

      const app = workflow.compile('start');
      const result = await app.run(5);

      // 계산 과정:
      // 1. start: 5
      // 2. processA: 5*2=10, processB: 5+5=10
      // 3. merge1: 10+10=20
      // 4. splitAgain: 20
      // 5. processC: 20/2=10, processD: 20-3=17
      // 6. finalMerge: [10, 17]

      expect(result.isOk).toBe(true);
      expect(result.output).toEqual([10, 17]);
    });
  });

  describe('7. 그래프 구조 검증', () => {
    it('존재하지 않는 시작 노드로 컴파일할 때 에러가 발생해야 함', () => {
      const workflow = createGraph().addNode({
        name: 'nodeA',
        execute: (input: number) => input,
      });

      expect(() => workflow.compile('nonexistent')).toThrow(GraphConfigurationError);
      expect(() => workflow.compile('nonexistent')).toThrow(/node.*not found/i);
    });
  });

  describe('8. 고급 병합 노드 시나리오', () => {
    it('중첩된 병합 노드가 올바르게 작동해야 함', async () => {
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        // 첫 번째 레벨 분기
        .addNode({
          name: 'branch1A',
          execute: (input: number) => input * 2,
        })
        .addNode({
          name: 'branch1B',
          execute: (input: number) => input + 3,
        })
        // 두 번째 레벨 분기
        .addNode({
          name: 'branch2A',
          execute: (input: number) => input - 1,
        })
        .addNode({
          name: 'branch2B',
          execute: (input: number) => input * 3,
        })
        // 병합 노드
        .addMergeNode({
          name: 'merge1',
          branch: ['branch1A', 'branch1B'],
          execute: (inputs) => inputs.branch1A + inputs.branch1B,
        })
        .addMergeNode({
          name: 'merge2',
          branch: ['branch2A', 'branch2B'],
          execute: (inputs) => inputs.branch2A + inputs.branch2B,
        })
        .addMergeNode({
          name: 'finalMerge',
          branch: ['merge1', 'merge2'],
          execute: (inputs) => [inputs.merge1, inputs.merge2],
        })
        .edge('start', ['branch1A', 'branch1B', 'branch2A', 'branch2B']);

      const app = workflow.compile('start');
      const result = await app.run(5);

      // 계산:
      // branch1A: 5*2=10, branch1B: 5+3=8, merge1: 10+8=18
      // branch2A: 5-1=4, branch2B: 5*3=15, merge2: 4+15=19
      // finalMerge: [18, 19]
      expect(result.output).toEqual([18, 19]);
    });

    it('병합 노드의 소스가 모두 완료되기 전에 종료 노드에 도달하면 완료된 소스만 처리되어야 함', async () => {
      const mergeNode = graphMergeNode({
        name: 'merge',
        branch: ['fastBranch', 'slowBranch'],
        execute: (inputs) => {
          return { ...inputs };
        },
      });
      const workflow = createGraph()
        .addNode({
          name: 'start',
          execute: (input: number) => input,
        })
        .addNode({
          name: 'fastBranch',
          execute: (input: number) => input * 2,
        })
        .addNode({
          name: 'slowBranch',
          execute: async (input: number) => {
            await new Promise((resolve) => setTimeout(resolve, 500));
            return input + 10;
          },
        })
        .addMergeNode(mergeNode)
        .edge('start', ['fastBranch', 'slowBranch']);

      const app = workflow.compile('start', 'fastBranch');

      const result = await app.run(5);

      expect(result.output).toBe(10);
    });
  });
});
// it('타입검증',()=>{

//   const booleanToString = graphNode({
//     name:'boolean to string',
//     execute:(input:boolean)=>String(input?'true':'false')
//   })
//   const booleanToNumber = graphNode({
//     name:'boolean to number',
//     execute:(input:boolean)=>Number(input?1:0)
//   })

//   const router = graphNodeRouter((input:any)=>{

//     return 'OK'
//   })

//   const mergeNode = graphMergeNode({
//     name:'merge2',
//     branch:['string to number','number to string'],
//     execute(inputs) {
//         return ''
//     },
//   })

//   const workflow = createGraph()
//     .addNode({
//       name:'number to string',
//       execute(input:number) {
//             return String(input)
//       },
//     })
//     .addNode({
//       name:'string to number',
//       execute(input:string) {
//             return Number(input)
//       },
//     })
//     .addNode(booleanToString)
//     .addNode(booleanToNumber)
//     .addNode({
//       name:'any to boolean',
//       execute(input:any) {
//             return Boolean(input)
//       },
//     })
//     .addMergeNode(mergeNode)
//     .edge('string to number','number to string')
//     .edge('number to string','string to number')
//     .edge('boolean to number','number to string')
//     .addMergeNode({
//       name:'mergeNode',
//       branch:['boolean to number','boolean to string'],
//       execute(inputs) {
//         return inputs
//       },
//     })
//     .edge('boolean to string','mergeNode')
//     .dynamicEdge('mergeNode',router)
//     .dynamicEdge('any to boolean',bool=>{
//       return bool?'mergeNode':'boolean to number'
//     })

//   const app = workflow.compile('number to string')
//   app.run(123).then(result=>{
//     result.output
//   })

// })

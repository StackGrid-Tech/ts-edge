import { describe, it, expect } from 'vitest';
import { createGraph } from '../src/core/registry';
import { delay } from '../src/shared';

describe('Complex Workflow Scenarios', () => {
  it('should execute a complex data processing workflow with multiple paths and merge nodes', async () => {
    // 이 테스트는 데이터 처리 파이프라인을 시뮬레이션합니다
    const executionLog: string[] = [];

    const workflow = createGraph()
      // 입력 노드 (고객 데이터)
      .addNode({
        name: 'inputData',
        execute: (customer: { id: string; name: string; email: string; subscription: string }) => {
          executionLog.push('inputData');
          return {
            customer,
            processId: `process-${Date.now()}`,
            timestamp: Date.now(),
          };
        },
      })

      // 검증 노드들 - 병렬 실행
      .addNode({
        name: 'validateEmail',
        execute: async (data) => {
          await delay(30); // 비동기 작업 시뮬레이션
          executionLog.push('validateEmail');

          const email = data.customer.email;
          const isValid = email.includes('@') && email.includes('.');

          return {
            ...data,
            emailValidation: {
              isValid,
              errors: isValid ? [] : ['Invalid email format'],
            },
          };
        },
      })
      .addNode({
        name: 'validateSubscription',
        execute: async (data) => {
          await delay(25);
          executionLog.push('validateSubscription');

          const validSubscriptions = ['basic', 'premium', 'enterprise'];
          const isValid = validSubscriptions.includes(data.customer.subscription.toLowerCase());

          return {
            ...data,
            subscriptionValidation: {
              isValid,
              errors: isValid ? [] : ['Unknown subscription type'],
            },
          };
        },
      })

      // 검증 병합 노드
      .addMergeNode({
        name: 'mergeValidations',
        branch: ['validateEmail', 'validateSubscription'],
        execute: (inputs) => {
          executionLog.push('mergeValidations');

          const allErrors = [
            ...(inputs.validateEmail.emailValidation.errors || []),
            ...(inputs.validateSubscription.subscriptionValidation.errors || []),
          ];

          return {
            ...inputs.validateEmail,
            ...inputs.validateSubscription,
            isValid: allErrors.length === 0,
            validationErrors: allErrors,
          };
        },
      })

      // 라우팅 노드
      .addNode({
        name: 'routeProcessing',
        execute: (data) => {
          executionLog.push('routeProcessing');

          if (!data.isValid) {
            return {
              ...data,
              status: 'invalid',
              nextSteps: 'errorProcessing',
            };
          }

          const subscription = data.customer.subscription.toLowerCase();
          return {
            ...data,
            status: 'valid',
            nextSteps: subscription === 'enterprise' ? 'priorityProcessing' : 'standardProcessing',
          };
        },
      })

      // 처리 노드들
      .addNode({
        name: 'standardProcessing',
        execute: async (data) => {
          await delay(40);
          executionLog.push('standardProcessing');

          return {
            ...data,
            processedAt: new Date().toISOString(),
            benefits: ['Basic support', 'Standard features'],
            processingType: 'standard',
          };
        },
      })
      .addNode({
        name: 'priorityProcessing',
        execute: async (data) => {
          await delay(20); // 우선 처리는 더 빠름
          executionLog.push('priorityProcessing');

          return {
            ...data,
            processedAt: new Date().toISOString(),
            benefits: ['Premium support', 'Advanced features', 'Priority queue'],
            processingType: 'priority',
          };
        },
      })
      .addNode({
        name: 'errorProcessing',
        execute: (data) => {
          executionLog.push('errorProcessing');

          return {
            customerId: data.customer.id,
            errors: data.validationErrors,
            status: 'failed',
            message: `Validation failed for ${data.customer.name}: ${data.validationErrors.join(', ')}`,
          };
        },
      })

      // 보조 처리 노드들 - 병렬 실행
      .addNode({
        name: 'generateWelcomeEmail',
        execute: (data) => {
          executionLog.push('generateWelcomeEmail');

          return {
            ...data,
            emailTemplate: `Welcome ${data.customer.name}! Your ${data.processingType} account is ready.`,
            emailGenerated: true,
          };
        },
      })
      .addNode({
        name: 'updateCustomerStatus',
        execute: async (data) => {
          await delay(30);
          executionLog.push('updateCustomerStatus');

          return {
            ...data,
            customerStatus: 'active',
            statusUpdatedAt: new Date().toISOString(),
          };
        },
      })
      .addNode({
        name: 'logActivity',
        execute: (data) => {
          executionLog.push('logActivity');

          return {
            ...data,
            activityLog: {
              action: 'customer_onboarding',
              customerId: data.customer.id,
              timestamp: Date.now(),
              details: {
                processingType: data.processingType,
                validations: {
                  email: data.emailValidation.isValid,
                  subscription: data.subscriptionValidation.isValid,
                },
              },
            },
          };
        },
      })

      // 결과 병합 노드
      .addMergeNode({
        name: 'mergeResults',
        branch: ['generateWelcomeEmail', 'updateCustomerStatus', 'logActivity'],
        execute: (inputs) => {
          executionLog.push('mergeResults');

          return {
            customer: inputs.generateWelcomeEmail.customer,
            emailTemplate: inputs.generateWelcomeEmail.emailTemplate,
            customerStatus: inputs.updateCustomerStatus.customerStatus,
            statusUpdatedAt: inputs.updateCustomerStatus.statusUpdatedAt,
            activityLog: inputs.logActivity.activityLog,
            processId: inputs.generateWelcomeEmail.processId,
            processingType: inputs.generateWelcomeEmail.processingType,
            benefits: inputs.generateWelcomeEmail.benefits,
            completedAt: Date.now(),
            processingTimeMs: Date.now() - inputs.generateWelcomeEmail.timestamp,
          };
        },
      })

      // 최종 결과 포맷팅
      .addNode({
        name: 'formatOutput',
        execute: (data) => {
          executionLog.push('formatOutput');

          return {
            result: {
              customerId: data.customer.id,
              customerName: data.customer.name,
              status: 'onboarded',
              accountType: data.processingType,
              benefits: data.benefits,
              welcomeEmail: data.emailTemplate,
              metrics: {
                processingTimeMs: data.processingTimeMs,
                processId: data.processId,
                completedAt: new Date(data.completedAt).toISOString(),
              },
            },
          };
        },
      })

      // 엣지 연결
      .edge('inputData', ['validateEmail', 'validateSubscription'])
      .edge('mergeValidations', 'routeProcessing')
      .dynamicEdge('routeProcessing', (data) => {
        return data.nextSteps;
      })
      .edge('standardProcessing', ['generateWelcomeEmail', 'updateCustomerStatus', 'logActivity'])
      .edge('priorityProcessing', ['generateWelcomeEmail', 'updateCustomerStatus', 'logActivity'])
      .edge('mergeResults', 'formatOutput');

    // 테스트 실행 - 일반 유저
    const standardApp = workflow.compile('inputData');
    const standardResult = await standardApp.run({
      id: 'user123',
      name: 'John Doe',
      email: 'john@example.com',
      subscription: 'basic',
    });

    // 표준 경로 검증
    expect(standardResult.isOk).toBe(true);
    expect(standardResult.output.result.customerId).toBe('user123');
    expect(standardResult.output.result.customerName).toBe('John Doe');
    expect(standardResult.output.result.accountType).toBe('standard');
    expect(standardResult.output.result.welcomeEmail).toContain('Welcome John Doe');
    expect(standardResult.output.result.benefits).toContain('Basic support');

    // 실행 흐름 검증
    expect(executionLog).toContain('inputData');
    expect(executionLog).toContain('validateEmail');
    expect(executionLog).toContain('validateSubscription');
    expect(executionLog).toContain('mergeValidations');
    expect(executionLog).toContain('routeProcessing');
    expect(executionLog).toContain('standardProcessing');
    expect(executionLog).toContain('generateWelcomeEmail');
    expect(executionLog).toContain('updateCustomerStatus');
    expect(executionLog).toContain('logActivity');
    expect(executionLog).toContain('mergeResults');
    expect(executionLog).toContain('formatOutput');

    // 순서 검증
    const validationMergeIndex = executionLog.indexOf('mergeValidations');
    const routeIndex = executionLog.indexOf('routeProcessing');
    const standardProcessingIndex = executionLog.indexOf('standardProcessing');
    const resultsMergeIndex = executionLog.indexOf('mergeResults');
    const outputIndex = executionLog.indexOf('formatOutput');

    expect(validationMergeIndex).toBeLessThan(routeIndex);
    expect(routeIndex).toBeLessThan(standardProcessingIndex);
    expect(resultsMergeIndex).toBeLessThan(outputIndex);

    // 로그 초기화
    executionLog.length = 0;

    // 테스트 실행 - 엔터프라이즈 유저
    const enterpriseApp = workflow.compile('inputData');
    const enterpriseResult = await enterpriseApp.run({
      id: 'enterprise456',
      name: 'Jane Smith',
      email: 'jane@company.com',
      subscription: 'enterprise',
    });

    // 우선 경로 검증
    expect(enterpriseResult.isOk).toBe(true);
    expect(enterpriseResult.output.result.customerId).toBe('enterprise456');
    expect(enterpriseResult.output.result.accountType).toBe('priority');
    expect(enterpriseResult.output.result.benefits).toContain('Priority queue');

    // 로그 초기화
    executionLog.length = 0;

    // 테스트 실행 - 잘못된 데이터
    const invalidApp = workflow.compile('inputData');
    const invalidResult = await invalidApp.run({
      id: 'invalid789',
      name: 'Invalid User',
      email: 'not-an-email',
      subscription: 'unknown',
    });

    // 오류 경로 검증
    expect(invalidResult.isOk).toBe(true);
    expect(invalidResult.output.customerId).toBe('invalid789');
    expect(invalidResult.output.status).toBe('failed');
    expect(invalidResult.output.errors).toContain('Invalid email format');
    expect(invalidResult.output.errors).toContain('Unknown subscription type');

    // 노드 실행 확인
    expect(executionLog).toContain('errorProcessing');
    expect(executionLog).not.toContain('standardProcessing');
    expect(executionLog).not.toContain('priorityProcessing');
  });

  it('should process complex nested parallel flows and synchronize them correctly', async () => {
    // 이 테스트는 다중 레벨의 병렬 처리와 동기화를 포함하는 복잡한 워크플로우를 테스트합니다
    const timestamps = {
      start: 0,
      processingComplete: 0,
      calculationsComplete: 0,
      finalMergeComplete: 0,
      end: 0,
    };

    const workflow = createGraph()
      // 입력 노드
      .addNode({
        name: 'collectData',
        execute: (rawData: { items: any[] }) => {
          timestamps.start = Date.now();
          return {
            items: rawData.items,
            metadata: {
              startTime: timestamps.start,
              itemCount: rawData.items.length,
            },
          };
        },
      })

      // 첫 번째 수준 병렬 처리 노드들
      .addNode({
        name: 'processGroup1',
        execute: async (data) => {
          // 첫 번째 그룹의 아이템 처리
          const items = data.items.slice(0, Math.floor(data.items.length / 3));
          await delay(40);

          return {
            ...data,
            group1Result: items.map((item) => ({
              id: item.id,
              value: item.value * 2,
              processed: true,
            })),
          };
        },
      })
      .addNode({
        name: 'processGroup2',
        execute: async (data) => {
          // 두 번째 그룹의 아이템 처리
          const items = data.items.slice(Math.floor(data.items.length / 3), Math.floor((2 * data.items.length) / 3));
          await delay(60);

          return {
            ...data,
            group2Result: items.map((item) => ({
              id: item.id,
              value: item.value + 10,
              processed: true,
            })),
          };
        },
      })
      .addNode({
        name: 'processGroup3',
        execute: async (data) => {
          // 세 번째 그룹의 아이템 처리
          const items = data.items.slice(Math.floor((2 * data.items.length) / 3));
          await delay(50);

          return {
            ...data,
            group3Result: items.map((item) => ({
              id: item.id,
              value: item.value * 1.5,
              processed: true,
            })),
          };
        },
      })

      // 첫 번째 병합 노드
      .addMergeNode({
        name: 'mergeProcessedGroups',
        branch: ['processGroup1', 'processGroup2', 'processGroup3'],
        execute: (inputs) => {
          timestamps.processingComplete = Date.now();

          // 모든 처리된 그룹 결과 합치기
          const combinedResults = [
            ...inputs.processGroup1.group1Result,
            ...inputs.processGroup2.group2Result,
            ...inputs.processGroup3.group3Result,
          ];

          return {
            metadata: inputs.processGroup1.metadata,
            processedItems: combinedResults,
            processingTimeMs: timestamps.processingComplete - inputs.processGroup1.metadata.startTime,
          };
        },
      })

      // 두 번째 수준 병렬 처리 노드들 - 계산 및 분석
      .addNode({
        name: 'calculateStatistics',
        execute: (data) => {
          // 기본 통계 계산
          const values = data.processedItems.map((item) => item.value);
          const sum = values.reduce((acc, val) => acc + val, 0);
          const avg = sum / values.length;
          const min = Math.min(...values);
          const max = Math.max(...values);

          return {
            ...data,
            statistics: {
              count: values.length,
              sum,
              avg,
              min,
              max,
            },
          };
        },
      })
      .addNode({
        name: 'categorizeItems',
        execute: async (data) => {
          // 값에 따라 아이템 분류
          await delay(35);

          const categories = {
            low: data.processedItems.filter((item) => item.value < 30),
            medium: data.processedItems.filter((item) => item.value >= 30 && item.value < 80),
            high: data.processedItems.filter((item) => item.value >= 80),
          };

          return {
            ...data,
            categories,
          };
        },
      })
      .addNode({
        name: 'findTopItems',
        execute: async (data) => {
          // 상위 아이템 식별
          await delay(20);

          const sortedItems = [...data.processedItems].sort((a, b) => b.value - a.value);
          const topItems = sortedItems.slice(0, 3);

          return {
            ...data,
            topItems,
          };
        },
      })

      // 두 번째 병합 노드
      .addMergeNode({
        name: 'mergeCalculations',
        branch: ['calculateStatistics', 'categorizeItems', 'findTopItems'],
        execute: (inputs) => {
          timestamps.calculationsComplete = Date.now();

          return {
            metadata: inputs.calculateStatistics.metadata,
            statistics: inputs.calculateStatistics.statistics,
            categories: inputs.categorizeItems.categories,
            topItems: inputs.findTopItems.topItems,
            processingTimeMs: inputs.calculateStatistics.processingTimeMs,
            analysisTimeMs: timestamps.calculationsComplete - timestamps.processingComplete,
          };
        },
      })

      // 병렬 요약 생성 노드들
      .addNode({
        name: 'generateSummaryReport',
        execute: (data) => {
          return {
            ...data,
            summaryReport: {
              title: 'Data Processing Summary',
              processedCount: data.statistics.count,
              averageValue: data.statistics.avg.toFixed(2),
              topPerformers: data.topItems.map((item) => item.id),
              processingMetrics: {
                totalTimeMs: data.processingTimeMs + data.analysisTimeMs,
                itemsPerSecond: Math.floor(
                  data.statistics.count / ((data.processingTimeMs + data.analysisTimeMs) / 1000)
                ),
              },
            },
          };
        },
      })
      .addNode({
        name: 'generateCategoryBreakdown',
        execute: (data) => {
          return {
            ...data,
            categoryBreakdown: {
              low: {
                count: data.categories.low.length,
                percentage: ((data.categories.low.length / data.statistics.count) * 100).toFixed(1) + '%',
              },
              medium: {
                count: data.categories.medium.length,
                percentage: ((data.categories.medium.length / data.statistics.count) * 100).toFixed(1) + '%',
              },
              high: {
                count: data.categories.high.length,
                percentage: ((data.categories.high.length / data.statistics.count) * 100).toFixed(1) + '%',
              },
            },
          };
        },
      })

      // 최종 병합 노드
      .addMergeNode({
        name: 'mergeFinalResults',
        branch: ['generateSummaryReport', 'generateCategoryBreakdown'],
        execute: (inputs) => {
          timestamps.finalMergeComplete = Date.now();

          return {
            summary: inputs.generateSummaryReport.summaryReport,
            categories: inputs.generateCategoryBreakdown.categoryBreakdown,
            metadata: inputs.generateSummaryReport.metadata,
            performance: {
              processingMs: inputs.generateSummaryReport.processingTimeMs,
              analysisMs: inputs.generateSummaryReport.analysisTimeMs,
              reportGenerationMs: timestamps.finalMergeComplete - timestamps.calculationsComplete,
              totalMs: timestamps.finalMergeComplete - inputs.generateSummaryReport.metadata.startTime,
            },
          };
        },
      })

      // 최종 출력 노드
      .addNode({
        name: 'formatFinalOutput',
        execute: (data) => {
          timestamps.end = Date.now();

          return {
            results: {
              summary: data.summary,
              categoryDistribution: data.categories,
              executionMetrics: {
                ...data.performance,
                outputFormattingMs: timestamps.end - timestamps.finalMergeComplete,
                totalExecutionTimeMs: timestamps.end - data.metadata.startTime,
              },
            },
          };
        },
      })

      // 엣지 설정
      .edge('collectData', ['processGroup1', 'processGroup2', 'processGroup3'])
      .edge('mergeProcessedGroups', ['calculateStatistics', 'categorizeItems', 'findTopItems'])
      .edge('mergeCalculations', ['generateSummaryReport', 'generateCategoryBreakdown'])
      .edge('mergeFinalResults', 'formatFinalOutput');

    // 테스트 데이터 생성
    const testItems = Array.from({ length: 30 }, (_, index) => ({
      id: `item-${index + 1}`,
      value: Math.floor(Math.random() * 100) + 1,
    }));

    // 워크플로우 실행
    const app = workflow.compile('collectData');
    const result = await app.run({ items: testItems });

    // 결과 검증
    expect(result.isOk).toBe(true);

    // 기본 결과 구조 확인
    expect(result.output.results).toBeDefined();
    expect(result.output.results.summary).toBeDefined();
    expect(result.output.results.categoryDistribution).toBeDefined();
    expect(result.output.results.executionMetrics).toBeDefined();

    // 처리된 항목 수 확인
    expect(result.output.results.summary.processedCount).toBe(testItems.length);

    // 실행 시간 지표 확인
    expect(result.output.results.executionMetrics.totalExecutionTimeMs).toBeGreaterThan(0);
    expect(result.output.results.executionMetrics.processingMs).toBeLessThan(
      result.output.results.executionMetrics.totalExecutionTimeMs
    );

    // 수행 기록 확인
    const nodeNames = result.histories.map((h) => h.node.name);
    expect(nodeNames).toContain('collectData');
    expect(nodeNames).toContain('processGroup1');
    expect(nodeNames).toContain('processGroup2');
    expect(nodeNames).toContain('processGroup3');
    expect(nodeNames).toContain('mergeProcessedGroups');
    expect(nodeNames).toContain('calculateStatistics');
    expect(nodeNames).toContain('categorizeItems');
    expect(nodeNames).toContain('findTopItems');
    expect(nodeNames).toContain('mergeCalculations');
    expect(nodeNames).toContain('generateSummaryReport');
    expect(nodeNames).toContain('generateCategoryBreakdown');
    expect(nodeNames).toContain('mergeFinalResults');
    expect(nodeNames).toContain('formatFinalOutput');

    // 최종 노드 출력 확인
    const finalNodeExecution = result.histories.find((h) => h.node.name === 'formatFinalOutput');
    expect(finalNodeExecution).toBeDefined();
    expect(finalNodeExecution?.node.output).toEqual(result.output);
  });

  it('should handle complex branching with conditional paths and data transformations', async () => {
    // 이 테스트는 조건부 분기와 데이터 변환이 포함된 복잡한 워크플로우를 시뮬레이션합니다
    const executedPaths: string[] = [];

    const workflow = createGraph()
      // 시작 노드
      .addNode({
        name: 'startProcess',
        execute: (data: { type: string; payload: any }) => {
          executedPaths.push('startProcess');
          return {
            type: data.type,
            payload: data.payload,
            traceId: `trace-${Date.now()}`,
            startedAt: Date.now(),
          };
        },
      })

      // 데이터 유형별 라우팅
      .addNode({
        name: 'routeByType',
        execute: (data) => {
          executedPaths.push('routeByType');
          return data;
        },
      })

      // A 유형 처리 경로
      .addNode({
        name: 'processTypeA',
        execute: async (data) => {
          executedPaths.push('processTypeA');
          await delay(30);

          return {
            ...data,
            result: {
              ...data.payload,
              processed: true,
              score: (data.payload.value || 0) * 1.5,
            },
          };
        },
      })

      // B 유형 처리 경로
      .addNode({
        name: 'processTypeB',
        execute: async (data) => {
          executedPaths.push('processTypeB');
          await delay(25);

          return {
            ...data,
            result: {
              ...data.payload,
              processed: true,
              factor: Math.round(data.payload.multiplier || 1),
            },
          };
        },
      })

      // C 유형 처리 경로 (중첩 분기 포함)
      .addNode({
        name: 'processTypeC',
        execute: (data) => {
          executedPaths.push('processTypeC');

          // 우선순위에 따라 세부 유형 결정
          const priority = data.payload.priority || 'normal';

          return {
            ...data,
            subType: priority,
            initialProcessing: {
              timestamp: Date.now(),
              processedValue: data.payload.value * 2,
            },
          };
        },
      })

      // C 유형 우선순위별 처리
      .addNode({
        name: 'processCHighPriority',
        execute: async (data) => {
          executedPaths.push('processCHighPriority');
          await delay(10); // 우선순위 높음 = 빠른 처리

          return {
            ...data,
            result: {
              ...data.payload,
              processedValue: data.initialProcessing.processedValue,
              priority: 'high',
              expressProcessing: true,
            },
          };
        },
      })
      .addNode({
        name: 'processCNormalPriority',
        execute: async (data) => {
          executedPaths.push('processCNormalPriority');
          await delay(40); // 일반 처리 시간

          return {
            ...data,
            result: {
              ...data.payload,
              processedValue: data.initialProcessing.processedValue,
              priority: 'normal',
              standardProcessing: true,
            },
          };
        },
      })
      .addNode({
        name: 'processCLowPriority',
        execute: async (data) => {
          executedPaths.push('processCLowPriority');
          await delay(70); // 우선순위 낮음 = 느린 처리

          return {
            ...data,
            result: {
              ...data.payload,
              processedValue: data.initialProcessing.processedValue,
              priority: 'low',
              batchProcessing: true,
            },
          };
        },
      })

      // 공통 후처리 단계
      .addNode({
        name: 'applyMetadata',
        execute: (data) => {
          executedPaths.push('applyMetadata');

          return {
            ...data,
            result: {
              ...data.result,
              metadata: {
                traceId: data.traceId,
                processedAt: new Date().toISOString(),
                processingTimeMs: Date.now() - data.startedAt,
              },
            },
          };
        },
      })

      // 유효성 검사
      .addNode({
        name: 'validateResult',
        execute: (data) => {
          executedPaths.push('validateResult');

          // 결과 유효성 검사 (단순화)
          const isValid = data.result && Object.keys(data.result).length > 0;

          return {
            ...data,
            validation: {
              isValid,
              timestamp: Date.now(),
            },
          };
        },
      })

      // 최종 결과 형식화
      .addNode({
        name: 'formatResult',
        execute: (data) => {
          executedPaths.push('formatResult');

          return {
            success: data.validation.isValid,
            data: data.result,
            processingTime: `${data.result.metadata.processingTimeMs}ms`,
            type: data.type,
          };
        },
      })

      // 에지 설정
      .edge('startProcess', 'routeByType')
      .dynamicEdge('routeByType', (data) => {
        if (data.type === 'A') return 'processTypeA';
        if (data.type === 'B') return 'processTypeB';
        if (data.type === 'C') return 'processTypeC';
        throw new Error(`Unknown type: ${data.type}`);
      })
      .edge('processTypeA', 'applyMetadata')
      .edge('processTypeB', 'applyMetadata')
      .dynamicEdge('processTypeC', (data) => {
        if (data.subType === 'high') return 'processCHighPriority';
        if (data.subType === 'low') return 'processCLowPriority';
        return 'processCNormalPriority';
      })
      .edge('processCHighPriority', 'applyMetadata')
      .edge('processCNormalPriority', 'applyMetadata')
      .edge('processCLowPriority', 'applyMetadata')
      .edge('applyMetadata', 'validateResult')
      .edge('validateResult', 'formatResult');

    // 테스트 A 유형
    const appA = workflow.compile('startProcess');
    const resultA = await appA.run({
      type: 'A',
      payload: { id: 'A-001', value: 10 },
    });

    expect(resultA.isOk).toBe(true);
    expect(resultA.output.success).toBe(true);
    expect(resultA.output.type).toBe('A');
    expect(resultA.output.data.score).toBe(15); // 10 * 1.5
    expect(executedPaths).toContain('processTypeA');
    expect(executedPaths).not.toContain('processTypeB');
    expect(executedPaths).not.toContain('processTypeC');

    // 실행 경로 초기화
    executedPaths.length = 0;

    // 테스트 B 유형
    const appB = workflow.compile('startProcess');
    const resultB = await appB.run({
      type: 'B',
      payload: { id: 'B-001', multiplier: 3.7 },
    });

    expect(resultB.isOk).toBe(true);
    expect(resultB.output.success).toBe(true);
    expect(resultB.output.type).toBe('B');
    expect(resultB.output.data.factor).toBe(4); // Math.round(3.7)
    expect(executedPaths).toContain('processTypeB');
    expect(executedPaths).not.toContain('processTypeA');
    expect(executedPaths).not.toContain('processTypeC');

    // 실행 경로 초기화
    executedPaths.length = 0;

    // 테스트 C 유형 (우선순위 높음)
    const appCHigh = workflow.compile('startProcess');
    const resultCHigh = await appCHigh.run({
      type: 'C',
      payload: { id: 'C-001', value: 5, priority: 'high' },
    });

    expect(resultCHigh.isOk).toBe(true);
    expect(resultCHigh.output.success).toBe(true);
    expect(resultCHigh.output.type).toBe('C');
    expect(resultCHigh.output.data.processedValue).toBe(10); // 5 * 2
    expect(resultCHigh.output.data.expressProcessing).toBe(true);
    expect(executedPaths).toContain('processTypeC');
    expect(executedPaths).toContain('processCHighPriority');
    expect(executedPaths).not.toContain('processCNormalPriority');
    expect(executedPaths).not.toContain('processCLowPriority');

    // 실행 경로 초기화
    executedPaths.length = 0;

    // 테스트 C 유형 (우선순위 낮음)
    const appCLow = workflow.compile('startProcess');
    const resultCLow = await appCLow.run({
      type: 'C',
      payload: { id: 'C-002', value: 7, priority: 'low' },
    });

    expect(resultCLow.isOk).toBe(true);
    expect(resultCLow.output.success).toBe(true);
    expect(resultCLow.output.type).toBe('C');
    expect(resultCLow.output.data.processedValue).toBe(14); // 7 * 2
    expect(resultCLow.output.data.batchProcessing).toBe(true);
    expect(executedPaths).toContain('processTypeC');
    expect(executedPaths).toContain('processCLowPriority');
    expect(executedPaths).not.toContain('processCHighPriority');
    expect(executedPaths).not.toContain('processCNormalPriority');

    // 모든 테스트에서 공통 경로 통과 확인
    expect(executedPaths).toContain('startProcess');
    expect(executedPaths).toContain('routeByType');
    expect(executedPaths).toContain('applyMetadata');
    expect(executedPaths).toContain('validateResult');
    expect(executedPaths).toContain('formatResult');
  });
});

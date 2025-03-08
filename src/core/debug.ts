import { GraphRunnable } from '../interfaces';

export const runnerDebug = (runner: GraphRunnable<any, any, any>) => {
  runner.subscribe((e) => {
    switch (e.eventType) {
      case 'WORKFLOW_START': {
        console.log(`GRAPH-START---------`);
        console.dir({ input: e.input }, { depth: undefined });
        console.log(`--------------------\n\n`);
        return;
      }
      case 'WORKFLOW_END': {
        console.log(`GRAPH-END---------`);
        console.dir(
          {
            histories: e.histories,
            ...(e.isOk
              ? {
                  output: e.output,
                }
              : {
                  error: e.error,
                }),
          },
          { depth: undefined }
        );
        console.log(`--------------------\n\n`);
        return;
      }
      case 'NODE_START': {
        console.log(`NODE-START---------`);
        console.dir(
          {
            name: e.node.name,
            input: e.node.input,
          },
          { depth: undefined }
        );
        console.log(`--------------------\n\n`);
        return;
      }
      case 'NODE_END': {
        console.log(`NODE-END---------`);
        console.dir(
          {
            name: e.node.name,
            ...(e.isOk
              ? {
                  output: e.node.output,
                }
              : {
                  error: e.error,
                }),
          },
          { depth: undefined }
        );
        console.log(`--------------------\n\n`);
      }
    }
  });
};

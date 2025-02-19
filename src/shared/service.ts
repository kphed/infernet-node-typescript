// Reference: https://github.com/ritual-net/infernet-node/blob/69963b80106f8c518c80e6617c538a599b9a30a1/src/shared/service.py.
import { z } from 'zod';

// Define schemas as external variables (vs. static properties) to avoid clashing with classes that extend `AsyncTask`.
const FieldSchemas = {
  shutdown: z.boolean(),
};

const MethodSchemas = {
  setup: {
    returns: z.void(),
  },
  run_forever: {
    returns: z.void(),
  },
  cleanup: {
    returns: z.void(),
  },
  stop: {
    returns: z.void(),
  },
};

export abstract class AsyncTask {
  shutdown: z.infer<typeof FieldSchemas.shutdown> = false;

  abstract setup(): z.infer<typeof MethodSchemas.setup.returns>;

  abstract run_forever(): z.infer<typeof MethodSchemas.run_forever.returns>;

  abstract cleanup(): z.infer<typeof MethodSchemas.cleanup.returns>;

  stop(): z.infer<typeof MethodSchemas.stop.returns> {
    this.shutdown = true;
  }
}

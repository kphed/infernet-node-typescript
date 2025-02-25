// Reference: https://github.com/ritual-net/infernet-node/blob/69963b80106f8c518c80e6617c538a599b9a30a1/src/shared/service.py.
import { z } from 'zod';

// Define schemas as external variables (vs. static properties) to avoid clashing with classes that extend `AsyncTask`.
const FieldSchemas = {
  shutdown: z.boolean(),
};

const MethodSchemas = {
  stop: z.function(),
};

export abstract class AsyncTask {
  shutdown: z.infer<typeof FieldSchemas.shutdown> = false;

  abstract setup(...args: any);

  abstract run_forever(...args: any);

  abstract cleanup(...args: any);

  stop = MethodSchemas.stop.implement(() => {
    this.shutdown = true;
  });
}

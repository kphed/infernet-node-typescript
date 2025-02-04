// Reference: https://github.com/ritual-net/infernet-node/blob/69963b80106f8c518c80e6617c538a599b9a30a1/src/shared/service.py.
export abstract class AsyncTask {
  shutdown: boolean = false;

  abstract setup(): void;

  abstract run_forever(): void;

  abstract cleanup(): void;

  stop(): void {
    this.shutdown = true;
  }
}

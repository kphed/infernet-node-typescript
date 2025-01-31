// Reference: https://github.com/ritual-net/infernet-node/blob/69963b80106f8c518c80e6617c538a599b9a30a1/src/shared/service.py.
const notImplementedError = new Error('Not implemented');

export class AsyncTask {
  private _shutdown: boolean = false;

  public async setup() {
    throw notImplementedError;
  }

  public async runForever() {
    throw notImplementedError;
  }

  public async cleanup() {
    throw notImplementedError;
  }

  public async stop() {
    this._shutdown = true;
  }
}

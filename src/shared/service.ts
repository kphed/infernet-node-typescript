// Reference: https://github.com/ritual-net/infernet-node/blob/69963b80106f8c518c80e6617c538a599b9a30a1/src/shared/service.py.
const notImplementedError = new Error('Not implemented');

export class AsyncTask {
  private _shutdown: boolean = false;

  public async setup(...args: any[]) {
    throw notImplementedError;
  }

  public async runForever(...args: any[]) {
    throw notImplementedError;
  }

  public async cleanup(...args: any[]) {
    throw notImplementedError;
  }

  public async stop(...args: any[]) {
    this._shutdown = true;
  }
}

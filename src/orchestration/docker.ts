import Docker from 'dockerode';
import { InfernetContainer, ConfigDocker } from '../shared/config';
import { AsyncTask } from '../shared/service';
import dockerClient from '../docker/client';

export class ContainerManager extends AsyncTask {
  private _configs: InfernetContainer[];
  private _creds?: ConfigDocker;
  private _images: string[];
  private _url_mappings: {
    [key: string]: string;
  };
  private _bearer_mappings: {
    [key: string]: string;
  };
  private _startup_wait: number;
  private _managed: boolean;
  private _containers?: {
    [key: string]: any;
  };
  public port_mappings: {
    [key: string]: number;
  };
  public client?: Docker;

  constructor(
    configs: InfernetContainer[],
    credentials?: ConfigDocker,
    startup_wait: number = 60,
    managed: boolean = true
  ) {
    super();

    this._configs = configs;
    this._creds = credentials;
    this._images = configs.map(({ image }) => image);
    this.port_mappings = configs.reduce(
      (acc, { id, port }) => ({
        ...acc,
        [id]: port,
      }),
      {}
    );
    this._url_mappings = configs.reduce(
      (acc, { id, url }) => ({
        ...acc,
        [id]: url,
      }),
      {}
    );
    this._bearer_mappings = configs.reduce(
      (acc, { id, bearer }) => ({
        ...acc,
        [id]: bearer,
      }),
      {}
    );
    this._startup_wait = startup_wait;
    this._managed = managed;

    if (managed)
      this.client = dockerClient(credentials?.username, credentials?.password);

    console.debug('Initialized Container Manager');
  }

  private async _pull_images() {
    console.info('Pulling images, this may take a while...');

    // Pulls images in parallel (each one finishes asynchronously). Resolves once all images have been pulled.
    const pullImages = () => {
      const pulledImages: number[] = [];

      return new Promise((resolve, reject) => {
        this._images.forEach((image, index) => {
          console.debug(`Pulling image ${image}...`);

          this.client.pull(image, null, (err, stream) => {
            if (err) {
              console.error(`Error pulling image ${image}`);

              reject(err);
            }

            this.client.modem.followProgress(stream, () => {
              console.error(`Successfully pulled image ${image}`);

              pulledImages.push(index);

              if (pulledImages.length === this._images.length) resolve(true);
            });
          });
        });
      });
    };

    try {
      await pullImages();
    } catch (err) {
      console.error('Could not pull all images.');

      throw err;
    }
  }

  async setup(pruneContainers: boolean = false) {
    if (!this._managed) {
      console.log(
        'Skipping container manager setup, containers are not managed'
      );

      return;
    }

    try {
      await this._pull_images();
    } catch (err) {
      console.error(err);
    }
  }
}

import Docker from 'dockerode';
import BluebirdPromise from 'bluebird';
import { InfernetContainer, ConfigDocker } from '../shared/config';
import { AsyncTask } from '../shared/service';
import dockerClient from '../docker/client';
import { delay } from '../utils/helpers';

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
  private _containers: {
    [key: string]: any;
  };
  public port_mappings: {
    [key: string]: number;
  };
  public client?: Docker;

  constructor(
    configs: InfernetContainer[],
    credentials?: ConfigDocker,
    startup_wait: number = 60_000,
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
    this._containers = {};

    if (managed)
      this.client = dockerClient(credentials?.username, credentials?.password);

    console.debug('Initialized Container Manager');
  }

  /**
   * Pulls all managed images in parallel.
   */
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

  /**
   * Force stops and removes any (running) containers with names matching any IDs
   * provided in the managed containers config.
   */
  async _prune_containers() {
    try {
      const containers = (await this.client.listContainers()).reduce(
        (acc, { Image, Id }) => ({
          ...acc,
          [Image]: Id,
        }),
        {}
      );

      await BluebirdPromise.each(this._configs, async (config) => {
        const containerId = containers[config.image];

        if (!containerId) return;

        console.warn(`Pruning container ${containerId}`);

        try {
          await (
            await this.client.getContainer(containerId)
          ).remove({ force: true });
        } catch (err) {
          console.error(`Error pruning container ${containerId}`);

          throw err;
        }
      });
    } catch (err) {
      console.error('Error pruning containers');

      throw err;
    }
  }

  /**
   * Runs all containers with given configurations.
   */
  private async _run_containers() {
    try {
      const existingContainers = (
        await this.client.listContainers({ all: true })
      ).reduce((acc, val) => {
        const { State, Id, Image, Created } = val;

        // Skip the container if it is older than the one currently stored.
        if (acc[Image] && acc[Image].created > Created) return acc;

        return {
          ...acc,
          [Image]: {
            id: Id,
            created: Created,
            isRunning: State === 'running',
          },
        };
      }, {});

      await BluebirdPromise.each(this._configs, async (config) => {
        const existingContainer = existingContainers[config.image];
        let container;

        // If the container exists and is not running, start the container.
        if (existingContainer) {
          container = this.client.getContainer(existingContainer.id);

          if (!existingContainer.isRunning) {
            await container.start();

            console.info(
              `Started existing container '${config.id}' on port ${config.port}`
            );
          }
        } else {
          const containerEnv = config.env
            ? Object.keys(config.env).reduce(
                (acc: string[], val) => [...acc, `${val}=${config.env[val]}`],
                []
              )
            : [];
          const exposedPorts = {
            [`${config.port}/tcp`]: {},
          };
          const hostConfig = {
            PortBindings: {
              [`${config.port}/tcp`]: [
                {
                  HostPort: `${config.port}`,
                },
              ],
            },
            PublishAllPorts: true,
            RestartPolicy: {
              Name: 'on-failure',
              MaximumRetryCount: 5,
            },
            DeviceRequests: [
              ...(config.gpu
                ? [
                    {
                      Driver: 'nvidia',
                      Count: -1,
                    },
                  ]
                : []),
            ],
          };
          const { volumes } = config.volumes;

          // If the container does not exist, create and run a new container with the given configuration.
          container = await this.client.createContainer({
            ...(config.command ? { Cmd: config.command } : {}),
            Image: config.image,
            Env: containerEnv,
            ExposedPorts: exposedPorts,
            HostConfig: hostConfig,
            Volumes: volumes,
          });

          await container.rename({ name: config.id });
          await container.start();

          console.info(
            `Started new container '${config.id}' on port ${config.port}`
          );
        }

        // Store existing container object in state.
        this._containers[container.id] = container;
      });
    } catch (err) {
      throw err;
    }
  }

  /**
   * Get list of running container IDs.
   */
  public async running_containers() {
    const configIds = this._configs.reduce(
      (acc, { id }) => ({
        ...acc,
        [id]: true,
      }),
      {}
    );

    // If not managed, return all container IDs as running.
    if (!this._managed) return Object.keys(configIds);

    try {
      const containers = await this.client.listContainers();

      return containers.reduce((acc, val) => {
        const containerName = val.Names[0].substring(1);

        if (val.State === 'running' && configIds[containerName])
          return [...acc, containerName];

        return acc;
      }, []);
    } catch (err) {
      console.error('Error getting running containers');

      throw err;
    }
  }

  /**
   * Get running container information.
   */
  public async running_container_info() {
    const runningContainerIds = (await this.running_containers()).reduce(
      (acc, val) => ({ ...acc, [val]: true }),
      {}
    );

    return this._configs.reduce(
      (
        acc: {
          id: string;
          description: string;
          external: boolean;
          image: string;
        }[],
        val
      ) => {
        const { id, description, external, image } = val;

        // If the container is running, add it to the list of running container info.
        if (runningContainerIds[id]) {
          return [
            ...acc,
            {
              id,
              description,
              external,
              image,
            },
          ];
        }

        return acc;
      },
      []
    );
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

      if (pruneContainers) await this._prune_containers();

      await this._run_containers();

      console.info('Waiting for container startup', this._startup_wait);

      await delay(this._startup_wait);

      console.info(
        'Container manager setup complete',
        await this.running_containers()
      );
    } catch (err) {
      console.error('Error setting up container manager', err);

      throw new Error(
        'Container manager setup failed. Check logs for details.'
      );
    }
  }
}

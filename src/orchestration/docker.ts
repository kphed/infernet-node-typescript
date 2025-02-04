import Docker from 'dockerode';
import BluebirdPromise from 'bluebird';
import { InfernetContainer, ConfigDocker } from '../shared/config';
import { AsyncTask } from '../shared/service';
import dockerClient from '../docker/client';
import { delay } from '../utils/helpers';

// 60 seconds.
const DEFAULT_STARTUP_WAIT = 60_000;

export class ContainerManager extends AsyncTask {
  #configs: InfernetContainer[];
  #creds?: ConfigDocker;
  #images: string[];
  #port_mappings: {
    [key: string]: number;
  };
  #url_mappings: {
    [key: string]: string;
  };
  #bearer_mappings: {
    [key: string]: string;
  };
  #startup_wait: number;
  #managed: boolean;
  #containers: {
    [key: string]: any;
  };
  client?: Docker;

  /**
   * Initialize ContainerManager with given configurations and credentials.
   */
  constructor(
    configs: InfernetContainer[],
    credentials?: ConfigDocker,
    startup_wait: number = DEFAULT_STARTUP_WAIT,
    managed: boolean = true
  ) {
    super();

    this.#configs = configs;
    this.#creds = credentials;
    this.#images = configs.map(({ image }) => image);
    this.#port_mappings = configs.reduce(
      (acc, { id, port }) => ({
        ...acc,
        [id]: port,
      }),
      {}
    );
    this.#url_mappings = configs.reduce(
      (acc, { id, url }) => ({
        ...acc,
        [id]: url,
      }),
      {}
    );
    this.#bearer_mappings = configs.reduce(
      (acc, { id, bearer }) => ({
        ...acc,
        [id]: bearer,
      }),
      {}
    );
    this.#startup_wait = startup_wait;
    this.#managed = managed;
    this.#containers = {};

    if (managed)
      this.client = dockerClient(credentials?.username, credentials?.password);

    console.debug(
      'Initialized Container Manager',
      JSON.stringify(this.#port_mappings)
    );
  }

  /**
   * Port mappings for containers. Does NOT guarantee containers are running.
   */
  get port_mappings(): {
    [key: string]: number;
  } {
    return this.#port_mappings;
  }

  /**
   * Get list of running container IDs.
   */
  async running_containers(): Promise<string[]> {
    // If not managed, return all container IDs as running.
    if (!this.#managed) return Object.keys(this.#containers);

    try {
      const containers = await this.client.listContainers();

      return containers.reduce(
        (acc: string[], { Id, State }) =>
          this.#containers[Id] && State === 'running' ? [...acc, Id] : acc,
        []
      );
    } catch (err) {
      throw err;
    }
  }

  /**
   * Get running container information.
   */
  async running_container_info(): Promise<
    {
      [key: string]: any;
    }[]
  > {
    const runningContainerIds = (await this.running_containers()).reduce(
      (acc, val) => ({ ...acc, [val]: true }),
      {}
    );

    return this.#configs.reduce(
      (
        acc: {
          id: string;
          description: string;
          external: boolean;
          image: string;
        }[],
        { id, description, external, image }
      ) =>
        // If the container is running, add it to the list of running container info.
        runningContainerIds[id]
          ? [
              ...acc,
              {
                id,
                description,
                external,
                image,
              },
            ]
          : acc,
      []
    );
  }

  /**
   * Returns port for given container.
   */
  get_port(container: string): number {
    return this.#port_mappings[container];
  }

  /**
   * Returns url for given container.
   */
  get_url(container: string): string {
    return this.#url_mappings[container];
  }

  /**
   * Returns bearer auth token for given container.
   */
  get_bearer(container: string): string {
    return this.#bearer_mappings[container];
  }

  /**
   * Setup orchestrator. If containers are managed:
   * 1. Pulls images in parallel, if not already pulled.
   * 2. Prunes any containers with conflicting IDs, if prune_containers is True.
   * 3. Creates containers, if not already created.
   * 4. Starts containers, if not already started.
   * 5. Waits for startup_wait seconds for containers to start.
   */
  async setup(pruneContainers: boolean = false) {
    if (!this.#managed) {
      console.log(
        'Skipping container manager setup, containers are not managed'
      );

      return;
    }

    try {
      await this.#pull_images();

      if (pruneContainers) await this.#prune_containers();

      await this.#run_containers();

      console.info('Waiting for container startup', this.#startup_wait);

      await delay(this.#startup_wait);

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

  runForever(): void {}

  stop(): void {}

  cleanup(): void {}

  /**
   * Pulls all managed images in parallel.
   */
  async #pull_images() {
    console.info('Pulling images, this may take a while...');

    // Pulls images in parallel (each one finishes asynchronously). Resolves once all images have been pulled.
    const pullImages = () => {
      const pulledImages: number[] = [];

      return new Promise((resolve, reject) => {
        this.#images.forEach((image, index) => {
          console.debug(`Pulling image ${image}...`);

          this.client.pull(image, null, (err, stream) => {
            if (err) {
              console.error(`Error pulling image ${image}`);

              reject(err);
            }

            this.client.modem.followProgress(stream, () => {
              console.error(`Successfully pulled image ${image}`);

              pulledImages.push(index);

              if (pulledImages.length === this.#images.length) resolve(true);
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
  async #prune_containers() {
    try {
      const containers = (await this.client.listContainers()).reduce(
        (acc, { Image, Id }) => ({
          ...acc,
          [Image]: Id,
        }),
        {}
      );

      await BluebirdPromise.each(this.#configs, async (config) => {
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
  async #run_containers() {
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

      await BluebirdPromise.each(this.#configs, async (config) => {
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
        this.#containers[container.id] = container;
      });
    } catch (err) {
      throw err;
    }
  }
}

// Reference: https://github.com/ritual-net/infernet-node/blob/44c4cc8acadd3c6904b74adaa595ac002ded0ebf/src/orchestration/docker.py.
import Docker from 'dockerode';
import { z } from 'zod';
import { InfernetContainerSchema, ConfigDockerSchema } from '../shared/config';
import { AsyncTask } from '../shared/service';
import dockerClient from '../docker/client';
import { delay } from '../utils/helpers';

// 60 seconds.
const DEFAULT_CONTAINER_STOP_TIMEOUT = 60_000;

export class ContainerManager extends AsyncTask {
  static fieldSchemas = {
    _configs: InfernetContainerSchema.array(),
    _creds: ConfigDockerSchema.optional(),
    _images: z.string().array(),
    _port_mappings: z.object({}).catchall(z.number().positive()),
    _url_mappings: z.object({}).catchall(z.string()),
    _bearer_mappings: z.object({}).catchall(z.string()),
    _startup_wait: z.number().default(60_000),
    _managed: z.boolean().default(true),
    _containers: z.object({}),
  };

  static methodSchemas = {
    port_mappings: {
      returns: this.fieldSchemas._port_mappings,
    },
    running_containers: {
      returns: z.string().array(),
    },
    running_container_info: {
      returns: z
        .object({
          id: z.string(),
          description: z.string().default(''),
          external: z.boolean(),
          image: z.string(),
        })
        .strict()
        .array(),
    },
    get_port: {
      args: {
        container: z.string(),
      },
      returns: z.number().positive(),
    },
    get_url: {
      args: {
        container: z.string(),
      },
      returns: z.string().url(),
    },
    get_bearer: {
      args: {
        container: z.string(),
      },
      returns: z.string(),
    },
  };

  #configs: z.infer<typeof ContainerManager.fieldSchemas._configs>;
  #creds?: z.infer<typeof ContainerManager.fieldSchemas._creds>;
  #images: z.infer<typeof ContainerManager.fieldSchemas._images>;
  #port_mappings: z.infer<typeof ContainerManager.fieldSchemas._port_mappings>;
  #url_mappings: z.infer<typeof ContainerManager.fieldSchemas._url_mappings>;
  #bearer_mappings: z.infer<
    typeof ContainerManager.fieldSchemas._bearer_mappings
  >;
  #startup_wait: z.infer<typeof ContainerManager.fieldSchemas._startup_wait>;
  #managed: z.infer<typeof ContainerManager.fieldSchemas._managed>;
  #containers: z.infer<typeof ContainerManager.fieldSchemas._containers>;
  client?: Docker;

  constructor(configs, credentials?, startup_wait?, managed?) {
    super();

    this.#configs = ContainerManager.fieldSchemas._configs.parse(configs);
    this.#creds = ContainerManager.fieldSchemas._creds.parse(credentials);
    this.#images = ContainerManager.fieldSchemas._images.parse(
      configs.map(({ image }) => image)
    );
    this.#port_mappings = ContainerManager.fieldSchemas._port_mappings.parse(
      configs.reduce(
        (acc, { id, port }) => ({
          ...acc,
          [id]: port,
        }),
        {}
      )
    );
    this.#url_mappings = ContainerManager.fieldSchemas._url_mappings.parse(
      configs.reduce(
        (acc, { id, url }) => ({
          ...acc,
          [id]: url,
        }),
        {}
      )
    );
    this.#bearer_mappings =
      ContainerManager.fieldSchemas._bearer_mappings.parse(
        configs.reduce(
          (acc, { id, bearer }) => ({
            ...acc,
            [id]: bearer,
          }),
          {}
        )
      );
    this.#startup_wait =
      ContainerManager.fieldSchemas._startup_wait.parse(startup_wait);
    this.#managed = ContainerManager.fieldSchemas._managed.parse(managed);
    this.#containers = ContainerManager.fieldSchemas._containers.parse({});

    if (this.#managed)
      this.client = dockerClient(credentials?.username, credentials?.password);

    console.debug('Initialized Container Manager', {
      port_mappings: this.#port_mappings,
    });
  }

  // Port mappings for containers. Does NOT guarantee containers are running.
  get port_mappings(): z.infer<
    typeof ContainerManager.methodSchemas.port_mappings.returns
  > {
    return this.#port_mappings;
  }

  // Get the list of running container IDs.
  async running_containers(): Promise<
    z.infer<typeof ContainerManager.methodSchemas.running_containers.returns>
  > {
    let containers;

    // If not managed, return all container IDs as running.
    if (!this.#managed) {
      containers = this.#configs.map(({ id }) => id);
    } else {
      const runningContainers = await this.client.listContainers({
        all: false,
      });

      containers = runningContainers.reduce((acc, { Names }) => {
        const containerId = Names[0].substring(1);

        if (this.#containers[containerId]) return [...acc, containerId];

        return acc;
      }, []);
    }

    return ContainerManager.methodSchemas.running_containers.returns.parse(
      containers
    );
  }

  // Get running container information.
  async running_container_info(): Promise<
    z.infer<
      typeof ContainerManager.methodSchemas.running_container_info.returns
    >
  > {
    const runningContainerIds = await this.running_containers();

    return ContainerManager.methodSchemas.running_container_info.returns.parse(
      this.#configs.reduce(
        (acc: any, { id, description, external, image }) =>
          // If the container is running, add it to the list of running container info.
          runningContainerIds.find(
            (runningContainerId) => runningContainerId === id
          )
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
      )
    );
  }

  // Returns port for given container.
  get_port(
    container: z.infer<
      typeof ContainerManager.methodSchemas.get_port.args.container
    >
  ): z.infer<typeof ContainerManager.methodSchemas.get_port.returns> {
    return ContainerManager.methodSchemas.get_port.returns.parse(
      this.#port_mappings[container]
    );
  }

  // Returns url for given container.
  get_url(
    container: z.infer<
      typeof ContainerManager.methodSchemas.get_url.args.container
    >
  ): z.infer<typeof ContainerManager.methodSchemas.get_url.returns> {
    return ContainerManager.methodSchemas.get_url.returns.parse(
      this.#url_mappings[container]
    );
  }

  // Returns bearer auth token for given container.
  get_bearer(
    container: z.infer<
      typeof ContainerManager.methodSchemas.get_bearer.args.container
    >
  ): z.infer<typeof ContainerManager.methodSchemas.get_bearer.returns> {
    return ContainerManager.methodSchemas.get_bearer.returns.parse(
      this.#bearer_mappings[container]
    );
  }

  /**
   * Setup orchestrator. If containers are managed:
   * 1. Pulls images in parallel, if not already pulled.
   * 2. Prunes any containers with conflicting IDs, if prune_containers is True.
   * 3. Creates containers, if not already created.
   * 4. Starts containers, if not already started.
   * 5. Waits for startup_wait seconds for containers to start.
   */
  async setup(pruneContainers: boolean = false): Promise<void> {
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

  /**
   * Lifecycle loop for container manager
   * Continuously checks if any containers exited / crashed. When a container
   * exits / crashes, logs the container ID as a warning and continues running.
   * If no running containers remain, logs an error and exits.
   */
  run_forever(): void {
    let runningContainers;

    this.running_containers()
      .then((_runningContainers) => {
        runningContainers = _runningContainers;

        const monitorContainers = () => {
          if (this.shutdown) return;

          this.running_containers()
            .then((currentContainers) => {
              console.log(`Running containers: ${currentContainers}`);

              const currentContainerLength = currentContainers.length;
              const runningContainerLength = runningContainers.length;

              if (currentContainerLength < runningContainerLength) {
                const failedContainers = runningContainers.filter(
                  (runningContainer) =>
                    !currentContainers.includes(runningContainer)
                );

                console.log(
                  'Container(s) failed / exited / crashed',
                  failedContainers
                );
              } else if (currentContainerLength > runningContainerLength) {
                const restartedContainers = currentContainers.filter(
                  (currentContainer) =>
                    !runningContainers.includes(currentContainer)
                );

                console.log('Container(s) back up', restartedContainers);
              }

              runningContainers = currentContainers;

              setTimeout(monitorContainers, 10_000);
            })
            .catch((err) => {
              throw err;
            });
        };

        return monitorContainers();
      })
      .catch((err) => {
        throw err;
      });
  }

  /**
   * Force stops all containers.
   */
  async stop(): Promise<void> {
    this.shutdown = true;

    if (this.#managed) {
      console.log('Stopping containers');

      await Promise.all(
        Object.keys(this.#containers).map(async (containerKey) => {
          try {
            await this.#containers[containerKey].stop({
              abortSignal: AbortSignal.timeout(DEFAULT_CONTAINER_STOP_TIMEOUT),
            });
          } catch (err) {
            console.error(`Error stopping container ${containerKey}`, err);
          }
        })
      );
    }
  }

  cleanup(): void {}

  /**
   * Pulls all managed images in parallel.
   */
  async #pull_images(): Promise<void> {
    console.info('Pulling images, this may take a while...');

    try {
      await Promise.all(
        this.#images.map(async (image, index) => {
          console.debug(`Pulling image ${image}...`);

          try {
            await this.client.pull(image, undefined, undefined, this.#creds);

            console.log(`Successfully pulled image ${image}`);
          } catch (err) {
            console.error(`Error pulling image ${image}: ${err}`);
          }
        })
      );
    } catch (err) {
      console.error('Could not pull all images.');

      throw err;
    }
  }

  /**
   * Force stops and removes any (running) containers with names matching any IDs
   * provided in the managed containers config.
   */
  async #prune_containers(): Promise<void> {
    try {
      const containers = (
        await this.client.listContainers({ all: true })
      ).reduce(
        (acc, { Names, Id }) => ({
          ...acc,
          [Names[0].substring(1)]: Id,
        }),
        {}
      );

      await Promise.all(
        this.#configs.map(async (config) => {
          const containerId = containers[config.id];

          if (!containerId) return;

          console.warn(`Pruning container ${containerId}`);

          try {
            await this.client.getContainer(containerId).remove({ force: true });
          } catch (err) {
            console.error(`Error pruning container ${containerId}`);

            throw err;
          }
        })
      );
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

      await Promise.all(
        this.#configs.map(
          async ({ id, image, port, env, gpu, volumes, command }) => {
            const existingContainer = existingContainers[image];
            let container;

            // If the container exists and is not running, start the container.
            if (existingContainer) {
              container = this.client.getContainer(existingContainer.id);

              if (!existingContainer.isRunning) {
                await container.start();

                console.info(
                  `Started existing container '${id}' on port ${port}`
                );
              }
            } else {
              const containerPort = '3000/tcp';
              const containerConfig = {
                Image: image,
                ...(port
                  ? {
                      ExposedPorts: {
                        [containerPort]: {},
                      },
                    }
                  : {}),
                HostConfig: {
                  ...(port
                    ? {
                        PortBindings: {
                          [containerPort]: [
                            {
                              HostPort: `${port}`,
                            },
                          ],
                        },
                        PublishAllPorts: true,
                      }
                    : {}),
                  RestartPolicy: {
                    Name: 'on-failure',
                    MaximumRetryCount: 5,
                  },
                  ...(gpu
                    ? {
                        DeviceRequests: [
                          {
                            Driver: 'nvidia',
                            Count: -1,
                          },
                        ],
                      }
                    : {}),
                },
                ...(command ? { Cmd: command } : {}),
                ...(env && Object.keys(env).length
                  ? {
                      Env: Object.keys(env).reduce(
                        (acc: string[], val) => [...acc, `${val}=${env[val]}`],
                        []
                      ),
                    }
                  : {}),
                ...(volumes && volumes.length
                  ? {
                      Volumes: volumes.reduce(
                        (acc, val) => ({ ...acc, [val]: {} }),
                        {}
                      ),
                    }
                  : {}),
              };

              // If the container does not exist, create and run a new container with the given configuration.
              container = await this.client.createContainer(containerConfig);

              await container.rename({ name: id });
              await container.start();

              console.info(`Started new container '${id}' on port ${port}`);
            }

            // Store existing container object in state.
            this.#containers[id] = container;
          }
        )
      );
    } catch (err) {
      throw err;
    }
  }
}

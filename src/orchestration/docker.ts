// Reference: https://github.com/ritual-net/infernet-node/blob/44c4cc8acadd3c6904b74adaa595ac002ded0ebf/src/orchestration/docker.py.
import Docker from 'dockerode';
import { z } from 'zod';
import {
  NumberSchema,
  StringSchema,
  ObjectSchema,
  StringArraySchema,
  DefaultBooleanSchema,
  DefaultNumberSchema,
} from '../shared/schemas';
import { InfernetContainerSchema, ConfigDockerSchema } from '../shared/config';
import { AsyncTask } from '../shared/service';
import dockerClient from '../docker/client';
import { delay } from '../utils/helpers';

// 60 seconds.
const DEFAULT_STARTUP_WAIT = 60_000;

const DEFAULT_CONTAINER_STOP_TIMEOUT = 60_000;

const ConfigsSchema = InfernetContainerSchema.array();
const CredsSchema = ConfigDockerSchema.optional();
const ImagesSchema = StringArraySchema;
const PortMappingsSchema = ObjectSchema.catchall(NumberSchema);
const UrlMappingsSchema = ObjectSchema.catchall(StringSchema);
const BearerMappingsSchema = ObjectSchema.catchall(StringSchema);
const ContainersSchema = ObjectSchema;
const StartupWaitSchema = DefaultNumberSchema(DEFAULT_STARTUP_WAIT);
const ManagedSchema = DefaultBooleanSchema(true);

type PortMappingsType = z.infer<typeof PortMappingsSchema>;
type StringArrayType = z.infer<typeof StringArraySchema>;

export class ContainerManager extends AsyncTask {
  #configs: z.infer<typeof ConfigsSchema>;
  #creds?: z.infer<typeof CredsSchema>;
  #images: z.infer<typeof ImagesSchema>;
  #port_mappings: PortMappingsType;
  #url_mappings: z.infer<typeof UrlMappingsSchema>;
  #bearer_mappings: z.infer<typeof BearerMappingsSchema>;
  #startup_wait: z.infer<typeof NumberSchema>;
  #managed: z.infer<typeof ManagedSchema>;
  #containers: z.infer<typeof ContainersSchema>;
  client?: Docker;

  constructor(configs, credentials?, startup_wait?, managed?) {
    super();

    this.#configs = ConfigsSchema.parse(configs);
    this.#creds = CredsSchema.parse(credentials);
    this.#images = ImagesSchema.parse(configs.map(({ image }) => image));
    this.#port_mappings = PortMappingsSchema.parse(
      configs.reduce(
        (acc, { id, port }) => ({
          ...acc,
          [id]: port,
        }),
        {}
      )
    );
    this.#url_mappings = UrlMappingsSchema.parse(
      configs.reduce(
        (acc, { id, url }) => ({
          ...acc,
          [id]: url,
        }),
        {}
      )
    );
    this.#bearer_mappings = BearerMappingsSchema.parse(
      configs.reduce(
        (acc, { id, bearer }) => ({
          ...acc,
          [id]: bearer,
        }),
        {}
      )
    );
    this.#startup_wait = StartupWaitSchema.parse(startup_wait);
    this.#managed = ManagedSchema.parse(managed);
    this.#containers = {};

    if (this.#managed)
      this.client = dockerClient(credentials?.username, credentials?.password);

    console.debug('Initialized Container Manager', {
      port_mappings: this.#port_mappings,
    });
  }

  // Port mappings for containers. Does NOT guarantee containers are running.
  get port_mappings(): PortMappingsType {
    return this.#port_mappings;
  }

  // Get the list of running container IDs.
  async running_containers(): Promise<StringArrayType> {
    let containers: StringArrayType;

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

    return StringArraySchema.parse(containers);
  }

  // Get running container information.
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

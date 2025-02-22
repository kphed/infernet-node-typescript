// Reference: https://github.com/ritual-net/infernet-node/blob/44c4cc8acadd3c6904b74adaa595ac002ded0ebf/src/orchestration/docker.py.
import Docker from 'dockerode';
import { z } from 'zod';
import { map } from 'lodash';
import { InfernetContainerSchema, ConfigDockerSchema } from '../shared/config';
import { AsyncTask } from '../shared/service';
import { delay } from '../utils/helpers';

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
    _containers: z.object({}).catchall(z.any()),
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
    setup: {
      args: {
        pruneContainers: z.boolean().default(false),
      },
      returns: z.promise(z.void()),
    },
    run_forever: {
      returns: z.promise(z.void()),
    },
    stop: {
      returns: z.promise(z.void()),
    },
    _pull_images: {
      returns: z.promise(z.void()),
    },
    _prune_containers: {
      returns: z.promise(z.void()),
    },
    _run_containers: {
      returns: z.promise(z.void()),
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
      this.client = new Docker({
        timeout: 60_000,
        ...(this.#creds ? this.#creds : {}),
      });

    console.debug('Initialized Container Manager', {
      port_mappings: this.#port_mappings,
    });
  }

  // Container configs.
  get configs(): z.infer<typeof ContainerManager.fieldSchemas._configs> {
    // `parse` returns a deep clone of `this.#configs`, preventing external mutation.
    return ContainerManager.fieldSchemas._configs.parse(this.#configs);
  }

  // Port mappings for containers. Does NOT guarantee containers are running.
  get port_mappings(): z.infer<
    typeof ContainerManager.methodSchemas.port_mappings.returns
  > {
    return ContainerManager.methodSchemas.port_mappings.returns.parse(
      this.#port_mappings
    );
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

  // Set up orchestrator by optionally pruning containers, pulling images, and (re)starting containers.
  async setup(
    pruneContainers: z.infer<
      typeof ContainerManager.methodSchemas.setup.args.pruneContainers
    > = false
  ): z.infer<typeof ContainerManager.methodSchemas.setup.returns> {
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

      console.info('Waiting for container startup', {
        seconds: this.#startup_wait / 1_000,
      });

      await delay(this.#startup_wait);

      console.info('Container manager setup complete', {
        running_containers: await this.running_containers(),
      });
    } catch (err) {
      console.error('Error setting up container manager', { error: err });

      throw new Error(
        'Container manager setup failed. Check logs for details.'
      );
    }
  }

  // Performs ongoing checks on containers, and executes logic depending on their status.
  async run_forever(): z.infer<
    typeof ContainerManager.methodSchemas.run_forever.returns
  > {
    let runningContainers = await this.running_containers();

    // Continuously checks if any running containers were stopped or started since the previous check.
    const monitorContainers = async () => {
      if (this.shutdown) return;

      const currentContainers = await this.running_containers();

      console.log(`Running containers: ${currentContainers}`);

      if (currentContainers.length < runningContainers.length) {
        console.warn(
          'Container(s) failed / exited / crashed',
          // Filtered list of containers that are no longer running.
          runningContainers.filter(
            (runningContainer) => !currentContainers.includes(runningContainer)
          )
        );
      } else if (currentContainers.length > runningContainers.length) {
        console.log(
          'Container(s) back up',
          // Filtered list of containers that have been recently start up.
          currentContainers.filter(
            (currentContainer) => !runningContainers.includes(currentContainer)
          )
        );
      }

      runningContainers = currentContainers;

      // Rerun check in 10 seconds.
      setTimeout(monitorContainers, 10_000);
    };

    monitorContainers();
  }

  // Attempts to stop all configured containers.
  async stop(): z.infer<typeof ContainerManager.methodSchemas.stop.returns> {
    this.shutdown = true;

    if (!this.#managed) return;

    console.log('Stopping containers');

    await Promise.all(
      map(this.#containers, async (container, containerId) => {
        try {
          await container.stop({
            // Abort request after 60 seconds.
            abortSignal: AbortSignal.timeout(60_000),
          });
        } catch (err) {
          console.error(`Error stopping container ${containerId}`, {
            error: err,
          });
        }
      })
    );
  }

  // Pulls all managed images in parallel.
  async #pull_images(): z.infer<
    typeof ContainerManager.methodSchemas._pull_images.returns
  > {
    console.info('Pulling images, this may take a while...');

    const pullImage = async (image) => {
      try {
        await new Promise((resolve, reject) => {
          console.debug(`Pulling image ${image}...`);

          // Since `pull` doesn't return a promise, we have to use a callback function.
          this.client.pull(
            image,
            {
              authconfig: {
                ...this.#creds,
              },
            },
            (pullErr, stream) => {
              if (pullErr) return reject(pullErr);

              // Use the `followProgress` helper to monitor the image streaming process,
              // and execute a callback function only once it's complete.
              this.client.modem.followProgress(
                stream,
                (onFinishErr, output) => {
                  if (onFinishErr) return reject(onFinishErr);

                  return resolve(output);
                }
              );
            }
          );
        });

        console.debug(`Successfully pulled image ${image}`);

        return true;
      } catch (err) {
        try {
          // Check if image exists locally.
          await this.client.getImage(image).inspect();

          console.info(`Image ${image} already exists locally`);

          return true;
        } catch (_) {
          console.warn(`Image ${image} does not exist locally`);
        }

        console.error(`Error pulling image ${image}`, { error: err });

        return false;
      }
    };

    // Pull images in parallel.
    const imagePullAttempts = await Promise.all(this.#images.map(pullImage));

    if (imagePullAttempts.find((attempt) => !attempt))
      throw new Error('Could not pull all images.');
  }

  // Force stops and removes any node-managed containers that are running.
  async #prune_containers(): z.infer<
    typeof ContainerManager.methodSchemas._prune_containers.returns
  > {
    const containers = (
      await this.client.listContainers({ all: false })
    ).reduce((acc, { Names, Id }) => {
      const name = Names[0].substring(1);

      // Ensure that only node-managed containers will be pruned.
      if (this.#configs.find(({ id }) => name === id)) return [...acc, Id];

      return acc;
    }, []);

    await Promise.all(
      containers.map(async (containerId) => {
        console.warn(`Pruning container ${containerId}`);

        await this.client.getContainer(containerId).remove({ force: true });
      })
    );
  }

  // Runs all containers with given configurations.
  async #run_containers(): z.infer<
    typeof ContainerManager.methodSchemas._prune_containers.returns
  > {
    await Promise.all(
      this.#configs.map(
        async ({ id, image, port, env, gpu, volumes, command }) => {
          try {
            const container = this.client.getContainer(id);
            const containerDetails = await container.inspect();

            this.#containers = ContainerManager.fieldSchemas._containers.parse({
              ...this.#containers,
              [id]: container,
            });

            if (containerDetails.State.Status !== 'running')
              await container.start();

            const containerHostPort: number = z.coerce
              .number()
              .parse(
                containerDetails.NetworkSettings.Ports['3000/tcp'][0].HostPort
              );

            if (port !== containerHostPort)
              console.warn(
                `Container '${id}' is already running on port ${containerHostPort}, disregarding requested port ${port}.`
              );

            console.info(`Started existing container '${id}' on port ${port}`);
          } catch (err: any) {
            if (err.reason === 'no such container') {
              const containerPort = '3000/tcp';
              const envKeys = env ? Object.keys(env) : [];
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
                ...(env && envKeys.length
                  ? {
                      Env: envKeys.reduce(
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
              const container = await this.client.createContainer(
                containerConfig
              );

              await container.rename({ name: id });
              await container.start();

              this.#containers =
                ContainerManager.fieldSchemas._containers.parse({
                  ...this.#containers,
                  [id]: container,
                });

              console.info(`Started new container '${id}' on port ${port}`);
            } else {
              console.warn(
                'Encountered an unknown error while running containers',
                err
              );
            }
          }
        }
      )
    );
  }

  cleanup(): void {}
}

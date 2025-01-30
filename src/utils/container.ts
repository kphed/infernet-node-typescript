import { InfernetContainer } from '../shared/config';

const autoAssignPort = (
  port = 3999,
  assignedPorts: {
    [key: number]: string;
  }
) => (!assignedPorts[port] ? port : autoAssignPort(port - 1, assignedPorts));

export const assignPorts = (configs: InfernetContainer[]) => {
  // O(1) lookups when checking for assigned ports.
  const assignedPorts: {
    [key: number]: string;
  } = {};

  return configs.map(({ id, port }, index) => {
    let nextPort = typeof port === 'string' ? parseInt(port) : port;

    // If the port is defined and assigned to another container, look for an open port and reassign.
    if (port) {
      if (assignedPorts[port]) {
        nextPort = autoAssignPort(undefined, assignedPorts);

        console.warn(
          `Port ${port} is already in use. Auto-assigning port ${nextPort} for container '${id}'`
        );
      }
    } else {
      // Else, since the port is undefined, assign it an open port.
      nextPort = autoAssignPort(undefined, assignedPorts);
    }

    assignedPorts[nextPort] = id;
    configs[index].port = nextPort;

    return configs[index];
  });
};

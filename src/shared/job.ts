// Reference: https://github.com/ritual-net/infernet-node/blob/cf254b9c9601883bd3a716b41028f686cd04b163/src/shared/job.py.
enum JobLocation {
  ONCHAIN = 0,
  OFFCHAIN = 1,
  STREAM = 2,
}

// Container source, destination, and data.
interface ContainerInput {
  source: JobLocation.ONCHAIN | JobLocation.OFFCHAIN;
  destination: JobLocation;
  data: any;
  requires_proof: boolean;
}

// Container output.
interface ContainerOutput {
  container: string;
  output: {
    [key: string]: any;
  };
}

// Container error.
interface ContainerError {
  container: string;
  error: string;
}

export type ContainerResult = ContainerError | ContainerOutput;

// Job source, destination, and data.
interface JobInput {
  source: JobLocation.ONCHAIN | JobLocation.OFFCHAIN;
  destination: JobLocation;
  data: any;
}

export type JobStatus = 'running' | 'success' | 'failed';

// Job result.
export interface JobResult {
  id: string;
  status: JobStatus;
  intermediate_results: ContainerResult[];
  result?: ContainerResult;
}

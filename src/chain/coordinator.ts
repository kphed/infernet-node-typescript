// Reference: https://github.com/ritual-net/infernet-node/blob/9e67ac3af88092a8ac181829da33d863fd8ea990/src/chain/coordinator.py.
export interface CoordinatorSignatureParams {
  nonce: number;
  expiry: number;
  v: number;
  r: number;
  s: number;
}

import * as dotenv from 'dotenv';

dotenv.config();

import {
  createPublicClient,
  createWalletClient,
  http,
  getContractAddress,
  Hex,
} from 'viem';
import fs from 'fs';
import { privateKeyToAccount } from 'viem/accounts';
import {
  registry,
  eip712Coordinator,
  inbox,
  reader,
  fee,
  walletFactory,
} from './contracts';
import config from '../config.json';

export const publicClient = createPublicClient({
  transport: http(process.env.TEST_RPC_URL),
});

export const walletClient = createWalletClient({
  account: privateKeyToAccount(
    process.env.TEST_ACCOUNT_PRIVATE_KEY as `0x${string}`
  ),
  transport: http(process.env.TEST_RPC_URL),
});

export const deployContracts = async () => {
  const nonce = await publicClient.getTransactionCount({
    address: walletClient.account.address,
  });
  const registryAddress = getContractAddress({
    from: walletClient.account.address,
    nonce: BigInt(nonce),
  });
  const coordinatorAddress = getContractAddress({
    from: walletClient.account.address,
    nonce: BigInt(nonce) + 1n,
  });
  const inboxAddress = getContractAddress({
    from: walletClient.account.address,
    nonce: BigInt(nonce) + 2n,
  });
  const readerAddress = getContractAddress({
    from: walletClient.account.address,
    nonce: BigInt(nonce) + 3n,
  });
  const feeAddress = getContractAddress({
    from: walletClient.account.address,
    nonce: BigInt(nonce) + 4n,
  });
  const walletFactoryAddress = getContractAddress({
    from: walletClient.account.address,
    nonce: BigInt(nonce) + 5n,
  });

  await walletClient.deployContract({
    chain: publicClient.chain,
    abi: registry.abi,
    args: [
      coordinatorAddress,
      inboxAddress,
      readerAddress,
      feeAddress,
      walletFactoryAddress,
    ],
    bytecode: registry.bytecode as Hex,
  });
  await walletClient.deployContract({
    chain: publicClient.chain,
    abi: eip712Coordinator.abi,
    args: [registryAddress],
    bytecode: eip712Coordinator.bytecode as Hex,
  });
  await walletClient.deployContract({
    chain: publicClient.chain,
    abi: inbox.abi,
    args: [registryAddress],
    bytecode: inbox.bytecode as Hex,
  });
  await walletClient.deployContract({
    chain: publicClient.chain,
    abi: reader.abi,
    args: [registryAddress],
    bytecode: reader.bytecode as Hex,
  });
  await walletClient.deployContract({
    chain: publicClient.chain,
    abi: fee.abi,
    args: [walletClient.account.address, 500],
    bytecode: fee.bytecode as Hex,
  });
  await walletClient.deployContract({
    chain: publicClient.chain,
    abi: walletFactory.abi,
    args: [registryAddress],
    bytecode: walletFactory.bytecode as Hex,
  });

  return {
    registry: {
      address: registryAddress,
      ...registry,
    },
    coordinator: {
      address: coordinatorAddress,
      ...eip712Coordinator,
    },
    inbox: {
      address: inboxAddress,
      ...inbox,
    },
    reader: {
      address: readerAddress,
      ...reader,
    },
    fee: {
      address: feeAddress,
      ...fee,
    },
    walletFactory: {
      address: walletFactoryAddress,
      ...walletFactory,
    },
  };
};

export default async () => {
  const { registry, coordinator, inbox, reader, fee, walletFactory } =
    await deployContracts();
  const testConfig = {
    ...config,
  };
  testConfig.chain.registry_address = registry.address;
  testConfig.chain.wallet.private_key =
    process.env.TEST_ACCOUNT_PRIVATE_KEY ?? '';

  fs.writeFileSync('config.test.json', JSON.stringify(testConfig));

  return { registry, coordinator, inbox, reader, fee, walletFactory };
};

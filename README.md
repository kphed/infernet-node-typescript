# Infernet Node (JavaScript/TypeScript)

## Disclaimer

**This project is independently developed and is not affiliated with, sponsored by, or endorsed by Ritual Labs.** Ritual Labs does not provide support or assume responsibility for this repository or any issues that may arise from using this port. Users are encouraged to consult the official Ritual Infernet Node repository for authoritative information, official updates, and formal support.

## License

This project is based on the original [Ritual Infernet Node repository](https://github.com/ritual-net/infernet-node), developed by Origin Research Ltd. and licensed under the Clear BSD License. Please refer to the [LICENSE](./LICENSE) file for complete licensing information.

## Introduction

This repository contains an ongoing JavaScript/TypeScript port of the original Python-based Ritual Infernet Node (v1.4.0), which can be found [here](https://github.com/ritual-net/infernet-node).

The core functionality from the original Python implementation has been adapted to JavaScript/TypeScript. However, due to inherent differences between the programming languages and available libraries, it should not be expected for this port to be "one-to-one" with the original codebase.

If you encounter significant discrepancies between this implementation and the original Python version that impact functionality, please open a GitHub issue. When doing so, clearly describe the discrepancy and, if possible, propose a solution or recommended adjustment.

## Progress

Below is an outline of the Python-based Infernet Node file hierarchy, represented as a to-do list. Files specific to Python or otherwise non-applicable have been excluded. Files successfully ported to JavaScript/TypeScript are marked as completed.

Commit SHA: [ee2ab486382eaf6786871d2df0f012ea5f303683](https://github.com/ritual-net/infernet-node/tree/ee2ab486382eaf6786871d2df0f012ea5f303683).

[.github/workflows](https://github.com/ritual-net/infernet-node/tree/ee2ab486382eaf6786871d2df0f012ea5f303683/.github/workflows)
- [ ] pre-commit.yaml

[deploy/](https://github.com/ritual-net/infernet-node/tree/ee2ab486382eaf6786871d2df0f012ea5f303683/deploy)
- [ ] docker-compose-gpu.yaml
- [ ] docker-compose.yaml
- [ ] fluent-bit.conf
- [ ] redis.conf

[src/chain](https://github.com/ritual-net/infernet-node/tree/ee2ab486382eaf6786871d2df0f012ea5f303683/src/chain)
- [x] container_lookup.py
- [x] coordinator.py
- [x] errors.py
- [x] listener.py
- [x] payment_wallet.py
- [x] processor.py
- [x] reader.py
- [x] registry.py
- [x] rpc.py
- [x] wallet.py
- [x] wallet_checker.py

[src/orchestration](https://github.com/ritual-net/infernet-node/tree/ee2ab486382eaf6786871d2df0f012ea5f303683/src/orchestration)
- [x] docker.py
- [x] guardian.py
- [x] orchestrator.py
- [x] store.py

[src/server](ritual-net/infernet-node/tree/ee2ab486382eaf6786871d2df0f012ea5f303683/src/server)
- [x] rest.py
- [ ] stats.py
- [ ] utils.py

[src/shared](https://github.com/ritual-net/infernet-node/tree/ee2ab486382eaf6786871d2df0f012ea5f303683/src/shared)
- [x] config.py
- [x] container.py
- [x] job.py
- [x] message.py
- [x] service.py
- [x] subscription.py

[src/utils](https://github.com/ritual-net/infernet-node/tree/ee2ab486382eaf6786871d2df0f012ea5f303683/src/utils)
- [x] constants.py
- [x] container.py
- [ ] logging.py
- [ ] parser.py

[src/](https://github.com/ritual-net/infernet-node/tree/ee2ab486382eaf6786871d2df0f012ea5f303683/src)
- [ ] main.py
- [x] version.py

[/](https://github.com/ritual-net/infernet-node/tree/ee2ab486382eaf6786871d2df0f012ea5f303683)
- [ ] .dockerignore
- [x] .gitignore
- [ ] Dockerfile
- [ ] Dockerfile-gpu
- [x] LICENSE
- [ ] README.md
- [x] config.sample.json
- [ ] docker-hub.exp
- [ ] openapi.yaml

## Getting Started

Follow the instructions below to run the Infernet Node with a development-ready configuration.

### Prerequisites

Ensure you have the following dependencies installed, ideally with the exact versions specified:

- [Node.js](https://nodejs.org/) (version 22.14.0)
- *npm (version 11.1.0)
- [Docker](http://docker.com/) (version 28.0.1)
- [Redis](https://redis.io/) (version 7.2.5)
- [Foundry](https://getfoundry.sh/) (version 1.0.0-stable)

Confirm that each of the above dependencies is properly configured before proceeding (e.g., running `docker --version` to verify that Docker is correctly set up with adequate permissions).

### Set Up Local Testnet

Launch a local testnet using Foundry's [Anvil](https://book.getfoundry.sh/anvil/):

`anvil --fork-url https://eth.llamarpc.com --block-time 1`

This command starts a fork of the Ethereum mainnet, mining a new block every second. It is strongly recommended to replace the RPC URL above with your own preferred endpoint to avoid potential rate-limiting and other related issues. Alternatively, you can start a fresh testnet without forking and manually deploy the Infernet SDK smart contracts.

> Tip: If you do not already have a funded Ethereum account, you can use one of the Anvil-provided accounts with pre-funded balances. The private keys for these accounts are displayed when the Anvil testnet starts.

Forking the Ethereum mainnet (or any other Ritual-supported chain) provides us with access to the [Infernet SDK smart contracts](https://docs.ritual.net/infernet/sdk/introduction#deployed-contracts) previously deployed by the Ritual team.

For reference, the Ethereum mainnet Registry smart contract address is:

`0xa0113fC5967707bF44d33CF9611D66726c7449B5`

This address will be required in the next step.

### Set Up and Start Infernet Node

Clone this GitHub repo, and navigate to it:

`git clone https://github.com/kphed/infernet-node-typescript && cd infernet-node-typescript`

Install the project packages:

`npm install`

Copy the example environment and configuration files:

`cp .env.example .env && cp config.sample.json config.json`

For the purposes of this setup guide, no changes to the .env file are needed.

For the config.json file, modify these properties:
- `chain.registry_address` (Line 19): Set to the Registry smart contract address listed above if your testnet is a fork of Ethereum mainnet.
- `chain.wallet.private_key` (Line 22): Set to the private key of the Ethereum account you are using (e.g., a funded Anvil-provided account).
- `chain.wallet.payment_address` (Line 23): Follow the instructions below to deploy a Wallet smart contract and set this value accordingly.

To deploy a Wallet smart contract, use Foundry's [cast](https://book.getfoundry.sh/cast/) to call the WalletFactory's createWallet method. Fill in the `REGISTRY_ADDRESS`, `ACCOUNT_ADDRESS`, and `PRIVATE_KEY` variables, then run the following commands:

```
REGISTRY_ADDRESS=0x
WALLET_FACTORY_ADDRESS=$(cast call $REGISTRY_ADDRESS --rpc-url localhost:8545 "WALLET_FACTORY()(address)")
ACCOUNT_ADDRESS=0x
PRIVATE_KEY=0x

cast send $WALLET_FACTORY_ADDRESS --private-key $PRIVATE_KEY "createWallet(address)(address)" $ACCOUNT_ADDRESS --json | jq -r '.logs[0].address'
```

Set the output (the newly-deployed Wallet address) as the value for `chain.wallet.payment_address`.

Finally, start the node (uses nodemon, which automatically restarts on file changes):

`npm run dev`

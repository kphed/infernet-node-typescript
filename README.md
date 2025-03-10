# Infernet Node (JavaScript/TypeScript)

## Disclaimer

**This project is independently developed and is not affiliated with, sponsored by, or endorsed by Ritual Labs.** Ritual Labs does not provide support or assume responsibility for this repository or any issues that may arise from using this port. Users are encouraged to consult the official Ritual Infernet Node repository for authoritative information, official updates, and formal support.

## Introduction

This repository contains an ongoing JavaScript/TypeScript port of the original Python-based Ritual Infernet Node (v1.4.0), which can be found [here](https://github.com/ritual-net/infernet-node).

The core functionality from the original Python implementation has been adapted to JavaScript/TypeScript. However, due to inherent differences between the programming languages and available libraries, this port is not intended to be a "one-to-one" translation.

If you encounter significant discrepancies between this implementation and the original Python version that impact functionality, please open a GitHub issue. When doing so, clearly describe the discrepancy and, if possible, propose a solution or recommended adjustment.

## Getting Started

Follow the instructions below to run the Infernet Node with a development-ready configuration: Ritual hello-world Docker container, and a Foundry Anvil-based testnet with Infernet SDK contracts deployed.

### Prerequisites

Ensure you have the following dependencies installed, ideally with the exact versions specified:

- [Node.js](https://nodejs.org/) (version 22.14.0)
- *npm (version 11.1.0)
- [Docker](http://docker.com/) (version 28.0.1)
- [Redis](https://redis.io/) (version 7.2.5)
- [Foundry](https://getfoundry.sh/) (version 1.0.0-stable)

export default {
  abi: [
    {
      type: 'constructor',
      inputs: [
        {
          name: 'coordinator',
          type: 'address',
          internalType: 'address',
        },
        {
          name: 'inbox',
          type: 'address',
          internalType: 'address',
        },
        {
          name: 'reader',
          type: 'address',
          internalType: 'address',
        },
        {
          name: 'fee',
          type: 'address',
          internalType: 'address',
        },
        {
          name: 'walletFactory',
          type: 'address',
          internalType: 'address',
        },
      ],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'COORDINATOR',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'address',
          internalType: 'address',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'FEE',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'address',
          internalType: 'address',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'INBOX',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'address',
          internalType: 'address',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'READER',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'address',
          internalType: 'address',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'WALLET_FACTORY',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'address',
          internalType: 'address',
        },
      ],
      stateMutability: 'view',
    },
  ],
  bytecode:
    '0x610120346100c657601f6103b438819003918201601f19168301916001600160401b038311848410176100cb5780849260a0946040528339810103126100c657610048816100e1565b90610055602082016100e1565b610061604083016100e1565b9061007a6080610073606086016100e1565b94016100e1565b9360805260a05260c05260e0526101009081526040516102be91826100f68339608051826101f2015260a05182610114015260c05182610183015260e0518260a2015251816102600152f35b600080fd5b634e487b7160e01b600052604160045260246000fd5b51906001600160a01b03821682036100c65756fe608080604052600436101561001357600080fd5b600090813560e01c9081630e2009f414610216575080633b2bcbf1146101a7578063698eec4414610138578063b7010697146100c95763c57981b51461005857600080fd5b346100c657807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126100c657602060405173ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000168152f35b80fd5b50346100c657807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126100c657602060405173ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000168152f35b50346100c657807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126100c657602060405173ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000168152f35b50346100c657807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126100c657602060405173ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000168152f35b90503461028457817ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126102845760209073ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000168152f35b5080fdfea2646970667358221220f5f5a10d573f781d347f29f5d74acf19f21a13c95851411e93980d526eff627664736f6c63430008130033',
};

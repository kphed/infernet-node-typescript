export default {
  abi: [
    {
      type: 'constructor',
      inputs: [
        {
          name: 'feeRecipient',
          type: 'address',
          internalType: 'address',
        },
        {
          name: 'fee',
          type: 'uint16',
          internalType: 'uint16',
        },
      ],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'FEE',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'uint16',
          internalType: 'uint16',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'FEE_RECIPIENT',
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
      name: 'cancelOwnershipHandover',
      inputs: [],
      outputs: [],
      stateMutability: 'payable',
    },
    {
      type: 'function',
      name: 'completeOwnershipHandover',
      inputs: [
        {
          name: 'pendingOwner',
          type: 'address',
          internalType: 'address',
        },
      ],
      outputs: [],
      stateMutability: 'payable',
    },
    {
      type: 'function',
      name: 'owner',
      inputs: [],
      outputs: [
        {
          name: 'result',
          type: 'address',
          internalType: 'address',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'ownershipHandoverExpiresAt',
      inputs: [
        {
          name: 'pendingOwner',
          type: 'address',
          internalType: 'address',
        },
      ],
      outputs: [
        {
          name: 'result',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'renounceOwnership',
      inputs: [],
      outputs: [],
      stateMutability: 'payable',
    },
    {
      type: 'function',
      name: 'requestOwnershipHandover',
      inputs: [],
      outputs: [],
      stateMutability: 'payable',
    },
    {
      type: 'function',
      name: 'transferOwnership',
      inputs: [
        {
          name: 'newOwner',
          type: 'address',
          internalType: 'address',
        },
      ],
      outputs: [],
      stateMutability: 'payable',
    },
    {
      type: 'function',
      name: 'updateFee',
      inputs: [
        {
          name: 'newFee',
          type: 'uint16',
          internalType: 'uint16',
        },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'event',
      name: 'OwnershipHandoverCanceled',
      inputs: [
        {
          name: 'pendingOwner',
          type: 'address',
          indexed: true,
          internalType: 'address',
        },
      ],
      anonymous: false,
    },
    {
      type: 'event',
      name: 'OwnershipHandoverRequested',
      inputs: [
        {
          name: 'pendingOwner',
          type: 'address',
          indexed: true,
          internalType: 'address',
        },
      ],
      anonymous: false,
    },
    {
      type: 'event',
      name: 'OwnershipTransferred',
      inputs: [
        {
          name: 'oldOwner',
          type: 'address',
          indexed: true,
          internalType: 'address',
        },
        {
          name: 'newOwner',
          type: 'address',
          indexed: true,
          internalType: 'address',
        },
      ],
      anonymous: false,
    },
    {
      type: 'error',
      name: 'AlreadyInitialized',
      inputs: [],
    },
    {
      type: 'error',
      name: 'NewOwnerIsZeroAddress',
      inputs: [],
    },
    {
      type: 'error',
      name: 'NoHandoverRequest',
      inputs: [],
    },
    {
      type: 'error',
      name: 'Unauthorized',
      inputs: [],
    },
  ],
  bytecode:
    '0x6080346100ac57601f61061c38819003918201601f19168301916001600160401b038311848410176100b15780849260409485528339810103126100ac5780516001600160a01b03811691908290036100ac57602001519061ffff82168092036100ac5780638b78c6d8195560007f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e08180a361ffff19600054161760005560405161055490816100c88239f35b600080fd5b634e487b7160e01b600052604160045260246000fdfe608060405260048036101561001357600080fd5b600090813560e01c8063256929621461047d5780632c6cda931461040e57806354d1f13d146103aa578063715018a61461032b5780638da5cb5b1461027b578063c57981b5146102ec578063ebd090541461027b578063f04e283e146101b3578063f2fde38b146100fa5763fee81cf41461008d57600080fd5b346100f65760207ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126100f657359073ffffffffffffffffffffffffffffffffffffffff821682036100f35763389a75e1600c5252602080600c2054604051908152f35b80fd5b5080fd5b5060207ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126100f65780359073ffffffffffffffffffffffffffffffffffffffff8216918281036101af5761014f6104e6565b60601b156101a457507fffffffffffffffffffffffffffffffffffffffffffffffffffffffff748739278181547f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e08580a35580f35b637448fbae8352601cfd5b8380fd5b5060207ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126100f65780359073ffffffffffffffffffffffffffffffffffffffff8216918281036101af576102086104e6565b63389a75e1600c5283526020600c20908154421161027057508290557fffffffffffffffffffffffffffffffffffffffffffffffffffffffff748739278181547f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e08580a35580f35b636f5e88188452601cfd5b82346100f357807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126100f35760207fffffffffffffffffffffffffffffffffffffffffffffffffffffffff748739275473ffffffffffffffffffffffffffffffffffffffff60405191168152f35b82346100f357807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126100f35761ffff6020915416604051908152f35b82807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126100f35761035d6104e6565b807fffffffffffffffffffffffffffffffffffffffffffffffffffffffff748739278181547f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e08280a35580f35b82807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126100f35763389a75e1600c52338152806020600c2055337ffa7b8eab7da67f412cc9575ed43464468f9bfbae89d1675917346ca6d8fe3c928280a280f35b50346100f65760207ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126100f6573561ffff81168091036100f6576104536104e6565b7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000082541617815580f35b82807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126100f35763389a75e1600c523381526202a30042016020600c2055337fdbf36a107da19e49527a7176a1babf963b4b0ff8cde35ee35d6cd8f1f9ac7e1d8280a280f35b7fffffffffffffffffffffffffffffffffffffffffffffffffffffffff7487392754330361051057565b6382b429006000526004601cfdfea2646970667358221220e9daa5e3a2e9f06f6f5d278ee2941edf64623cb87913120b07b8b7b84dc2ea8c64736f6c63430008130033',
};

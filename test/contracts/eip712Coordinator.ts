export default {
  abi: [
    {
      type: 'constructor',
      inputs: [
        {
          name: 'registry',
          type: 'address',
          internalType: 'contract Registry',
        },
      ],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'EIP712_NAME',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'string',
          internalType: 'string',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'EIP712_VERSION',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'string',
          internalType: 'string',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'cancelSubscription',
      inputs: [
        {
          name: 'subscriptionId',
          type: 'uint32',
          internalType: 'uint32',
        },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'createSubscription',
      inputs: [
        {
          name: 'containerId',
          type: 'string',
          internalType: 'string',
        },
        {
          name: 'frequency',
          type: 'uint32',
          internalType: 'uint32',
        },
        {
          name: 'period',
          type: 'uint32',
          internalType: 'uint32',
        },
        {
          name: 'redundancy',
          type: 'uint16',
          internalType: 'uint16',
        },
        {
          name: 'lazy',
          type: 'bool',
          internalType: 'bool',
        },
        {
          name: 'paymentToken',
          type: 'address',
          internalType: 'address',
        },
        {
          name: 'paymentAmount',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: 'wallet',
          type: 'address',
          internalType: 'address',
        },
        {
          name: 'verifier',
          type: 'address',
          internalType: 'address',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'uint32',
          internalType: 'uint32',
        },
      ],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'createSubscriptionDelegatee',
      inputs: [
        {
          name: 'nonce',
          type: 'uint32',
          internalType: 'uint32',
        },
        {
          name: 'expiry',
          type: 'uint32',
          internalType: 'uint32',
        },
        {
          name: 'sub',
          type: 'tuple',
          internalType: 'struct Subscription',
          components: [
            {
              name: 'owner',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'activeAt',
              type: 'uint32',
              internalType: 'uint32',
            },
            {
              name: 'period',
              type: 'uint32',
              internalType: 'uint32',
            },
            {
              name: 'frequency',
              type: 'uint32',
              internalType: 'uint32',
            },
            {
              name: 'redundancy',
              type: 'uint16',
              internalType: 'uint16',
            },
            {
              name: 'containerId',
              type: 'bytes32',
              internalType: 'bytes32',
            },
            {
              name: 'lazy',
              type: 'bool',
              internalType: 'bool',
            },
            {
              name: 'verifier',
              type: 'address',
              internalType: 'address payable',
            },
            {
              name: 'paymentAmount',
              type: 'uint256',
              internalType: 'uint256',
            },
            {
              name: 'paymentToken',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'wallet',
              type: 'address',
              internalType: 'address payable',
            },
          ],
        },
        {
          name: 'v',
          type: 'uint8',
          internalType: 'uint8',
        },
        {
          name: 'r',
          type: 'bytes32',
          internalType: 'bytes32',
        },
        {
          name: 's',
          type: 'bytes32',
          internalType: 'bytes32',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'uint32',
          internalType: 'uint32',
        },
      ],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'delegateCreatedIds',
      inputs: [
        {
          name: '',
          type: 'bytes32',
          internalType: 'bytes32',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'uint32',
          internalType: 'uint32',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'deliverCompute',
      inputs: [
        {
          name: 'subscriptionId',
          type: 'uint32',
          internalType: 'uint32',
        },
        {
          name: 'deliveryInterval',
          type: 'uint32',
          internalType: 'uint32',
        },
        {
          name: 'input',
          type: 'bytes',
          internalType: 'bytes',
        },
        {
          name: 'output',
          type: 'bytes',
          internalType: 'bytes',
        },
        {
          name: 'proof',
          type: 'bytes',
          internalType: 'bytes',
        },
        {
          name: 'nodeWallet',
          type: 'address',
          internalType: 'address',
        },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'deliverComputeDelegatee',
      inputs: [
        {
          name: 'nonce',
          type: 'uint32',
          internalType: 'uint32',
        },
        {
          name: 'expiry',
          type: 'uint32',
          internalType: 'uint32',
        },
        {
          name: 'sub',
          type: 'tuple',
          internalType: 'struct Subscription',
          components: [
            {
              name: 'owner',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'activeAt',
              type: 'uint32',
              internalType: 'uint32',
            },
            {
              name: 'period',
              type: 'uint32',
              internalType: 'uint32',
            },
            {
              name: 'frequency',
              type: 'uint32',
              internalType: 'uint32',
            },
            {
              name: 'redundancy',
              type: 'uint16',
              internalType: 'uint16',
            },
            {
              name: 'containerId',
              type: 'bytes32',
              internalType: 'bytes32',
            },
            {
              name: 'lazy',
              type: 'bool',
              internalType: 'bool',
            },
            {
              name: 'verifier',
              type: 'address',
              internalType: 'address payable',
            },
            {
              name: 'paymentAmount',
              type: 'uint256',
              internalType: 'uint256',
            },
            {
              name: 'paymentToken',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'wallet',
              type: 'address',
              internalType: 'address payable',
            },
          ],
        },
        {
          name: 'v',
          type: 'uint8',
          internalType: 'uint8',
        },
        {
          name: 'r',
          type: 'bytes32',
          internalType: 'bytes32',
        },
        {
          name: 's',
          type: 'bytes32',
          internalType: 'bytes32',
        },
        {
          name: 'deliveryInterval',
          type: 'uint32',
          internalType: 'uint32',
        },
        {
          name: 'input',
          type: 'bytes',
          internalType: 'bytes',
        },
        {
          name: 'output',
          type: 'bytes',
          internalType: 'bytes',
        },
        {
          name: 'proof',
          type: 'bytes',
          internalType: 'bytes',
        },
        {
          name: 'nodeWallet',
          type: 'address',
          internalType: 'address',
        },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'eip712Domain',
      inputs: [],
      outputs: [
        {
          name: 'fields',
          type: 'bytes1',
          internalType: 'bytes1',
        },
        {
          name: 'name',
          type: 'string',
          internalType: 'string',
        },
        {
          name: 'version',
          type: 'string',
          internalType: 'string',
        },
        {
          name: 'chainId',
          type: 'uint256',
          internalType: 'uint256',
        },
        {
          name: 'verifyingContract',
          type: 'address',
          internalType: 'address',
        },
        {
          name: 'salt',
          type: 'bytes32',
          internalType: 'bytes32',
        },
        {
          name: 'extensions',
          type: 'uint256[]',
          internalType: 'uint256[]',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'finalizeProofVerification',
      inputs: [
        {
          name: 'subscriptionId',
          type: 'uint32',
          internalType: 'uint32',
        },
        {
          name: 'interval',
          type: 'uint32',
          internalType: 'uint32',
        },
        {
          name: 'node',
          type: 'address',
          internalType: 'address',
        },
        {
          name: 'valid',
          type: 'bool',
          internalType: 'bool',
        },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'getSubscription',
      inputs: [
        {
          name: 'subscriptionId',
          type: 'uint32',
          internalType: 'uint32',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'tuple',
          internalType: 'struct Subscription',
          components: [
            {
              name: 'owner',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'activeAt',
              type: 'uint32',
              internalType: 'uint32',
            },
            {
              name: 'period',
              type: 'uint32',
              internalType: 'uint32',
            },
            {
              name: 'frequency',
              type: 'uint32',
              internalType: 'uint32',
            },
            {
              name: 'redundancy',
              type: 'uint16',
              internalType: 'uint16',
            },
            {
              name: 'containerId',
              type: 'bytes32',
              internalType: 'bytes32',
            },
            {
              name: 'lazy',
              type: 'bool',
              internalType: 'bool',
            },
            {
              name: 'verifier',
              type: 'address',
              internalType: 'address payable',
            },
            {
              name: 'paymentAmount',
              type: 'uint256',
              internalType: 'uint256',
            },
            {
              name: 'paymentToken',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'wallet',
              type: 'address',
              internalType: 'address payable',
            },
          ],
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'getSubscriptionInterval',
      inputs: [
        {
          name: 'activeAt',
          type: 'uint32',
          internalType: 'uint32',
        },
        {
          name: 'period',
          type: 'uint32',
          internalType: 'uint32',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'uint32',
          internalType: 'uint32',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'id',
      inputs: [],
      outputs: [
        {
          name: '',
          type: 'uint32',
          internalType: 'uint32',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'maxSubscriberNonce',
      inputs: [
        {
          name: '',
          type: 'address',
          internalType: 'address',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'uint32',
          internalType: 'uint32',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'nodeResponded',
      inputs: [
        {
          name: '',
          type: 'bytes32',
          internalType: 'bytes32',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'bool',
          internalType: 'bool',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'proofRequests',
      inputs: [
        {
          name: '',
          type: 'bytes32',
          internalType: 'bytes32',
        },
      ],
      outputs: [
        {
          name: 'expiry',
          type: 'uint32',
          internalType: 'uint32',
        },
        {
          name: 'nodeWallet',
          type: 'address',
          internalType: 'contract Wallet',
        },
        {
          name: 'consumerEscrowed',
          type: 'uint256',
          internalType: 'uint256',
        },
      ],
      stateMutability: 'view',
    },
    {
      type: 'function',
      name: 'redundancyCount',
      inputs: [
        {
          name: '',
          type: 'bytes32',
          internalType: 'bytes32',
        },
      ],
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
      type: 'event',
      name: 'ProofVerified',
      inputs: [
        {
          name: 'id',
          type: 'uint32',
          indexed: true,
          internalType: 'uint32',
        },
        {
          name: 'interval',
          type: 'uint32',
          indexed: true,
          internalType: 'uint32',
        },
        {
          name: 'node',
          type: 'address',
          indexed: true,
          internalType: 'address',
        },
        {
          name: 'active',
          type: 'bool',
          indexed: false,
          internalType: 'bool',
        },
        {
          name: 'verifier',
          type: 'address',
          indexed: false,
          internalType: 'address',
        },
        {
          name: 'valid',
          type: 'bool',
          indexed: false,
          internalType: 'bool',
        },
      ],
      anonymous: false,
    },
    {
      type: 'event',
      name: 'SubscriptionCancelled',
      inputs: [
        {
          name: 'id',
          type: 'uint32',
          indexed: true,
          internalType: 'uint32',
        },
      ],
      anonymous: false,
    },
    {
      type: 'event',
      name: 'SubscriptionCreated',
      inputs: [
        {
          name: 'id',
          type: 'uint32',
          indexed: true,
          internalType: 'uint32',
        },
      ],
      anonymous: false,
    },
    {
      type: 'event',
      name: 'SubscriptionFulfilled',
      inputs: [
        {
          name: 'id',
          type: 'uint32',
          indexed: true,
          internalType: 'uint32',
        },
        {
          name: 'node',
          type: 'address',
          indexed: true,
          internalType: 'address',
        },
      ],
      anonymous: false,
    },
    {
      type: 'error',
      name: 'IntervalCompleted',
      inputs: [],
    },
    {
      type: 'error',
      name: 'IntervalMismatch',
      inputs: [],
    },
    {
      type: 'error',
      name: 'InvalidWallet',
      inputs: [],
    },
    {
      type: 'error',
      name: 'NodeRespondedAlready',
      inputs: [],
    },
    {
      type: 'error',
      name: 'NotSubscriptionOwner',
      inputs: [],
    },
    {
      type: 'error',
      name: 'ProofRequestNotFound',
      inputs: [],
    },
    {
      type: 'error',
      name: 'Reentrancy',
      inputs: [],
    },
    {
      type: 'error',
      name: 'SignatureExpired',
      inputs: [],
    },
    {
      type: 'error',
      name: 'SignerMismatch',
      inputs: [],
    },
    {
      type: 'error',
      name: 'SubscriptionCompleted',
      inputs: [],
    },
    {
      type: 'error',
      name: 'SubscriptionNotActive',
      inputs: [],
    },
    {
      type: 'error',
      name: 'SubscriptionNotFound',
      inputs: [],
    },
    {
      type: 'error',
      name: 'UnauthorizedVerifier',
      inputs: [],
    },
    {
      type: 'error',
      name: 'UnsupportedVerifierToken',
      inputs: [],
    },
  ],
  bytecode:
    '0x61018060409080825234620002b65780620049f68038038091620000248285620002ed565b8339602092839181010312620002b657516001600160a01b039081811690819003620002b657306080524660a05260a084516200006181620002bb565b6013815260018582017f496e6665726e6574436f6f7264696e61746f720000000000000000000000000081528688516200009b81620002bb565b8381520192603160f81b845251902091208160c0528060e0528651917f8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f835286830152868201524660608201523060808201522093610100948552600092600163ffffffff1985541617845581519463c57981b560e01b86528086600481875afa958615620002ac57859662000288575b50816101209616865282519363b701069760e01b85528185600481845afa9485156200027e57869562000253575b5090806004928461014097168752855193848092630388027d60e21b82525afa95861562000248579562000212575b50506101609316835251926146c394856200033386396080518561414d015260a05185614170015260c051856145f6015260e0518561461d0152518461412b015251838181610a1501528181610a8d0152818161209d01526121150152518281816105d60152611c740152518181816108d10152818161097001528181611f5a0152611ffa0152f35b62000237929550803d1062000240575b6200022e8183620002ed565b81019062000311565b92388062000189565b503d62000222565b8451903d90823e3d90fd5b829195509162000274600493823d841162000240576200022e8183620002ed565b959192506200015a565b84513d88823e3d90fd5b81620002a49297503d881162000240576200022e8183620002ed565b94386200012c565b83513d87823e3d90fd5b600080fd5b604081019081106001600160401b03821117620002d757604052565b634e487b7160e01b600052604160045260246000fd5b601f909101601f19168101906001600160401b03821190821017620002d757604052565b90816020910312620002b657516001600160a01b0381168103620002b6579056fe61016080604052600436101561001457600080fd5b60006101205260003560e01c908163196ab123146133d657508063298f7bdc1461338357806331e451a9146132725780633b2fb7a81461323557806360ed0f61146131e15780637fb61b271461316f578063836a6cc9146131255780638405089314612b5a57806384b0196e14612a715780639c092514146129d95780639fff314a1461180c578063a17b920b14611618578063af640d0f146115d4578063bc85694f14611582578063c34cf5c714611504578063c509543d146101405763eccec5a8146100e157600080fd5b346101395761012051807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126101365761013261011e613d07565b604051918291602083526020830190613c6a565b0390f35b80fd5b6101205180fd5b346101395760c07ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc36011261013957610177613b3e565b60a052610182613b51565b67ffffffffffffffff604435818111610139576101a3903690600401613cd9565b919092606435828111610139576101be903690600401613cd9565b92608435908111610139576101d7903690600401613cd9565b9190926101e2613b64565b903068929eee149b4bd2126854146114f4573068929eee149b4bd212685563ffffffff60a051166101205152600460205273ffffffffffffffffffffffffffffffffffffffff6040610120512061023f6040518061014052613ba3565b816006825492828416610140515263ffffffff8460a01c16602061014051015263ffffffff8460c01c1660406101405101528360e01c606061014051015261ffff6001820154166080610140510152600281015460a061014051015282600382015460ff8116151560c061014051015260081c1660e06101405101526004810154610100610140510152826005820154166101206101405101520154166101408051015216156114ca5763ffffffff60206101405101511663ffffffff4216106114a05763ffffffff8061032461014051826040816020840151169201511690613d57565b9283608052169116036114765763ffffffff60606101405101511663ffffffff608051161161144c57604051602081019063ffffffff60a05116825263ffffffff6080511660408201526040815261037b81613b87565b519020806101205152600260205261ffff6040610120512054168060c05261ffff6080610140510151161461142257610120515260026020526040610120512061ffff600160c05101167fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000082541617905560405160208101906104668161043a3360805160a0518791939273ffffffffffffffffffffffffffffffffffffffff90604092606085019663ffffffff809216865216602085015216910152565b037fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08101835282613bf0565b519020806101205152600160205260ff6040610120512054166113f85780610120515260016020526040610120512060017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00825416179055610100610140510151610872575b50506101405160c08101511561078b5750916105b991610589602096959460a0610140510151956105596040519a8b998a997f76a87949000000000000000000000000000000000000000000000000000000008b5260048b01523360248b015263ffffffff60a0511660448b015263ffffffff6080511660648b015260e060848b015260e48a0191613dcd565b917ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc8884030160a4890152613dcd565b917ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc8584030160c4860152613dcd565b03816101205173ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000165af1908115610746576101205191610754575b5073ffffffffffffffffffffffffffffffffffffffff61014051511661063060c051613e0c565b9160a0610140510151823b156101395761ffff604051947f7a411a8d00000000000000000000000000000000000000000000000000000000865263ffffffff60a05116600487015263ffffffff60805116602487015216604485015233606485015261012060848501526101205161012485015261014060a48501526101205161014485015261016060c48501526101205161016485015260e484015261010483015281610184816101205180945af1801561074657610730575b505b63ffffffff60a05116610120519033907fc68fb0ae5cea2793405d29014d881bcda18f67122e0bcd7d0a577e118b64e4c88380a33868929eee149b4bd212685580f35b61073990613bc0565b6101205180156106eb5780fd5b6040513d61012051823e3d90fd5b90506020813d602011610783575b8161076f60209383613bf0565b8101031261077e575181610609565b600080fd5b3d9150610762565b73ffffffffffffffffffffffffffffffffffffffff905116926107af60c051613e0c565b92843b156101395761058961082d9361ffff976105596040519b8c9b8c9b8c9a7f7a411a8d000000000000000000000000000000000000000000000000000000008c5263ffffffff60a0511660048d015263ffffffff6080511660248d01521660448b01523360648b015261012060848b01526101248a0191613dcd565b6101205160e4830152610120516101048301526101205194859103925af180156107465761085c575b506106ed565b61086590613bc0565b6101205180156108565780fd5b6040517f439a301200000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff8316600482015260208160248173ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000165afa9081156107465761012051916113d9575b50156113905773ffffffffffffffffffffffffffffffffffffffff6101408051015116604051907f439a3012000000000000000000000000000000000000000000000000000000008252600482015260208160248173ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000165afa9081156107465761012051916113ba575b501561139057610140519061010073ffffffffffffffffffffffffffffffffffffffff6101408401511692015190604051907fc57981b500000000000000000000000000000000000000000000000000000000825260208260048173ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000165afa918215610746576101205192611351575b50604051917febd0905400000000000000000000000000000000000000000000000000000000835260208360048173ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000165afa928315610746576101205193611330575b506101006101405101518160011b6201fffe811661fffe8216036112fd57610af79161fffe610af0921690613e1f565b8095613dc0565b936101405173ffffffffffffffffffffffffffffffffffffffff6101208183511692015116873b15610139576040517f0d67cfd9000000000000000000000000000000000000000000000000000000008152610120805173ffffffffffffffffffffffffffffffffffffffff94851660048401529284166024830152928716604482015260648101939093529051829060849082908a5af18015610746576112e7575b506101405160e081015173ffffffffffffffffffffffffffffffffffffffff16939084610c8c575050505050610140519173ffffffffffffffffffffffffffffffffffffffff610120818551169401511693813b15610139576040517f0d67cfd9000000000000000000000000000000000000000000000000000000008152610120805173ffffffffffffffffffffffffffffffffffffffff9687166004840152968616602483015291909416604485015260648401929092529051919291839160849183915af1801561074657610c76575b505b86806104cc565b610c7f90613bc0565b610120518015610c6d5780fd5b61012073ffffffffffffffffffffffffffffffffffffffff919897949692939598015116604051907f240028e800000000000000000000000000000000000000000000000000000000825260048201526020816024818b5afa9081156107465761012051916112b8575b501561128e5773ffffffffffffffffffffffffffffffffffffffff6101206101405101511690604051917f6fcca69b00000000000000000000000000000000000000000000000000000000835260048301526020826024818b5afa918215610746576101205192611258575b50610d7082610d7792613dc0565b9482613e1f565b916101405173ffffffffffffffffffffffffffffffffffffffff610120818351169201511691853b15610139576040517f0d67cfd90000000000000000000000000000000000000000000000000000000081526101205173ffffffffffffffffffffffffffffffffffffffff93841660048301529383166024820152911660448201526064810184905290818060848101038161012051885af1801561074657611242575b50610140519073ffffffffffffffffffffffffffffffffffffffff610120818451169301511692604051907f132996040000000000000000000000000000000000000000000000000000000082526020826004818d5afa91821561074657610120519261120f575b50610e8f9192613dc0565b92843b15610139576040517f0d67cfd90000000000000000000000000000000000000000000000000000000081526101205173ffffffffffffffffffffffffffffffffffffffff948516600483015291841660248201529190921660448201526064810192909252818060848101038161012051865af18015610746576111f9575b506101405161010073ffffffffffffffffffffffffffffffffffffffff610120830151169101519073ffffffffffffffffffffffffffffffffffffffff86163b15610139576040517fd07293470000000000000000000000000000000000000000000000000000000081526101205133600483015273ffffffffffffffffffffffffffffffffffffffff9092166024820152604481019290925281806064810103816101205173ffffffffffffffffffffffffffffffffffffffff8a165af18015610746576111e3575b506101405173ffffffffffffffffffffffffffffffffffffffff6101208183511692015116823b15610139576040517fd07293470000000000000000000000000000000000000000000000000000000081526101205173ffffffffffffffffffffffffffffffffffffffff938416600483015292909116602482015260448101849052918290818060648101039161012051905af18015610746576111cd575b5060019061108e63ffffffff4216613d40565b9263ffffffff604051946110a186613b87565b16845273ffffffffffffffffffffffffffffffffffffffff60208501951685526040840191825261012051526003602052610120519363ffffffff604086209451167fffffffffffffffff00000000000000000000000000000000000000000000000077ffffffffffffffffffffffffffffffffffffffff000000008654935160201b1692161717835551910155813b156101365750604051907f81e79a9000000000000000000000000000000000000000000000000000000000825263ffffffff60a05116600483015263ffffffff60805116602483015233604483015260806064830152816101205191818061119d60848201898b613dcd565b039161012051905af18015610746576111b7575b50610c6f565b6111c090613bc0565b6101205180156111b15780fd5b6111d690613bc0565b61012051801561107b5780fd5b6111ec90613bc0565b610120518015610fdb5780fd5b61120290613bc0565b610120518015610f115780fd5b610e8f92506112359060203d60201161123b575b61122d8183613bf0565b810190613d94565b91610e84565b503d611223565b61124b90613bc0565b610120518015610e1c5780fd5b9091506020813d602011611286575b8161127460209383613bf0565b8101031261077e575190610d70610d62565b3d9150611267565b60046040517fe2372799000000000000000000000000000000000000000000000000000000008152fd5b6112da915060203d6020116112e0575b6112d28183613bf0565b810190613d7c565b8e610cf6565b503d6112c8565b6112f090613bc0565b610120518015610b9a5780fd5b7f4e487b710000000000000000000000000000000000000000000000000000000061012051526011600452602461012051fd5b61134a91935060203d60201161123b5761122d8183613bf0565b918c610ac0565b9091506020813d602011611388575b8161136d60209383613bf0565b81010312610139575161ffff8116810361013957908b610a48565b3d9150611360565b60046040517f23455ba1000000000000000000000000000000000000000000000000000000008152fd5b6113d3915060203d6020116112e0576112d28183613bf0565b896109a3565b6113f2915060203d6020116112e0576112d28183613bf0565b89610904565b60046040517f88a21e4f000000000000000000000000000000000000000000000000000000008152fd5b60046040517f2f4ca85b000000000000000000000000000000000000000000000000000000008152fd5b60046040517fae6704a7000000000000000000000000000000000000000000000000000000008152fd5b60046040517f4db310c3000000000000000000000000000000000000000000000000000000008152fd5b60046040517fefb74efe000000000000000000000000000000000000000000000000000000008152fd5b60046040517f1a00354f000000000000000000000000000000000000000000000000000000008152fd5b63ab143c0661012051526004601cfd5b346101395760207ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc36011261013957600435610120515260036020526060604061012051206001815491015473ffffffffffffffffffffffffffffffffffffffff6040519263ffffffff8116845260201c1660208301526040820152f35b346101395760207ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126101395760043561012051526002602052602061ffff604061012051205416604051908152f35b346101395761012051807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126101365763ffffffff6020915416604051908152f35b346101395760207ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126101395763ffffffff611654613b3e565b60405161166081613ba3565b6101205181526101205160208201526101205160408201526101205160608201526101205160808201526101205160a08201526101205160c08201526101205160e082015261012051610100820152610120516101208201526101406101205191015216610120515260046020526101606040610120512073ffffffffffffffffffffffffffffffffffffffff6101406040516116fc81613ba3565b826006855495828716845263ffffffff8760a01c16602085015263ffffffff8760c01c1660408501528660e01c606085015261ffff6001820154166080850152600281015460a085015282600382015460ff8116151560c087015260081c1660e085015260048101546101008501528260058201541661012085015201541682820152826040519416845263ffffffff602082015116602085015263ffffffff604082015116604085015263ffffffff606082015116606085015261ffff608082015116608085015260a081015160a085015260c0810151151560c08501528260e08201511660e08501526101008101516101008501528261012082015116610120850152015116610140820152f35b34610139576102a07ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc36011261013957611844613b3e565b61184c613b51565b6101607fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffbc3601126101395761187f613cc8565b90610204359263ffffffff8416840361077e5767ffffffffffffffff9161022435838111610139576118b5903690600401613cd9565b93909461024435828111610139576118d1903690600401613cd9565b91909261026435908111610139576118ed903690600401613cd9565b94909573ffffffffffffffffffffffffffffffffffffffff6102843516610284350361077e57611926926101e435926101c43592613e3d565b610100523068929eee149b4bd2126854146114f4573068929eee149b4bd212685563ffffffff61010051166101205152600460205273ffffffffffffffffffffffffffffffffffffffff604061012051206119866040518060e052613ba3565b81600682549282841660e0515263ffffffff8460a01c16602060e051015263ffffffff8460c01c16604060e05101528360e01c606060e051015261ffff600182015416608060e0510152600281015460a060e051015282600382015460ff8116151560c060e051015260081c1660e080510152600481015461010060e05101528260058201541661012060e051015201541661014060e051015216156114ca5763ffffffff602060e05101511663ffffffff4216106114a05763ffffffff611a5e60e051826040816020840151169201511690613d57565b971663ffffffff8816036114765763ffffffff606060e05101511663ffffffff88161161144c57604051602081019063ffffffff6101005116825263ffffffff8916604082015260408152611ab281613b87565b51902095866101205152600260205261ffff6040610120512054169661ffff608060e051015116881461142257610120515260026020526040610120512061ffff60018901167fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00008254161790556040516020810190611b6c8161043a338d610100518791939273ffffffffffffffffffffffffffffffffffffffff90604092606085019663ffffffff809216865216602085015216910152565b519020806101205152600160205260ff6040610120512054166113f85780610120515260016020526040610120512060017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0082541617905561010060e0510151611ef8575b5060e05160c081015115611e0e575093879361058963ffffffff9794611c579461055960209960a060e0510151986040519c8d9b8c9b7f76a87949000000000000000000000000000000000000000000000000000000008d5260048d01523360248d015281610100511660448d01521660648b015260e060848b015260e48a0191613dcd565b03816101205173ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000165af1908115610746576101205191611ddc575b50611ccb73ffffffffffffffffffffffffffffffffffffffff60e051511692613e0c565b60a060e051015190833b156101395761ffff9063ffffffff604051967f7a411a8d000000000000000000000000000000000000000000000000000000008852816101005116600489015216602487015216604485015233606485015261012060848501526101205161012485015261014060a48501526101205161014485015261016060c48501526101205161016485015260e484015261010483015281610184816101205180945af1801561074657611dc6575b505b63ffffffff6101005116610120519033907fc68fb0ae5cea2793405d29014d881bcda18f67122e0bcd7d0a577e118b64e4c88380a33868929eee149b4bd212685580f35b611dcf90613bc0565b610120518015611d805780fd5b90506020813d602011611e06575b81611df760209383613bf0565b8101031261077e575183611ca7565b3d9150611dea565b73ffffffffffffffffffffffffffffffffffffffff611e3891999794989693959299511695613e0c565b97853b156101395763ffffffff977f7a411a8d000000000000000000000000000000000000000000000000000000009561055961058993611eb39761ffff6040519e8f9e8f9e8f9d8e528d60048361010051169101521660248d01521660448b01523360648b015261012060848b01526101248a0191613dcd565b6101205160e4830152610120516101048301526101205194859103925af1801561074657611ee2575b50611d82565b611eeb90613bc0565b610120518015611edc5780fd5b6040517f439a301200000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff6102843516600482015260208160248173ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000165afa9081156107465761012051916129ba575b50156113905773ffffffffffffffffffffffffffffffffffffffff61014060e051015116604051907f439a3012000000000000000000000000000000000000000000000000000000008252600482015260208160248173ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000165afa90811561074657610120519161299b575b50156113905760e05161010073ffffffffffffffffffffffffffffffffffffffff6101408301511691015191604051907fc57981b500000000000000000000000000000000000000000000000000000000825260208260048173ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000165afa91821561074657610120519261295c575b50604051917febd0905400000000000000000000000000000000000000000000000000000000835260208360048173ffffffffffffffffffffffffffffffffffffffff7f0000000000000000000000000000000000000000000000000000000000000000165afa92831561074657610120519361293b575b5061010060e05101518160011b6201fffe811661fffe8216036112fd5761217e9161fffe612177921690613e1f565b8096613dc0565b9460e05173ffffffffffffffffffffffffffffffffffffffff6101208183511692015116863b15610139576040517f0d67cfd9000000000000000000000000000000000000000000000000000000008152610120805173ffffffffffffffffffffffffffffffffffffffff9485166004840152928416602483015292871660448201526064810193909352905182906084908290895af1801561074657612925575b5060e0519273ffffffffffffffffffffffffffffffffffffffff60e08501511693841560001461231857505050505060e0519173ffffffffffffffffffffffffffffffffffffffff610120818551169401511691803b15610139576040517f0d67cfd90000000000000000000000000000000000000000000000000000000081526101205173ffffffffffffffffffffffffffffffffffffffff9586166004830152938516602482015261028435909416604485015260648401919091528290818060848101039161012051905af1801561074657612302575b505b88611bd1565b61230b90613bc0565b6101205180156122fa5780fd5b61012073ffffffffffffffffffffffffffffffffffffffff919792939597969496015116604051907f240028e800000000000000000000000000000000000000000000000000000000825260048201526020816024818a5afa908115610746576101205191612906575b501561128e5773ffffffffffffffffffffffffffffffffffffffff61012060e05101511690604051917f6fcca69b00000000000000000000000000000000000000000000000000000000835260048301526020826024818a5afa9182156107465761012051926128d0575b50610d70826123fb92613dc0565b9160e05173ffffffffffffffffffffffffffffffffffffffff610120818351169201511691853b15610139576040517f0d67cfd90000000000000000000000000000000000000000000000000000000081526101205173ffffffffffffffffffffffffffffffffffffffff93841660048301529383166024820152911660448201526064810184905290818060848101038161012051885af18015610746576128ba575b5060e0519073ffffffffffffffffffffffffffffffffffffffff610120818451169301511692604051907f132996040000000000000000000000000000000000000000000000000000000082526020826004818c5afa918215610746576101205192612897575b506125119192613dc0565b92843b15610139576040517f0d67cfd90000000000000000000000000000000000000000000000000000000081526101205173ffffffffffffffffffffffffffffffffffffffff948516600483015291841660248201529190921660448201526064810192909252818060848101038161012051865af1801561074657612881575b5060e05161010073ffffffffffffffffffffffffffffffffffffffff610120830151169101519073ffffffffffffffffffffffffffffffffffffffff61028435163b15610139576040517fd07293470000000000000000000000000000000000000000000000000000000081526101205133600483015273ffffffffffffffffffffffffffffffffffffffff9092166024820152604481019290925281806064810103816101205173ffffffffffffffffffffffffffffffffffffffff61028435165af180156107465761286b575b5060e05173ffffffffffffffffffffffffffffffffffffffff6101208183511692015116823b15610139576040517fd07293470000000000000000000000000000000000000000000000000000000081526101205173ffffffffffffffffffffffffffffffffffffffff938416600483015292909116602482015260448101849052918290818060648101039161012051905af1801561074657612855575b50600161271363ffffffff4216613d40565b9163ffffffff6040519361272685613b87565b168352602083019373ffffffffffffffffffffffffffffffffffffffff610284351685526040840191825261012051526003602052610120519363ffffffff604086209451167fffffffffffffffff00000000000000000000000000000000000000000000000077ffffffffffffffffffffffffffffffffffffffff000000008654935160201b1692161717835551910155813b156101365750604051907f81e79a9000000000000000000000000000000000000000000000000000000000825263ffffffff6101005116600483015263ffffffff8a166024830152336044830152608060648301528161012051918180612825608482018b8d613dcd565b039161012051905af180156107465761283f575b506122fc565b61284890613bc0565b6101205180156128395780fd5b61285e90613bc0565b6101205180156127015780fd5b61287490613bc0565b6101205180156126625780fd5b61288a90613bc0565b6101205180156125935780fd5b61251192506128b49060203d60201161123b5761122d8183613bf0565b91612506565b6128c390613bc0565b61012051801561249f5780fd5b9091506020813d6020116128fe575b816128ec60209383613bf0565b8101031261077e575190610d706123ed565b3d91506128df565b61291f915060203d6020116112e0576112d28183613bf0565b8f612382565b61292e90613bc0565b6101205180156122205780fd5b61295591935060203d60201161123b5761122d8183613bf0565b918d612148565b9091506020813d602011612993575b8161297860209383613bf0565b81010312610139575161ffff8116810361013957908c6120d0565b3d915061296b565b6129b4915060203d6020116112e0576112d28183613bf0565b8a61202d565b6129d3915060203d6020116112e0576112d28183613bf0565b8a611f8d565b34610139576102007ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc36011261013957612a11613b3e565b612a19613b51565b906101607fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffbc36011261013957602091612a6391612a54613cc8565b6101e435926101c43592613e3d565b63ffffffff60405191168152f35b346101395761012051807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc36011261013657612b04612aae613c31565b612ab6613d07565b906040519283927f0f000000000000000000000000000000000000000000000000000000000000008452612af660209360e08587015260e0860190613c6a565b908482036040860152613c6a565b904660608401523060808401526101205160a084015282820360c084015280606051928381520191608091610120515b828110612b4357505050500390f35b835185528695509381019392810192600101612b34565b34610139576101207ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126101395760043567ffffffffffffffff80821161013957366023830112156101395781600401359081116130f65760405191612bea60207fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0601f8501160184613bf0565b818352366024838301011161013957602482910160208401376020610120519183010152612c16613b51565b906044359163ffffffff8316830361077e5760643561ffff811681036101395760843590811515820361077e57612c4b613b64565b9160e4359373ffffffffffffffffffffffffffffffffffffffff8516850361077e57610104359273ffffffffffffffffffffffffffffffffffffffff8416840361077e57610120519687549763ffffffff6001818b1601167fffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000008a1617905563ffffffff808a1681421601116130c7576040518060208101926020845260408201612cf491613c6a565b037fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe081018252612d249082613bf0565b5190209160405198612d358a613ba3565b338a5263ffffffff81164263ffffffff160163ffffffff1660208b015263ffffffff1660408a015263ffffffff16606089015261ffff16608088015260a0870152151560c086015273ffffffffffffffffffffffffffffffffffffffff1660e085015260c43561010085015273ffffffffffffffffffffffffffffffffffffffff1661012084015273ffffffffffffffffffffffffffffffffffffffff1661014083015263ffffffff811661012051526004602052610120519160408320815173ffffffffffffffffffffffffffffffffffffffff1681547fffffffffffffffffffffffff000000000000000000000000000000000000000016178155602082015163ffffffff16612e8b9082907fffffffffffffffff00000000ffffffffffffffffffffffffffffffffffffffff77ffffffff000000000000000000000000000000000000000083549260a01b169116179055565b604082015181547fffffffff00000000ffffffffffffffffffffffffffffffffffffffffffffffff1660c09190911b7bffffffff00000000000000000000000000000000000000000000000016178155606082015181547bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1660e09190911b7fffffffff000000000000000000000000000000000000000000000000000000001617815560018101608083015161ffff1681547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00001617905560a082015160028201556003810160c08301511515612fa990829060ff7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0083541691151516179055565b60e083015181547fffffffffffffffffffffff0000000000000000000000000000000000000000ff1660089190911b74ffffffffffffffffffffffffffffffffffffffff001617905561010082015160048201556005810161012083015173ffffffffffffffffffffffffffffffffffffffff1681547fffffffffffffffffffffffff00000000000000000000000000000000000000001617905560060190610140015173ffffffffffffffffffffffffffffffffffffffff1681547fffffffffffffffffffffffff0000000000000000000000000000000000000000161790556040519163ffffffff821690807f04344ed7a67fec80c444d56ee1cee242f3f75b91fecc8dbce8890069c82eb48e91a263ffffffff168152602090f35b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b346101395760407ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc360112610139576020612a63613161613b3e565b613169613b51565b90613d57565b346101395760207ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126101395760043573ffffffffffffffffffffffffffffffffffffffff811680910361077e5761012051526005602052602063ffffffff604061012051205416604051908152f35b346101395760207ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126101395760043561012051526006602052602063ffffffff604061012051205416604051908152f35b346101395761012051807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126101365761013261011e613c31565b346101395760207ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126101395763ffffffff6132ae613b3e565b16806101205152600460205273ffffffffffffffffffffffffffffffffffffffff604061012051205416330361335957806101205152600460205261012051906040822077ffffffff00000000000000000000000000000000000000007fffffffffffffffff00000000ffffffffffffffffffffffffffffffffffffffff8254161790557ff4126e31c182db4c4109605c6d50470fc7e8ca90d62d44fd25cbe049fb9cac3e8280a280f35b60046040517fa7fba711000000000000000000000000000000000000000000000000000000008152fd5b346101395760207ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126101395760043561012051526001602052602060ff6040610120512054166040519015158152f35b3461077e5760807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc36011261077e5761340d613b3e565b613415613b51565b9173ffffffffffffffffffffffffffffffffffffffff604435166044350361077e5760643515156064350361077e5763ffffffff80831660208301908152908416604083015273ffffffffffffffffffffffffffffffffffffffff60443516606083015290613487816080810161043a565b519020806101205152600360205260406101205120906001604051926134ac84613b87565b73ffffffffffffffffffffffffffffffffffffffff815463ffffffff8116865260201c166020850152015460408301526101205152600360205261012051600160408220828155015563ffffffff81511615613b145763ffffffff82166101205152600460205260406101205120906040519161352883613ba3565b805473ffffffffffffffffffffffffffffffffffffffff8116845263ffffffff8160a01c16602085015263ffffffff8160c01c16604085015260e01c606084015261ffff6001820154166080840152600281015460a084015273ffffffffffffffffffffffffffffffffffffffff600382015460ff8116151560c086015260081c1660e08401526004810154908161010085015273ffffffffffffffffffffffffffffffffffffffff600681600584015416928361012088015201541661014085015273ffffffffffffffffffffffffffffffffffffffff60208401511691823b15610139576040517fc70483690000000000000000000000000000000000000000000000000000000081526101205173ffffffffffffffffffffffffffffffffffffffff60448035821660048501529416602483015292810191909152918290818060648101039161012051905af1801561074657613b05575b5073ffffffffffffffffffffffffffffffffffffffff6101408301511673ffffffffffffffffffffffffffffffffffffffff83511673ffffffffffffffffffffffffffffffffffffffff6101208501511691604084015190803b15610139576040517fc70483690000000000000000000000000000000000000000000000000000000081526101205173ffffffffffffffffffffffffffffffffffffffff948516600483015293909416602485015260448401919091528290818060648101039161012051905af1801561074657613aef575b5063ffffffff81511663ffffffff4216109182600014613a0a5773ffffffffffffffffffffffffffffffffffffffff60e08201511633036139e057606435156138f65773ffffffffffffffffffffffffffffffffffffffff610140820151169173ffffffffffffffffffffffffffffffffffffffff610120818451169301511692604073ffffffffffffffffffffffffffffffffffffffff60208401511692015191813b15610139576040517f0d67cfd9000000000000000000000000000000000000000000000000000000008152610120805173ffffffffffffffffffffffffffffffffffffffff9687166004840152968616602483015291909416604485015260648401929092529051919291839160849183915af18015610746576138e0575b505b604051908152336020820152606435151560408201527faf1556610075709bf885e17681512d329b1a40f799ee5196f79461e89b656454606063ffffffff8073ffffffffffffffffffffffffffffffffffffffff604435169616941692a46101205180f35b6138e990613bc0565b6101205180156138795780fd5b90602073ffffffffffffffffffffffffffffffffffffffff9101511673ffffffffffffffffffffffffffffffffffffffff610120830151169161010073ffffffffffffffffffffffffffffffffffffffff6101408301511691015190823b1561013957604051937f0d67cfd900000000000000000000000000000000000000000000000000000000855273ffffffffffffffffffffffffffffffffffffffff604435166004860152602485015260448401526064830152816084816101205180945af18015610746576139ca575b5061387b565b6139d390613bc0565b6101205180156139c45780fd5b60046040517fb9857aa1000000000000000000000000000000000000000000000000000000008152fd5b73ffffffffffffffffffffffffffffffffffffffff610140820151169173ffffffffffffffffffffffffffffffffffffffff610120818451169301511692604073ffffffffffffffffffffffffffffffffffffffff60208401511692015191813b15610139576040517f0d67cfd9000000000000000000000000000000000000000000000000000000008152610120805173ffffffffffffffffffffffffffffffffffffffff9687166004840152968616602483015291909416604485015260648401929092529051919291839160849183915af18015610746576139ca575061387b565b613af890613bc0565b6101205180156137565780fd5b613b0e90613bc0565b84613683565b60046040517f1d68b37c000000000000000000000000000000000000000000000000000000008152fd5b6004359063ffffffff8216820361077e57565b6024359063ffffffff8216820361077e57565b60a4359073ffffffffffffffffffffffffffffffffffffffff8216820361077e57565b6060810190811067ffffffffffffffff8211176130f657604052565b610160810190811067ffffffffffffffff8211176130f657604052565b67ffffffffffffffff81116130f657604052565b6040810190811067ffffffffffffffff8211176130f657604052565b90601f7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0910116810190811067ffffffffffffffff8211176130f657604052565b60405190613c3e82613bd4565b601382527f496e6665726e6574436f6f7264696e61746f72000000000000000000000000006020830152565b919082519283825260005b848110613cb45750507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0601f8460006020809697860101520116010190565b602081830181015184830182015201613c75565b6101a4359060ff8216820361077e57565b9181601f8401121561077e5782359167ffffffffffffffff831161077e576020838186019501011161077e57565b60405190613d1482613bd4565b600182527f31000000000000000000000000000000000000000000000000000000000000006020830152565b9062093a8063ffffffff809316019182116130c757565b63ffffffff8092168015613d745782600192814216031604011690565b505050600190565b9081602091031261077e5751801515810361077e5790565b9081602091031261077e575173ffffffffffffffffffffffffffffffffffffffff8116810361077e5790565b919082039182116130c757565b601f82602094937fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0938186528686013760008582860101520116010190565b90600161ffff809316019182116130c757565b9061ffff16908181029181830414901517156130c757612710900490565b919290926044359073ffffffffffffffffffffffffffffffffffffffff8216820361077e57604051602081019073ffffffffffffffffffffffffffffffffffffffff8416825263ffffffff8616604082015260408152613e9c81613b87565b5190209586600052600660205263ffffffff6040600020541680614682575063ffffffff861663ffffffff421610156146585763ffffffff606435166064350361077e5763ffffffff608435166084350361077e5763ffffffff60a4351660a4350361077e5760c4359361ffff8516850361077e57610104351515610104350361077e5773ffffffffffffffffffffffffffffffffffffffff6101243516610124350361077e57610164359673ffffffffffffffffffffffffffffffffffffffff8816880361077e5773ffffffffffffffffffffffffffffffffffffffff6101843516610184350361077e57604051907f3da81ed66ee47395e568c52867826ec137777eef9c1bdfb6bf972dd4385bc5a9602083015273ffffffffffffffffffffffffffffffffffffffff8616604083015263ffffffff60643516606083015263ffffffff60843516608083015263ffffffff60a4351660a083015261ffff871660c083015260e43560e083015261010435151561010083015273ffffffffffffffffffffffffffffffffffffffff61012435166101208301526101443561014083015273ffffffffffffffffffffffffffffffffffffffff891661016083015261018073ffffffffffffffffffffffffffffffffffffffff6101843516818401528252816101a081011067ffffffffffffffff6101a0840111176130f6576101a0820160405263ffffffff82516020840120917fba9ff1aef2b048b42767aade2b901745a3acf14f698a9ec13952098cfd03d0b66101c0850152818a166101e08501521661020083015261022082015260806101a08201526101a0810161024082011067ffffffffffffffff610240830111176130f65761024081016040526101a08101516101c0820120907f0000000000000000000000000000000000000000000000000000000000000000907f000000000000000000000000000000000000000000000000000000000000000030147f0000000000000000000000000000000000000000000000000000000000000000461416156145c7575b50671901000000000000600052601a52603a5260ff6042601820936000603a5260405194600052166020526040526060526020600160806000825afa51903d156145b9576000606052806040527f7ac3c02f00000000000000000000000000000000000000000000000000000000815260208160048173ffffffffffffffffffffffffffffffffffffffff87165afa9081156145ad5773ffffffffffffffffffffffffffffffffffffffff91829160009161458e575b50169116036145645763ffffffff9473ffffffffffffffffffffffffffffffffffffffff92600660005496886001818a1601167fffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000089161760005588881660005260046020526040600020907fffffffffffffffffffffffff0000000000000000000000000000000000000000938787168584541617835561433560643584907fffffffffffffffff00000000ffffffffffffffffffffffffffffffffffffffff77ffffffff000000000000000000000000000000000000000083549260a01b169116179055565b82547fffffffff00000000ffffffffffffffffffffffffffffffffffffffffffffffff1660843560c01b7bffffffff0000000000000000000000000000000000000000000000001617835582547bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1660a43560e01b7fffffffff000000000000000000000000000000000000000000000000000000001617835561ffff6001840191167fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000082541617905560e43560028301556144896003830161444261010435829060ff7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0083541691151516179055565b80547fffffffffffffffffffffff0000000000000000000000000000000000000000ff166101243560081b74ffffffffffffffffffffffffffffffffffffffff0016179055565b6101443560048301558660058301911684825416179055019084610184351690825416179055600052600660205260406000208585167fffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000008254161790558484167f04344ed7a67fec80c444d56ee1cee242f3f75b91fecc8dbce8890069c82eb48e600080a216600052600560205260406000209081549084821685821611614533575b5050501690565b847fffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000009116911617905538808061452c565b60046040517f10c74b03000000000000000000000000000000000000000000000000000000008152fd5b6145a7915060203d60201161123b5761122d8183613bf0565b3861424e565b6040513d6000823e3d90fd5b638baa579f6000526004601cfd5b60a09150807f8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f610240809301527f00000000000000000000000000000000000000000000000000000000000000006102608201527f0000000000000000000000000000000000000000000000000000000000000000610280820152466102a0820152306102c0820152012038614198565b60046040517f0819bdcd000000000000000000000000000000000000000000000000000000008152fd5b96505050505050509056fea2646970667358221220c07b9237557b758e52281704d79aef5c885b765e1280e216d9f91a5de146c3e564736f6c63430008130033',
};

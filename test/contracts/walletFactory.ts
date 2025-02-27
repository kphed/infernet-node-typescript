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
      name: 'createWallet',
      inputs: [
        {
          name: 'initialOwner',
          type: 'address',
          internalType: 'address',
        },
      ],
      outputs: [
        {
          name: '',
          type: 'address',
          internalType: 'address',
        },
      ],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'isValidWallet',
      inputs: [
        {
          name: 'wallet',
          type: 'address',
          internalType: 'address',
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
      type: 'event',
      name: 'WalletCreated',
      inputs: [
        {
          name: 'caller',
          type: 'address',
          indexed: true,
          internalType: 'address',
        },
        {
          name: 'owner',
          type: 'address',
          indexed: true,
          internalType: 'address',
        },
        {
          name: 'wallet',
          type: 'address',
          indexed: false,
          internalType: 'address',
        },
      ],
      anonymous: false,
    },
  ],
  bytecode:
    '0x60a03461006957601f6110b838819003918201601f19168301916001600160401b0383118484101761006e5780849260209460405283398101031261006957516001600160a01b038116810361006957608052604051611033908161008582396080518160b40152f35b600080fd5b634e487b7160e01b600052604160045260246000fdfe6080604090808252600436101561001557600080fd5b600090813560e01c908163439a30121461018e575063b054a9e81461003957600080fd5b3461018b5760207ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc36011261018b576004359173ffffffffffffffffffffffffffffffffffffffff92838116809103610187578151610e058082019082821067ffffffffffffffff83111761015a57849183916101f98339877f000000000000000000000000000000000000000000000000000000000000000016815284602082015203019084f0801561014e57602094839116938481528086522060017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0082541617905581518381527fca0b7dde26052d34217ef1a0cee48085a07ca32da0a918609937a307d496bbf5853392a351908152f35b505051903d90823e3d90fd5b6024867f4e487b710000000000000000000000000000000000000000000000000000000081526041600452fd5b8280fd5b80fd5b905082346101875760207ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126101875760043573ffffffffffffffffffffffffffffffffffffffff81168091036101f4578352602083815292205460ff1615158152f35b8380fdfe60a080604052346101145760408162000e0580380380916100208285610119565b8339810103126101145780516001600160a01b03918282169182900361011457602061004f8160049301610152565b9260405192838092633b2bcbf160e01b82525afa908115610108576000916100cc575b506080521680638b78c6d8195560007f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e08180a3604051610c9e90816200016782396080518181816104b701528181610621015261094b0152f35b906020823d8211610100575b816100e560209383610119565b810103126100fd57506100f790610152565b38610072565b80fd5b3d91506100d8565b6040513d6000823e3d90fd5b600080fd5b601f909101601f19168101906001600160401b0382119082101761013c57604052565b634e487b7160e01b600052604160045260246000fd5b51906001600160a01b03821682036101145756fe6080604081815260049182361015610022575b505050361561002057600080fd5b005b600092833560e01c9182630d67cfd9146108dd57508163256929621461087457816354d1f13d14610810578163715018a6146107915781638da5cb5b1461071f578163c7048369146105f6578163d07293471461048a578163dd62ed3e14610416578163e1f21c6714610372578163f04e283e146102a9578163f2fde38b146101f5578163f3fef3a314610115575063fee81cf4146100c15780610012565b346101115760207ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc360112610111576020916100fb610a1e565b9063389a75e1600c525281600c20549051908152f35b5080fd5b8391503461011157827ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126101115761014e610a1e565b6024359161015a610ac9565b61016382610b3d565b83116101ce57506101c87f65ac0d8bb8cbc0e989ebd02ddc5161d7c499f7c21792e43fcf170314fe6bcc3f939461019b843385610bae565b51928392836020909392919373ffffffffffffffffffffffffffffffffffffffff60408201951681520152565b0390a180f35b84517f356680b7000000000000000000000000000000000000000000000000000000008152fd5b839060207ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc36011261011157610229610a1e565b90610232610ac9565b8160601b1561029e575073ffffffffffffffffffffffffffffffffffffffff167fffffffffffffffffffffffffffffffffffffffffffffffffffffffff748739278181547f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e08580a35580f35b637448fbae8352601cfd5b8360207ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc36011261036f576102dc610a1e565b6102e4610ac9565b63389a75e1600c528082526020600c20928354421161036457508173ffffffffffffffffffffffffffffffffffffffff929355167fffffffffffffffffffffffffffffffffffffffffffffffffffffffff748739278181547f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e08580a35580f35b636f5e88188352601cfd5b80fd5b505034610111577f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b9256104106103a636610a69565b929091946103b2610ac9565b73ffffffffffffffffffffffffffffffffffffffff8096169586885260016020528188209084168852602052838188205551928392836020909392919373ffffffffffffffffffffffffffffffffffffffff60408201951681520152565b0390a280f35b50503461011157807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126101115780602092610452610a1e565b61045a610a46565b73ffffffffffffffffffffffffffffffffffffffff91821683526001865283832091168252845220549051908152f35b919050346105f25761049b36610a69565b90929173ffffffffffffffffffffffffffffffffffffffff90817f00000000000000000000000000000000000000000000000000000000000000001633036105ca576104e685610b3d565b83116105a25781169485875260209160018352848820951694858852825282848820541061057b57506060927f813582499997f00ba0142c7813740a6e381df71a63d11d8c8f208f66b7795d269492600192878952838152828920858a528152828920610554838254610b01565b905584895288815282892061056a838254610c5b565b90558251948552840152820152a280f35b83517f13be252b000000000000000000000000000000000000000000000000000000008152fd5b8584517f356680b7000000000000000000000000000000000000000000000000000000008152fd5b8584517f9ec853e6000000000000000000000000000000000000000000000000000000008152fd5b8280fd5b9050346105f25761060636610a69565b939173ffffffffffffffffffffffffffffffffffffffff91827f00000000000000000000000000000000000000000000000000000000000000001633036106f657821693848752866020528387205486116106cf5750606092849287927f813582499997f00ba0142c7813740a6e381df71a63d11d8c8f208f66b7795d2696845283602052828420610699898254610b01565b9055169586835260016020528183208484526020528183206106bc828254610c5b565b905581519384526020840152820152a280f35b83517f356680b7000000000000000000000000000000000000000000000000000000008152fd5b505050517f9ec853e6000000000000000000000000000000000000000000000000000000008152fd5b50503461011157817ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126101115760209073ffffffffffffffffffffffffffffffffffffffff7fffffffffffffffffffffffffffffffffffffffffffffffffffffffff7487392754915191168152f35b83807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc36011261036f576107c3610ac9565b807fffffffffffffffffffffffffffffffffffffffffffffffffffffffff748739278181547f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e08280a35580f35b83807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc36011261036f5763389a75e1600c52338152806020600c2055337ffa7b8eab7da67f412cc9575ed43464468f9bfbae89d1675917346ca6d8fe3c928280a280f35b83807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc36011261036f5763389a75e1600c523381526202a30042016020600c2055337fdbf36a107da19e49527a7176a1babf963b4b0ff8cde35ee35d6cd8f1f9ac7e1d8280a280f35b90915034610a1a5760807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc360112610a1a57610917610a1e565b92610920610a46565b9060443573ffffffffffffffffffffffffffffffffffffffff80821696878303610a165760643595827f00000000000000000000000000000000000000000000000000000000000000001633036109ef5750811695868952600160205283892091851691828a5260205285848a20541061057b57509161019b856109e9937fd1398bee19313d6bf672ccb116e51f4a1a947e91c757907f51fbb5b5e56c698f979695898c526001602052848c20908c52602052838b206109e1838254610b01565b905585610bae565b0390a380f35b807f9ec853e600000000000000000000000000000000000000000000000000000000899252fd5b8880fd5b8380fd5b6004359073ffffffffffffffffffffffffffffffffffffffff82168203610a4157565b600080fd5b6024359073ffffffffffffffffffffffffffffffffffffffff82168203610a4157565b7ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc6060910112610a415773ffffffffffffffffffffffffffffffffffffffff906004358281168103610a4157916024359081168103610a41579060443590565b7fffffffffffffffffffffffffffffffffffffffffffffffffffffffff74873927543303610af357565b6382b429006000526004601cfd5b91908203918211610b0e57565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b610b7c9073ffffffffffffffffffffffffffffffffffffffff8116908160005260006020526040600020549160009015600014610b7f57505047610b01565b90565b602460106020936f70a08231000000000000000000000000859430601452525afa601f3d111660205102610b01565b73ffffffffffffffffffffffffffffffffffffffff8116610c125750814710610c045760003881808585620186a0f115610be6575050565b601691600b916000526073825360ff602053f015610c0057565b3838fd5b63b12d13eb6000526004601cfd5b60109260209260145260345260446000938480936fa9059cbb00000000000000000000000082525af13d156001835114171615610c4e57603452565b6390b8ec1890526004601cfd5b91908201809211610b0e5756fea26469706673582212202e0ab6d55e4841749497436bc5e0356674c35d3b617c990721a4bc30b077fbdf64736f6c63430008130033a2646970667358221220ab1bce0f86786e7eeb41a48b8a3b42d8250d38729b65f76a8f819832d95d0d0f64736f6c63430008130033',
};

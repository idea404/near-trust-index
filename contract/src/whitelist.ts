class WhitelistTypes {
    static readonly NFT = 'NFT';
    static readonly DAO = 'DAO';
}

const WHITELIST = {
    "asac.near": WhitelistTypes.NFT,
    "nearnautnft.near": WhitelistTypes.NFT,
    "secretskelliessociety.near": WhitelistTypes.NFT,
    "kycdao.near": WhitelistTypes.DAO,
}
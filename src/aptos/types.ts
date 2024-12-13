export type FungibleAssetMetadataResponse = {
  fungible_asset_metadata: FungibleAssetMetadata[];
};

export type CoinInfoResponse = {
  coin_infos: CoinInfo[];
};

export type FungibleAssetMetadata = {
  assetType: string;
  decimals: number;
  name: string;
  symbol: string;
};

export type CoinInfo = {
  decimals: number;
  name: string;
  coinType: string;
  symbol: string;
};

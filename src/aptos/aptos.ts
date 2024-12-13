import axios, { AxiosInstance } from 'axios';
import { ClientRequest, ClientResponse } from '@aptos-labs/ts-sdk';
import { Aptos as AptosClient, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import {
  CoinInfo,
  FungibleAssetMetadata,
  FungibleAssetMetadataResponse,
  CoinInfoResponse,
} from './types.js';
import * as retry from '../utils/retry.js';
import { PromClient } from '../prometheus-client/client.js';

const metrics: Record<string, { name: string; help: string }> = {
  REQUEST_ERROR: {
    name: 'aptos_blockchain_request_error_count',
    help: 'Counts the number of failed requestsa in Blockchain',
  },
};

// Hardcoded map for specific addresses
const overridedTokenNames = new Map<string, string>([
  [
    '0x5e156f1207d0ebfa19a9eeff00d62a282278fb8719f4fab3a586a0a2c0fffbea::coin::T',
    'wUSDC',
  ],
  [
    '0xcc8a89c8dce9693d354449f1f73e60e14e347417854f029db5bc8e7454008abb::coin::T',
    'zWETH',
  ],
]);

export class Aptos {
  private aptos: AptosClient;
  // Fix it
  private prom: any;

  constructor() {
    this.aptos = new AptosClient(
      new AptosConfig({
        network: Network.MAINNET,
        fullnode: 'https://api.mainnet.aptoslabs.com/v1',
        client: { provider: axiosCustomClient }, // Use the custom Axios client
      }),
    );
  }

  public withPrometheusClient(prom: PromClient): Aptos {
    this.prom = prom;
    this.prom.registerObservableCounter(
      metrics.REQUEST_ERROR.name,
      metrics.REQUEST_ERROR.help,
      {},
    );

    return this;
  }

  /**
   * Fetches information about an array of coins using GraphQL in a single request.
   * @param coinAddresses Array of coin addresses in the format <account_address>::<module>::<struct>
   * @returns A promise resolving to an array of CoinInfo objects
   */
  async getCoinInfo(coinAddresses: string[]): Promise<CoinInfo[]> {
    const res = await retry
      .simple(async () => {
        return await this.aptos.queryIndexer<CoinInfoResponse>({
          query: {
            query: `
            query CoinInfo($coinAddresses: [String!]!) {
              coin_infos(
                where: { coin_type: { _in: $coinAddresses } }
              ) {
                decimals
                name
                symbol
                coin_type
              }
            }
          `,
            variables: { coinAddresses },
          },
        });
      })
      .catch((e: retry.RetryError) => {
        this.prom.incrementMetric(metrics.REQUEST_ERROR.name, {});
        throw e;
      });

    return res.result.coin_infos.map((coin: any) => {
      const hardcodedName = overridedTokenNames.get(coin.coin_type);
      return {
        decimals: coin.decimals,
        name: hardcodedName || coin.name, // Replace name if hardcoded
        symbol: coin.symbol,
        coinType: coin.coin_type,
      };
    });
  }

  /**
   * Fetches fungible asset metadata using GraphQL in a single request.
   * @param assetTypes The asset types to filter fungible assets
   * @returns A promise resolving to an array of FungibleAssetMetadata objects
   */
  async getFundableAssets(
    assetTypes: string[],
  ): Promise<FungibleAssetMetadata[]> {
    const AptosInfo: FungibleAssetMetadata[] = assetTypes
      .filter((address) => address.toLowerCase() === '0xa')
      .map(() => ({
        decimals: 8,
        name: 'Aptos',
        symbol: 'APT',
        assetType: '0xa',
      }));

    const res = await retry
      .simple(async () => {
        return await this.aptos.queryIndexer<FungibleAssetMetadataResponse>({
          query: {
            query: `
            query FungibleAssetMetadata($assetTypes: [String!]!) {
              fungible_asset_metadata(
                where: { asset_type: { _in: $assetTypes } }
              ) {
                asset_type
                decimals
                name
                symbol
              }
            }
          `,
            variables: { assetTypes },
          },
        });
      })
      .catch((e: retry.RetryError) => {
        this.prom.incrementMetric(metrics.REQUEST_ERROR.name, {});
        throw e;
      });
    return [
      ...AptosInfo,
      ...res.result.fungible_asset_metadata.map((asset: any) => ({
        assetType: asset.asset_type,
        decimals: asset.decimals,
        name: asset.name,
        symbol: asset.symbol,
      })),
    ];
  }
}

/**
 * Axios-based custom provider for the Aptos SDK.
 * @param requestOptions - The request options provided by the SDK.
 * @returns A Promise that resolves to the ClientResponse<Res>.
 */
async function axiosCustomClient<Req, Res>(
  requestOptions: ClientRequest<Req>,
): Promise<ClientResponse<Res>> {
  const { url, method, headers, body, params } = requestOptions;

  // Create an Axios instance with custom configurations if needed
  const axiosInstance: AxiosInstance = axios.create({
    timeout: 10000, // 10 seconds timeout
  });

  try {
    // Execute the HTTP request
    const response = await axiosInstance.request<Res>({
      url,
      method: method.toLowerCase() as 'get' | 'post',
      headers,
      params, // Add query parameters
      data: body, // Add request body
    });

    // Map Axios response to `ClientResponse<Res>` format
    return {
      status: response.status,
      headers: response.headers,
      data: response.data,
      config: response,
      statusText: response.statusText,
    };
  } catch (error: any) {
    // Handle Axios errors and re-throw as needed
    throw new Error(`Axios request failed: ${error}`);
  }
}

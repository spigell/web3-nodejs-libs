import axios, { AxiosError } from 'axios';
import { MiraAmm, PoolId, ReadonlyMiraAmm } from 'mira-dex-ts';
import * as retry from '../../../utils/retry.js';
import { FuelWallet } from '../../wallet/wallet.js';
import { futureDeadline } from './utils.js';
import { bn, Provider } from 'fuels';

// Configure axios instance with timeout
const axiosInstance = axios.create({
  timeout: 5000, // Set timeout to 5 seconds
});

// Define the response type for the `find_route` API
type FindRouteResponse = {
  path: PathStep[]; // Define `Routes` as per your API's route structure
  input_amount: string;
  output_amount: string;
};

// Define the structure of a single path step
type PathStep = [string, string, boolean];

// Define the response type for the `find_route` API
export type Route = {
  path: PathStep[];
  inputAmount: string;
  outputAmount: string;
};

// Define the structure of a Coin
type Coin = {
  id: string;
  symbol: string;
  decimals: number;
};

// MiraApiService class
export class MiraAPIService {
  private static readonly BASE_URL = 'https://prod.api.mira.ly';
  private static readonly INDEXER_URL =
    'https://49f988ac-a875-4740-a610-478af353216d.squids.live/mira-indexer/v/v1/graphql';
  private static readonly HEADERS = {
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
  };
  private static readonly INDEXER_HEADERS = {
    accept: 'application/graphql-response+json, application/json',
    'cache-control': 'no-cache',
    'content-type': 'application/json',
  };
  private miraAmmReadonly: ReadonlyMiraAmm;
  protected provider: Provider;

  constructor(provider: Provider) {
    this.provider = provider;
    this.miraAmmReadonly = new ReadonlyMiraAmm(provider);
  }

  /**
   * Fetch all coins with their decimals from the indexer.
   * @returns - Promise of an array containing coin details
   */
  async getCoinsWithDecimals(): Promise<Coin[]> {
    const query = `
      query CoinsQuery {
        pools {
          asset0 {
            id
            symbol
            decimals
          }
          asset1 {
            id
            symbol
            decimals
          }
        }
      }
    `;

    const response = await retry.simple(
      async () => {
        return await axiosInstance.post(
          MiraAPIService.INDEXER_URL,
          { query },
          {
            headers: MiraAPIService.INDEXER_HEADERS,
          },
        );
      },
      2,
      5000,
    );

    const assets: Coin[] = [];

    response.result.data.data.pools.forEach((pool: any) => {
      if (pool.asset0) {
        assets.push({
          id: pool.asset0.id,
          symbol: pool.asset0.symbol,
          decimals: pool.asset0.decimals,
        });
      }

      if (pool.asset1) {
        assets.push({
          id: pool.asset1.id,
          symbol: pool.asset1.symbol,
          decimals: pool.asset1.decimals,
        });
      }
    });

    // Remove duplicates based on `id`
    const uniqueAssets = assets.filter(
      (asset, index, self) =>
        index === self.findIndex((a) => a.id === asset.id),
    );

    return uniqueAssets;
  }

  /**
   * Function to make the HTTP request and retrieve the result
   * @param input - Input asset
   * @param output - Output asset
   * @param amount - Amount to trade
   * @param tradeType - Type of trade
   * @returns - Promise of an array of routes
   */
  async getRoute(
    input: string,
    output: string,
    amount: number,
    tradeType: string = 'ExactOutput',
  ): Promise<Route> {
    const data = {
      input,
      output,
      amount,
      trade_type: tradeType,
    };

    // Perform the HTTP request with retry and return only the routes array
    return retry
      .simple(
        async () => {
          const response = await axiosInstance
            .post<FindRouteResponse>(
              MiraAPIService.BASE_URL + '/find_route',
              data,
              {
                headers: MiraAPIService.HEADERS,
              },
            )
            .catch((e: AxiosError) => {
              // 404 means no routes
              if (e.status === 404) {
                return {
                  data: {
                    input_amount: '0',
                    output_amount: '0',
                    path: [],
                  },
                };
              }
              throw e;
            });

          return response.data;
        },
        3, // Number of retries
        10000, // Delay between retries in milliseconds
      )
      .then(async (r) => {
        return <Route>{
          inputAmount: r.result.input_amount,
          outputAmount: r.result.output_amount,
          path: r.result.path,
        };
      });
  }

  async preview(
    input: string,
    output: string,
    rawRoute: Route,
    amount: number,
    tradeType: string = 'ExactOutput',
  ): Promise<Route> {
    let previewed: Route = {
      path: rawRoute.path,
      inputAmount: rawRoute.inputAmount,
      outputAmount: rawRoute.outputAmount,
    };

    switch (tradeType) {
      case 'ExactOutput': {
        const preview = await this.miraAmmReadonly.previewSwapExactOutput(
          { bits: output },
          amount,
          toPools(rawRoute.path),
        );

        previewed.inputAmount = preview[1].toString();
        break;
      }
      case 'ExactInput': {
        const preview = await this.miraAmmReadonly.previewSwapExactInput(
          { bits: input },
          amount,
          toPools(rawRoute.path),
        );

        previewed.outputAmount = preview[1].toString();
        break;
      }
      default: {
        throw `Invalid tradeType ${tradeType}`;
      }
    }
    return previewed;
  }
}

export class MiraAPIFullService extends MiraAPIService {
  private wallet: FuelWallet;
  private miraAmm: MiraAmm;
  constructor(provider: Provider, wallet: FuelWallet) {
    super(provider);
    this.wallet = wallet;
    this.miraAmm = new MiraAmm(wallet.getWallet());
  }

  async swap(
    input: string,
    output: string,
    amount: number,
    path: PathStep[],
    kind: string = 'ExactOutput',
  ): Promise<string> {
    switch (kind) {
      case 'ExactOutput': {
        const txRequest = await this.miraAmm.swapExactOutput(
          amount,
          { bits: output },
          input,
          toPools(path),
          await futureDeadline(this.provider),
          { gasLimit: 1_200_000, maxFee: 9_999 },
        );
        // Hack
        txRequest.maxFee = bn(9_999);

        return await this.wallet.send(txRequest);
      }

      case 'ExactInput': {
        const txRequest = await this.miraAmm.swapExactInput(
          amount,
          { bits: output },
          // Min output in USDC token
          input,
          toPools(path),
          await futureDeadline(this.provider),
          { gasLimit: 1_200_000, maxFee: 9_999 },
        );
        // Hack
        txRequest.maxFee = bn(9_999);

        return await this.wallet.send(txRequest);
      }
    }

    throw Error('ERROR');
  }
}

function toPools(path: PathStep[]): PoolId[] {
  return path.map((step: PathStep): PoolId => {
    return [{ bits: `0x${step[0]}` }, { bits: `0x${step[1]}` }, step[2]];
  });
}

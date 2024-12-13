import axios, { AxiosError } from 'axios';
import { MiraAmm, PoolId } from 'mira-dex-ts';
import * as retry from '../../../utils/retry.js';
import { FuelWallet } from '../../wallet/wallet.js';
import { futureDeadline } from './utils.js';
import { Provider } from 'fuels';

// Define the response type for the `find_route` API
type FindRouteResponse = {
  path: PathStep[]; // Define `Routes` as per your API's route structure
  input_amount: string;
  output_amount: string;
};

// Define the structure of a single path step
type PathStep = [string, string, boolean];

// Define the response type for the `find_route` API
type BestRoute = {
  path: PathStep[];
  inputAmount: string;
  outputAmount: string;
};

// MiraApiService class
export class MiraAPIService {
  private static readonly BASE_URL = 'https://prod.api.mira.ly';
  private static readonly HEADERS = {
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
  };
  private provider: Provider;
  private wallet: FuelWallet;
  private miraAmm: MiraAmm;

  constructor(provider: Provider, wallet: FuelWallet) {
    this.provider = provider;
    this.wallet = wallet;
    this.miraAmm = new MiraAmm(wallet.getWallet());
  }

  /**
   * Function to make the HTTP request and retrieve the result
   * @param input - Input asset
   * @param output - Output asset
   * @param amount - Amount to trade
   * @param tradeType - Type of trade
   * @returns - Promise of an array of routes
   */
  async getBestRoute(
    input: string,
    output: string,
    amount: number,
    tradeType: string = 'ExactOutput',
  ): Promise<BestRoute> {
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
          const response = await axios
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
      .then((r) => {
        return <BestRoute>{
          inputAmount: r.result.input_amount,
          outputAmount: r.result.output_amount,
          path: r.result.path,
        };
      });
  }
  async swap(
    input: string,
    output: string,
    amount: number,
    path: PathStep[],
    kind: string = 'ExactOutput',
  ): Promise<string> {
    const pools: PoolId[] = path.map((step: PathStep): PoolId => {
      return [{ bits: `0x${step[0]}` }, { bits: `0x${step[1]}` }, step[2]];
    });

    switch (kind) {
      case 'ExactOutput': {
        const txRequest = await this.miraAmm.swapExactOutput(
          amount,
          { bits: output },
          input,
          pools,
          await futureDeadline(this.provider),
          { gasLimit: 999_999, maxFee: 999_99 },
        );
        return await this.wallet.send(txRequest);
      }

      case 'ExactInput': {
        const txRequest = await this.miraAmm.swapExactInput(
          amount,
          { bits: output },
          // Min output in USDC token
          input,
          pools,
          await futureDeadline(this.provider),
          { gasLimit: 999_999, maxFee: 999_99 },
        );
        return await this.wallet.send(txRequest);
      }
    }

    throw Error('ERROR');
  }
}

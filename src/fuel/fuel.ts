import { Provider } from 'fuels'; // Assuming a Fuel SDK is used.

export async function initProvider(): Promise<Provider> {
  return await Provider.create('https://mainnet.fuel.network/v1/graphql');
}

import {
  Wallet,
  Provider,
  WalletUnlocked,
  TransactionRequestLike,
} from 'fuels';
import * as retry from '../../utils/retry.js';

export class FuelWallet {
  private wallet: WalletUnlocked;

  /**
   * Constructs a new FuelWallet instance.
   * @param privateKey - The private key used to unlock the wallet.
   * @param provider - The provider for interacting with the blockchain.
   */
  constructor(privateKey: string, provider: Provider) {
    this.wallet = Wallet.fromPrivateKey(privateKey, provider);
  }

  /**
   * Retrieve the underlying WalletUnlocked instance.
   * @returns The unlocked wallet instance.
   */
  getWallet(): WalletUnlocked {
    return this.wallet;
  }

  /**
   * Get the balance of a specific token.
   * @param token - The token symbol (e.g., "FPT", "USDC").
   * @returns The balance of the token as a string.
   * @throws An error if the balance retrieval fails.
   */
  async getBalance(token: string): Promise<string> {
    return retry
      .simple(() =>
        this.wallet.getBalance(token).then((balance) => balance.toString()),
      )
      .then(({ result }) => result);
  }

  /**
   * Sends a transaction using the unlocked wallet.
   * @param request - The transaction request object containing the details of the transaction.
   * @param operation - A descriptive string for the operation being performed (for logging purposes).
   * @throws An error if the transaction sending fails.
   */
  async send(request: TransactionRequestLike): Promise<string> {
    return retry
      .simple(
        () =>
          this.wallet
            .sendTransaction(request, { estimateTxDependencies: true })
            .then((tx) => tx.waitForResult().then(() => tx.id)),
        2,
        20000,
      )
      .then((res) => {
        return res.result;
      });
  }
}

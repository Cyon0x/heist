import "server-only";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * Social / automatic wallet adapter.
 *
 * The brief names a "Saiku Developer Causal Wallet". Saiku (`docs.saiku.bi`) is a
 * hosted analytics and agent data plane — its published SDK surface contains no
 * wallet, signer, custody or account-abstraction product, so there is nothing to
 * integrate and inventing an SDK would violate the project's no-fake-integration
 * rule. The capability the brief actually describes (web2 login → automatic
 * wallet → play) is implemented here, behind an interface, so a third-party
 * provider can be dropped in without touching the rest of HEIST.
 */
export interface SocialWalletProvider {
  readonly id: string;
  readonly label: string;
  createWallet(): Promise<{ address: string; encryptedKey: string }>;
  exportKey(encryptedKey: string): Promise<string>;
}

export class EmbeddedArcWallet implements SocialWalletProvider {
  readonly id = "heist-embedded";
  readonly label = "Managed by HEIST";

  constructor(private seal: (plain: string) => string, private openKey: (sealed: string) => string) {}

  async createWallet() {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    return { address: account.address, encryptedKey: this.seal(privateKey) };
  }

  async exportKey(encryptedKey: string) {
    return this.openKey(encryptedKey);
  }
}

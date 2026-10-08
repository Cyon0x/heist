import type { Metadata } from "next";
import { Bullets, Clause, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy Policy" };

const UPDATED = "8 October 2026";

export default function PrivacyPage() {
  return (
    <LegalPage
      code="LEGAL / PRIVACY"
      title="Privacy Policy"
      updated={UPDATED}
      intro="This policy explains what HEIST collects, why, how long it is kept, and what you can do about it. HEIST is built on data minimisation: the game needs an identity and a wallet, and it asks for nothing else."
    >
      <Clause n="01" title="What we collect">
        <p>We collect only what the service needs to function:</p>
        <Bullets
          items={[
            "Account data — the username you choose, the method you signed in with (wallet, Google, or X), and the date the account was created.",
            "Wallet data — public wallet addresses linked to your account, the wallet type, and the chain. For a managed wallet, an encrypted signing key. We never hold the private key of an injected browser wallet.",
            "Authentication data — for social sign-in, the provider's account identifier and, where the provider supplies it, an email address and display name. We do not receive your password.",
            "Gameplay data — matches, results, stakes, payouts, and per-match statistics such as kills, hacks, and objective time.",
            "Transaction data — transaction hashes, amounts, and status for entries, payouts, and refunds.",
            "Technical data — the minimum required to serve a request and secure it, such as an IP address and user agent in server logs, and error reports when something fails.",
          ]}
        />
      </Clause>

      <Clause n="02" title="What we do not collect">
        <Bullets
          items={[
            "We do not collect your government identity, date of birth, address, or phone number.",
            "We do not read your wallet's other assets, your transaction history outside HEIST's contract, or your balances on other chains.",
            "We do not sell personal data, and we do not share it with advertising networks.",
            "We do not collect precise location data.",
          ]}
        />
      </Clause>

      <Clause n="03" title="Why we process it">
        <Bullets
          items={[
            "To operate your account and let you sign in.",
            "To run matches: place you in matchmaking, start a game, and determine a result.",
            "To settle stakes: verify deposits, attest the result, and pay the winner.",
            "To display your profile, match history, and the leaderboard.",
            "To prevent fraud and abuse — duplicate accounts, collusion, and settlement abuse.",
            "To diagnose faults and keep the service secure and available.",
          ]}
        />
      </Clause>

      <Clause n="04" title="How it is stored">
        <p>
          Account, wallet, match, and transaction records are stored in a managed Postgres database. Managed-wallet
          signing keys are additionally encrypted with AES-256-GCM using a key held outside the database, so a database
          dump alone is not enough to sign for a user. Session state is held in a signed, httpOnly cookie.
        </p>
      </Clause>

      <Clause n="05" title="Blockchain data is public and permanent">
        <p>
          <strong>Stakes and payouts are recorded on a public blockchain.</strong> Wallet addresses, transaction amounts,
          and transaction hashes are visible to anyone, permanently, and cannot be deleted, amended, or hidden by HEIST.
          If you stake USDC, that record exists independently of this policy and outside our control.
        </p>
        <p>
          Deleting your HEIST account removes our records. It does not, and cannot, remove anything already written to Arc
          Mainnet.
        </p>
      </Clause>

      <Clause n="06" title="Third-party services">
        <Bullets
          items={[
            "Arc network and its RPC provider — to read balances and submit settlement transactions.",
            "A managed Postgres provider — to host the database.",
            "Google and X — only if you choose to sign in with them. They receive the fact that you signed in to HEIST; they do not receive your gameplay data.",
            "Hosting infrastructure — to serve the application.",
          ]}
        />
        <p>Each of these providers processes data under its own privacy policy.</p>
      </Clause>

      <Clause n="07" title="Cookies">
        <p>
          HEIST uses two strictly necessary cookies: a signed session cookie that keeps you signed in, and a short-lived
          sign-in nonce that protects wallet sign-in against replay. Neither is used for advertising or tracking, and
          there is no third-party analytics cookie.
        </p>
      </Clause>

      <Clause n="08" title="Retention">
        <Bullets
          items={[
            "Account and profile data is kept while your account is open, and removed when you close it.",
            "Match and transaction records are kept while your account is open so your history and the leaderboard remain accurate.",
            "Server logs are short-lived and used for security and fault diagnosis.",
            "Onchain records are permanent and outside our control (see clause 05).",
          ]}
        />
      </Clause>

      <Clause n="09" title="Security">
        <p>
          Signed, httpOnly session cookies; server-side validation of every stake, result, and payout; parameterised
          database queries; encrypted managed-wallet keys; and escrow settlement enforced by a contract rather than by an
          operator. No system is perfect — if you believe you have found a security issue, report it privately rather
          than exploiting it.
        </p>
      </Clause>

      <Clause n="10" title="Your rights">
        <p>
          Depending on where you live, you may have the right to access, correct, export, or delete the personal data we
          hold about you, and to object to certain processing. You can see most of it directly in your profile and match
          history. To make a request, contact us through the channel published in the application; we will respond within
          the period required by applicable law.
        </p>
      </Clause>

      <Clause n="11" title="Changes and contact">
        <p>
          Material changes to this policy will be reflected in the &ldquo;last updated&rdquo; date above. Questions can be
          raised through the support channel published in the HEIST application.
        </p>
      </Clause>
    </LegalPage>
  );
}

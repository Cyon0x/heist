import type { Metadata } from "next";
import { Bullets, Clause, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms & Conditions" };

const UPDATED = "8 October 2026";

export default function TermsPage() {
  return (
    <LegalPage
      code="LEGAL / TERMS"
      title="Terms & Conditions"
      updated={UPDATED}
      intro="These terms govern your use of HEIST, a competitive 1v1 extraction game in which players may stake USDC on the outcome of a match. By playing a paid match you accept these terms. If you do not accept them, do not stake."
    >
      <Clause n="01" title="What HEIST is">
        <p>
          HEIST is a skill-based competitive game. Two players enter the same in-game facility, compete for a single
          objective (the Core), and attempt to extract with it. A match is decided by gameplay: successful extraction,
          or elimination of the opposing operative under the match rules. HEIST is not a game of chance, and no outcome
          is randomised.
        </p>
        <p>
          HEIST is software, not a financial product, security, investment, or collective investment scheme. Nothing in
          the game constitutes financial advice.
        </p>
      </Clause>

      <Clause n="02" title="Eligibility">
        <p>
          You may only stake USDC if you are of legal age in your jurisdiction and it is lawful for you to participate
          in skill-based competitive gaming with real-value stakes where you are located. You are responsible for
          determining that.
        </p>
        <Bullets
          items={[
            "You must not use HEIST if you are subject to sanctions, or located in a jurisdiction where staked competitive gaming is prohibited.",
            "You must operate your own wallet, or a managed wallet created for you, and you are responsible for the security of that access.",
            "One person, one account. Operating multiple accounts to gain an advantage is prohibited.",
          ]}
        />
      </Clause>

      <Clause n="03" title="Accounts and wallets">
        <p>
          A HEIST account is identified by a username and associated with one or more wallets. You are responsible for
          all activity conducted through your account. HEIST never asks for, stores, or transmits the private key of an
          injected browser wallet. For managed wallets created through Google or X sign-in, the signing key is encrypted
          at rest and used only to sign transactions you initiate.
        </p>
        <p>
          We may suspend or close an account that breaches these terms, that is used to defraud other players or the
          protocol, or that we are required to restrict by law.
        </p>
      </Clause>

      <Clause n="04" title="Staking rules">
        <p>
          Stakes are denominated in USDC on Arc Mainnet and are limited to a minimum of $1 and a maximum of $1,000 per
          player per match. Stake presets and custom amounts are validated on the server; the client cannot set a stake
          the server has not accepted.
        </p>
        <p>
          <strong>Stake never affects gameplay.</strong> A $1 entry and a $1,000 entry receive identical health, speed,
          weapons, abilities, and map access. Money changes the size of the prize pool and nothing else.
        </p>
        <p>
          Both entries are deposited into an onchain escrow contract before a match begins. The match does not start
          until both deposits are confirmed.
        </p>
      </Clause>

      <Clause n="05" title="Prize distribution">
        <p>
          Of the total prize pot, 90% is paid to the winner and 10% is retained by the protocol. Settlement is executed
          by the escrow contract on Arc Mainnet and is triggered by a signed attestation of the match result produced by
          the authoritative game server.
        </p>
        <Bullets
          items={[
            "A $100 versus $100 match produces a $200 pot: $180 to the winner and a $20 protocol fee.",
            "The fee is not discretionary and is enforced by the contract, not by an operator.",
            "Transaction (gas) costs are borne by the party submitting the transaction.",
          ]}
        />
      </Clause>

      <Clause n="06" title="Draws, cancellations and refunds">
        <Bullets
          items={[
            "If a match is cancelled before it starts, both entries are refunded in full.",
            "If a player disconnects, the match continues under the reconnect rules described below. Failing to reconnect may result in a loss of the match and of the stake.",
            "A genuine draw, as determined by the match rules, returns each player's entry in full.",
            "If a settlement transaction fails, the match enters a recoverable settlement state and is retried. You will never be shown a payout that has not been confirmed onchain.",
            "Refunds are issued to the wallet that paid the entry.",
          ]}
        />
      </Clause>

      <Clause n="07" title="Disconnections and interruptions">
        <p>
          HEIST is a real-time networked game. A match in progress is owned by the authoritative server, not by your
          browser. Closing your browser, refreshing the page, or losing your network connection does not end the match;
          your operative remains in the facility and you may reconnect.
        </p>
        <p>
          If a player leaves a match and does not return within the reconnect window, the match is resolved under the
          published match rules. Deliberately disconnecting to avoid a loss is treated as abandonment and forfeits the
          stake.
        </p>
      </Clause>

      <Clause n="08" title="Prohibited behaviour">
        <Bullets
          items={[
            "Cheating of any kind, including modified clients, memory inspection, automated input, and any software that reads or writes game state outside the official client.",
            "Exploiting a defect in the game, the server, or the escrow contract, including deliberately triggering unintended states.",
            "Collusion between accounts to transfer value, including pre-arranged outcomes in global matchmaking.",
            "Attacking the service, other players, or the settlement infrastructure: denial of service, credential stuffing, matchmaking abuse, or interference with the game server.",
            "Circumventing stake limits, jurisdiction restrictions, or account limits.",
          ]}
        />
        <p>
          We may void a match, withhold a payout pending investigation, and permanently close an account involved in
          prohibited behaviour.
        </p>
      </Clause>

      <Clause n="09" title="Blockchain and smart-contract risk">
        <p>
          Staked play depends on the Arc network and on a deployed escrow contract. You accept the following risks:
        </p>
        <Bullets
          items={[
            "Onchain transactions are irreversible once final. HEIST cannot reverse a settlement that has confirmed.",
            "Network congestion, RPC outages, or a chain-level incident may delay funding, settlement, or refunds.",
            "A smart contract may contain an undiscovered defect. HEIST tests the contract extensively before deployment but cannot guarantee the absence of bugs.",
            "The protocol fee recipient address is controlled by the protocol. It is set at deployment and published; it cannot redirect your winnings, which go to your wallet.",
          ]}
        />
      </Clause>

      <Clause n="10" title="Third-party services">
        <p>
          HEIST uses third-party infrastructure including an Arc RPC provider, a managed Postgres database, and optional
          Google or X sign-in. These services are operated by third parties under their own terms. We are not responsible
          for their availability or their acts.
        </p>
      </Clause>

      <Clause n="11" title="Availability and changes">
        <p>
          HEIST is provided on an &ldquo;as available&rdquo; basis. We may modify, suspend, or discontinue any part of the
          service, including the availability of staked play, at any time. We may update these terms; material changes
          will be reflected in the &ldquo;last updated&rdquo; date above, and continued use after a change constitutes
          acceptance.
        </p>
      </Clause>

      <Clause n="12" title="Limitation of liability">
        <p>
          To the greatest extent permitted by law, HEIST and its contributors are not liable for indirect, incidental,
          special, consequential, or punitive damages, or for any loss of stake, profit, or data arising out of your use
          of the service. Nothing in these terms excludes liability that cannot lawfully be excluded.
        </p>
        <p>
          <strong>You can lose the money you stake.</strong> Do not stake more than you are prepared to lose.
        </p>
      </Clause>

      <Clause n="13" title="Contact">
        <p>
          Questions about these terms, a match, a settlement, or an account action can be raised through the support
          channel published in the HEIST application. Include the match id (shown in your match history) — it is the
          fastest way for us to locate the record.
        </p>
      </Clause>
    </LegalPage>
  );
}

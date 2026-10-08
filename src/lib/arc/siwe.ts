/**
 * Shared sign-in message. Both the browser (which signs it) and the server
 * (which verifies it) build the *same* string from the *same* inputs, so the
 * message the user sees in their wallet is exactly the message we check.
 */
export function buildMessage(input: { domain: string; address: string; nonce: string; issuedAt: string }) {
  return [
    `${input.domain} wants you to sign in with your Arc account:`,
    input.address,
    "",
    "Sign in to HEIST. This signature proves you control this wallet and costs no gas.",
    "",
    `URI: https://${input.domain}`,
    "Version: 1",
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
  ].join("\n");
}

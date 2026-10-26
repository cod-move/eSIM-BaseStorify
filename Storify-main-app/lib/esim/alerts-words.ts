/** Supplier refusals that read like money trouble, in the words suppliers use (NTF-09). Pure. */
const BALANCE_WORDS = /insufficient|not enough|balance|funds|credit limit|余额/i;

export function looksLikeBalanceProblem(message: string | null | undefined): boolean {
  return Boolean(message && BALANCE_WORDS.test(message));
}

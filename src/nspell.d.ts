declare module "nspell" {
  interface NSpellInstance {
    correct(word: string): boolean;
    suggest(word: string): string[];
    add(word: string): void;
  }

  type NSpell = (dictionary: { aff: string; dic: string }) => NSpellInstance;

  const nspell: NSpell;
  export default nspell;
}

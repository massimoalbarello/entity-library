declare module "*.sql" {
  const text: string;
  export default text;
}

// The build generates file imports; type checks also work in a fresh checkout.
declare module "*assets.gen.ts" {
  export const assets: Map<string, string>;
  export const coreAsset: string;
}

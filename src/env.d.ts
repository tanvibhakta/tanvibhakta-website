// Plain `tsc` (pnpm typecheck) can't read .astro files; only Astro's own
// tooling can. This lets .ts modules such as components/mdx-components.ts
// import a component.
declare module "*.astro" {
  const Component: import("astro/runtime/server/index.js").AstroComponentFactory;
  export default Component;
}

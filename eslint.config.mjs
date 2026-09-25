import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "drizzle/**", "next-env.d.ts", "e2e/.results/**", "playwright-report/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Playwright hands a fixture its `use` callback (the second argument to
  // test.extend), which the React hook rules read as a hook called outside
  // a component. Nothing under e2e/ is React — these drive a browser — so
  // those rules have nothing to say about this directory.
  {
    files: ["e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
];

export default eslintConfig;

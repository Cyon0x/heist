import next from "eslint-config-next/core-web-vitals";

const config = [
  ...next,
  {
    ignores: [".next/**", "node_modules/**", "contracts/**", "server/**", "next-env.d.ts"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];

export default config;

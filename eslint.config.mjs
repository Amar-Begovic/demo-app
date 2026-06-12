import nextPlugin from "eslint-config-next";

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "out/**", ".kiro/**"],
  },
  ...nextPlugin,
];

export default eslintConfig;

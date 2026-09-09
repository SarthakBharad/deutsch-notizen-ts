import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // all generated: next-env.d.ts and notes.json are written by the toolchain
    ignores: [".next/**", "out/**", "node_modules/**", "src/content/**", "next-env.d.ts"],
  },
];

export default config;

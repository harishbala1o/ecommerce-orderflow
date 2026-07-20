import type { Config } from "tailwindcss";
import path from "node:path";

// Globs are anchored to this file's directory: Tailwind resolves relative
// content paths against the process CWD, which breaks when `next dev` is
// launched from outside the app directory (e.g. a monorepo tool or IDE).
const here = __dirname;

export default {
  content: [
    path.join(here, "app/**/*.{ts,tsx}"),
    path.join(here, "components/**/*.{ts,tsx}"),
    path.join(here, "lib/**/*.{ts,tsx}"),
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;

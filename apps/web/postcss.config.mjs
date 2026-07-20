import path from "node:path";
import { fileURLToPath } from "node:url";

// Pin the Tailwind config to this app: the PostCSS plugin otherwise resolves
// `tailwind.config.*` from the process CWD, which is wrong whenever the dev
// server is launched from outside the app directory (monorepo tools, IDEs).
const here = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: path.join(here, "tailwind.config.ts") },
    autoprefixer: {},
  },
};

import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/kit/vite";

/** @type {import("@sveltejs/kit").Config} */
const config = {
  compilerOptions: {
    enableSourcemap: true,
  },
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: "404.html",
    }),
    paths: {
      base: process.env.BASE_PATH || "",
    },
  },
};

export default config;

import { defineConfig, passthroughImageService } from "astro/config";

import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";
import node from "@astrojs/node";

import solidJs from "@astrojs/solid-js";

/**
 * Get the deployment adapter based on the deployment adapter environment variable.
 *
 * - `node` for development
 * - `cloudflare` for production
 */
const getDeploymentAdapter = () => {
  switch (process.env.DEPLOYMENT_ADAPTER) {
    case "cloudflare": {
      return cloudflare({
        imageService: "passthrough",
      });
    }
    default: {
      return node({
        mode: "standalone",
      });
    }
  }
};

// https://astro.build/config
export default defineConfig({
  trailingSlash: "never",
  build: {
    format: "file",
  },
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: getDeploymentAdapter(),
  image: {
    service: passthroughImageService(),
  },
  integrations: [solidJs()],
});

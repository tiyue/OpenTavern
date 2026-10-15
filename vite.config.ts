import { sites } from "@openai/sites-vite-plugin";
import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";

const { d1, r2 } = hostingConfig;
const placeholderDatabaseId = "00000000-0000-4000-8000-000000000000";

const localBindingConfig = {
  d1_databases: d1
    ? [{ binding: d1, database_name: "opentavern", database_id: placeholderDatabaseId }]
    : [],
  r2_buckets: r2
    ? [{ binding: r2, bucket_name: "opentavern-assets" }]
    : [],
};

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    publicDir: ".sites-public",
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        configPath: "./sites.wrangler.jsonc",
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});

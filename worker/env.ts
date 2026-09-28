import { loadEnvConfig } from "@next/env";

// Local development convenience only. Production uses injected process.env.
if (process.env.NODE_ENV !== "production") loadEnvConfig(process.cwd());

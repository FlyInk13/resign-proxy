import { ensureCA } from "./cert-manager.ts";
import { loadWhitelist } from "./whitelist.ts";
import { startProxy } from "./proxy.ts";

await ensureCA();
loadWhitelist(process.env.WHITELIST_PATH ?? "./data/whitelist.txt");
await startProxy();

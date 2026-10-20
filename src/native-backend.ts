import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { platformId } from "./platform.js";

const require = createRequire(import.meta.url);

interface NativeAddon {
  render_pdf(html: string, options: object): Uint8Array;
  engine_version(): string;
  job_new(html: string, options: object): number;
  job_pending_assets(id: number): string[];
  job_provide_asset(id: number, url: string, bytes: Uint8Array): void;
  job_finish(id: number): Uint8Array;
  job_free(id: number): void;
}

function addonPath(native?: string | URL): string {
  if (native instanceof URL) return fileURLToPath(native);
  if (typeof native === "string") return native;
  return fileURLToPath(new URL(`../native/blitz_pdf.${platformId()}.node`, import.meta.url));
}

/** Load the Node-API renderer. The addon stays unloaded until this is called. */
export function loadNativeEngine(native: string | URL | undefined) {
  const path = addonPath(native);
  if (!existsSync(path)) {
    throw new Error(`No native blitz-pdf addon for ${platformId()} at ${path}. Use the wasm backend, or build this platform with npm run build:native.`);
  }
  const addon = require(path) as NativeAddon;
  return {
    render: (html: string, options: object) => addon.render_pdf(html, options),
    start: (html: string, options: object) => {
      let id = addon.job_new(html, options);
      return {
        pending: () => addon.job_pending_assets(id),
        provide: (url: string, data: Uint8Array) => { addon.job_provide_asset(id, url, data); },
        finish: () => addon.job_finish(id),
        free: () => { if (id) { addon.job_free(id); id = 0; } },
      };
    },
    version: () => addon.engine_version(),
  };
}

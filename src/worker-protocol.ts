import type { RenderOptions } from "./render.js";

export type HostMessage =
  | { type: "render"; module: WebAssembly.Module; html: string; options: RenderOptions; external: boolean }
  | { type: "assets"; data: Uint8Array[] };

export type WorkerMessage =
  | { type: "assets"; urls: string[] }
  | { type: "done"; pdf: Uint8Array }
  | { type: "error"; error: unknown };

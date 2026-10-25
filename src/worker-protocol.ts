import type { RenderOptions } from "./render.js";

export type HostMessage =
  | { type: "render"; id: number; module: WebAssembly.Module; html: string; options: RenderOptions; external: boolean }
  | { type: "assets"; id: number; data: Uint8Array[] };

export type WorkerMessage =
  | { type: "assets"; id: number; urls: string[] }
  | { type: "done"; id: number; pdf: Uint8Array }
  | { type: "error"; id: number; error: unknown };

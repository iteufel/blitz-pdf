import { serve } from "./worker-runtime.js";

interface DedicatedWorkerScope {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

const scope = globalThis as unknown as DedicatedWorkerScope;
serve({
  post: (message, transfer) => scope.postMessage(message, transfer),
  onMessage: handler => { scope.onmessage = event => handler(event.data); },
});

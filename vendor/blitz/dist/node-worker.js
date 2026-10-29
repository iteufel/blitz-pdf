import { parentPort } from "node:worker_threads";
import { serve } from "./worker-runtime.js";
const port = parentPort;
if (!port)
    throw new Error("blitz-pdf node-worker must run in a worker thread");
serve({
    post: (message, transfer) => port.postMessage(message, transfer),
    onMessage: handler => { port.on("message", handler); },
});
//# sourceMappingURL=node-worker.js.map
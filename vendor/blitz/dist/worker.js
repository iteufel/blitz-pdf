import { serve } from "./worker-runtime.js";
const scope = globalThis;
serve({
    post: (message, transfer) => scope.postMessage(message, transfer),
    onMessage: handler => { scope.onmessage = event => handler(event.data); },
});
//# sourceMappingURL=worker.js.map
import { renderPdf } from "../dist/browser.js";

self.onmessage = async () => {
  try {
    const requests = [];
    const bytes = await renderPdf('<link rel="stylesheet" href="main.css"><p class="box">Worker-rendered selectable text</p><p class="second">Second page</p>', {
      baseUrl: new URL("fixtures/dynamic/", import.meta.url).href,
      pageNumbers: { template: "Seite {page} von {pages}" },
      metadata: { author: "Worker app", xmp: [{
        name: "Test metadata", prefix: "test", namespaceUri: "urn:example:test:1.0#",
        properties: [{ name: "Runtime", value: "Worker", description: "Generating runtime" }],
      }] },
      attachments: [{ name: "worker.bin", data: new Uint8Array([0, 128, 255]) }, { name: "data.xml", data: "<data/>" }],
      assets: async url => {
        requests.push(url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`);
        return response.arrayBuffer();
      },
    });
    if (new TextDecoder().decode(bytes.subarray(0,5)) !== "%PDF-") throw new Error("Invalid worker PDF");
    if (requests.length !== 3 || new Set(requests).size !== 3) throw new Error("Worker asset loading failed");
    self.postMessage({ ok:true, bytes:bytes.length, assets:requests, pdf:bytes }, [bytes.buffer]);
  } catch (error) { self.postMessage({ok:false, error:String(error)}); }
};

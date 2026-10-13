import { renderPdf } from "../dist/browser.js";

self.onmessage = async () => {
  try {
    const requests = [];
    const bytes = await renderPdf('<link rel="stylesheet" href="main.css"><p class="box">Worker-rendered selectable text</p><p class="second">Second page</p>', {
      baseUrl: new URL("fixtures/dynamic/", import.meta.url).href,
      pageNumbers: { template: "Seite {page} von {pages}" },
      assets: async url => {
        requests.push(url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`);
        return response.arrayBuffer();
      },
    });
    if (new TextDecoder().decode(bytes.subarray(0,5)) !== "%PDF-") throw new Error("Invalid worker PDF");
    if (requests.length !== 3 || new Set(requests).size !== 3) throw new Error("Worker asset loading failed");
    self.postMessage({ ok:true, bytes:bytes.length, assets:requests });
  } catch (error) { self.postMessage({ok:false, error:String(error)}); }
};

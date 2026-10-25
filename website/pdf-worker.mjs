import { renderPdf } from "./vendor/blitz/dist/browser.js";
import { validateHtml } from "./converter.mjs";

self.onmessage = async ({ data }) => {
  try {
    validateHtml(data.html);
    const bytes = await renderPdf(data.html, {
      ...data.options,
      maxPages: 100,
      assets: () => {
        throw new Error("External resources are disabled. Inline your CSS and embed images or fonts as data URLs.");
      },
    });
    self.postMessage({ ok: true, bytes }, [bytes.buffer]);
  } catch (error) {
    const messages = [];
    for (let cause = error; cause && messages.length < 4; cause = cause.cause) {
      messages.push(cause.message || String(cause));
    }
    self.postMessage({ ok: false, error: messages.join(" ") });
  }
};

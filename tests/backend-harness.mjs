import { Buffer } from "node:buffer";

const [entry, mode, extra] = process.argv.slice(2);
const api = await import(entry);

if (mode === "render") {
  if (extra) await api.init({ backend: extra });
  const pdf = await api.renderPdf("<p>Choice</p>");
  console.log(`version=${await api.getEngineVersion()}`);
  console.log(`pdf=${Buffer.from(pdf.subarray(0, 5)).toString()}`);
} else if (mode === "document") {
  await api.init({ backend: extra });
  const pdf = await api.renderPdf("<h1>Native</h1><p>café office</p>", {
    format: "A4",
    margin: "12mm",
    metadata: { title: "Backend", author: "Ada", creationDate: "2026-10-13T12:34:56Z" },
    attachments: [{ name: "note.txt", data: "hello", mimeType: "text/plain", relationship: "Data" }],
  });
  console.log(`version=${await api.getEngineVersion()}`);
  console.log(`pdf=${Buffer.from(pdf).toString("base64")}`);
} else if (mode === "switch") {
  await api.init({ backend: "wasm" });
  try {
    await api.init({ backend: "native" });
    console.log("accepted");
  } catch (error) {
    console.log(`error=${error.name}:${error.message}`);
  }
} else if (mode === "reject") {
  try {
    await api.init(JSON.parse(extra));
    console.log("accepted");
  } catch (error) {
    console.log(`error=${error.name}:${error.message}`);
  }
} else {
  throw new Error(`Unknown harness mode: ${mode}`);
}

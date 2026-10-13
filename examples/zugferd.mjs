import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { renderPdf } from "blitz-pdf";

// Use HTML and validated CII XML for the same invoice. This example packages
// supplied invoice data; it does not generate or validate business information.
const [htmlPath, xmlPath, profile, outputPath = "output/pdf/zugferd.pdf"] = process.argv.slice(2);
if (!htmlPath || !xmlPath || !profile) {
  console.error('Usage: node examples/zugferd.mjs invoice.html invoice.xml "EN 16931" [output.pdf]');
  process.exit(1);
}
if (!["MINIMUM", "BASIC WL", "BASIC", "EN 16931", "EXTENDED"].includes(profile)) {
  throw new Error("Choose MINIMUM, BASIC WL, BASIC, EN 16931, or EXTENDED for this example");
}
const [html, xml] = await Promise.all([readFile(htmlPath, "utf8"), readFile(xmlPath)]);
const bytes = await renderPdf(html, {
  format: "A4", margin: "15mm",
  baseUrl: pathToFileURL(resolve(htmlPath)).href,
  assets: async url => readFile(new URL(url)),
  attachments: [{
    name: "factur-x.xml", data: xml, mimeType: "text/xml", description: "Invoice XML",
    relationship: ["MINIMUM", "BASIC WL"].includes(profile) ? "Data" : "Alternative",
  }],
  metadata: {
    title: "Invoice", creator: "blitz-pdf invoice example", language: "de-DE",
    xmp: [{
      name: "Factur-X PDFA Extension Schema", prefix: "fx",
      namespaceUri: "urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#",
      properties: [
        { name: "DocumentFileName", value: "factur-x.xml", description: "Embedded invoice filename" },
        { name: "DocumentType", value: "INVOICE", description: "Document type" },
        { name: "Version", value: "1.0", description: "Schema version" },
        { name: "ConformanceLevel", value: profile, description: "Invoice profile" },
      ],
    }],
  },
});
await mkdir(dirname(resolve(outputPath)), { recursive: true });
await writeFile(outputPath, bytes);
console.log(`Created ${outputPath} (${bytes.length} bytes, PDF/A-3u with ${profile} Factur-X packaging).`);

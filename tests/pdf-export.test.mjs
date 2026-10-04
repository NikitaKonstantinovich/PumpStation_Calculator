import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { jpegToPdf } = await loadTs(new URL("../app/pdf-export.ts", import.meta.url));

test("PDF export preserves binary image data, page dimensions and valid cross-reference offsets", async () => {
  // Include non-ASCII and zero bytes: treating image data as text corrupts offsets.
  const jpeg = new Uint8Array([0xff, 0xd8, 0, 0x80, 0xa0, 0xe2, 0x82, 0xac, 0xff, 0xd9]);
  const pdf = jpegToPdf(jpeg, 1500, 1000);
  assert.equal(pdf.type, "application/pdf");
  const bytes = Buffer.from(await pdf.arrayBuffer()), text = bytes.toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4\n"));
  assert.match(text, /\/MediaBox \[0 0 900 600\]/);
  assert.match(text, /\/Width 1500 \/Height 1000/);
  const imageStart = text.indexOf("stream\n", text.indexOf("4 0 obj")) + "stream\n".length;
  assert.deepEqual(bytes.subarray(imageStart, imageStart + jpeg.length), Buffer.from(jpeg));
  assert.match(text, new RegExp(`/Filter /DCTDecode /Length ${jpeg.length} >>`));
  const xref = Number(text.match(/startxref\n(\d+)\n%%EOF$/)[1]);
  assert.equal(text.slice(xref, xref + 4), "xref");
  const entries = text.slice(xref).split("\n").slice(3, 8);
  assert.equal(entries.length, 5);
  for (let index = 0; index < entries.length; index++) {
    assert.match(entries[index], /^\d{10} 00000 n $/);
    assert.ok(text.slice(Number(entries[index].slice(0, 10))).startsWith(`${index + 1} 0 obj\n`));
  }
});

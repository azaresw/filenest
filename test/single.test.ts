import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { filenest, memoryStorage } from "../src/index.js";

function buildMultipartRequest(fieldName: string, filename: string, content: string) {
  const boundary = "----filenestTestBoundary";
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
    `Content-Type: text/plain\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="title"\r\n\r\n` +
    `hello\r\n` +
    `--${boundary}--\r\n`;

  const stream = new PassThrough() as any;
  stream.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
  };
  stream.end(Buffer.from(body));
  return stream;
}

describe("filenest.single", () => {
  it("parses a single file and text fields", async () => {
    const upload = filenest({ storage: memoryStorage() }).single("avatar");
    const req = buildMultipartRequest("avatar", "avatar.txt", "file-bytes");

    await new Promise<void>((resolve, reject) => {
      upload(req, {} as any, (err) => (err ? reject(err) : resolve()));
    });

    expect(req.file?.originalName).toBe("avatar.txt");
    expect(req.file?.buffer?.toString()).toBe("file-bytes");
    expect(req.body?.title).toBe("hello");
  });
});

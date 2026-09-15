import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { filenest, memoryStorage } from "../src/index.js";

const BOUNDARY = "----filenestChunkTest";

function buildBody(fieldName: string, filename: string, content: string): Buffer {
  return Buffer.from(
    `--${BOUNDARY}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: text/plain\r\n\r\n` +
      `${content}\r\n` +
      `--${BOUNDARY}\r\n` +
      `Content-Disposition: form-data; name="title"\r\n\r\n` +
      `hello\r\n` +
      `--${BOUNDARY}--\r\n`
  );
}

/** Feeds the request body to the middleware one byte at a time to stress the
 * internal buffering/boundary-search logic (the riskiest part of a hand-rolled
 * multipart parser — the boundary string can land split across chunks). */
function feedByteByByte(body: Buffer) {
  const stream = new PassThrough() as any;
  stream.headers = { "content-type": `multipart/form-data; boundary=${BOUNDARY}` };

  let i = 0;
  const interval = setInterval(() => {
    if (i >= body.length) {
      clearInterval(interval);
      stream.end();
      return;
    }
    stream.write(body.subarray(i, i + 1));
    i++;
  }, 0);

  return stream;
}

describe("MultipartParser boundary handling", () => {
  it("reassembles correctly when the body arrives one byte at a time", async () => {
    const upload = filenest({ storage: memoryStorage() }).single("avatar");
    const body = buildBody("avatar", "avatar.txt", "file-bytes-that-are-long-enough-to-span-several-chunks");
    const req = feedByteByByte(body);

    await new Promise<void>((resolve, reject) => {
      upload(req, {} as any, (err) => (err ? reject(err) : resolve()));
    });

    expect(req.file?.originalName).toBe("avatar.txt");
    expect(req.file?.buffer?.toString()).toBe("file-bytes-that-are-long-enough-to-span-several-chunks");
    expect(req.body?.title).toBe("hello");
  });

  it("enforces fileSize limits and marks the result truncated", async () => {
    const upload = filenest({ storage: memoryStorage(), limits: { fileSize: 4 } }).single("avatar");
    const body = buildBody("avatar", "avatar.txt", "this-is-way-too-long");
    const req = feedByteByByte(body);

    await new Promise<void>((resolve) => {
      upload(req, {} as any, (err) => {
        expect((err as any)?.code).toBe("LIMIT_FILE_SIZE");
        resolve();
      });
    });
  });

  it("rejects files on unexpected fields", async () => {
    const upload = filenest({ storage: memoryStorage() }).single("wrongField");
    const body = buildBody("avatar", "avatar.txt", "content");
    const req = feedByteByByte(body);

    await new Promise<void>((resolve) => {
      upload(req, {} as any, (err) => {
        expect((err as any)?.code).toBe("LIMIT_UNEXPECTED_FILE");
        resolve();
      });
    });
  });
});

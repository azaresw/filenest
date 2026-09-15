# filenest

A modern, TypeScript-native `multipart/form-data` middleware for Node.js — a maintained, actively-patched successor to `multer`.

```ts
import express from "express";
import { filenest, memoryStorage } from "filenest";

const upload = filenest({
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const app = express();

app.post("/avatar", upload.single("avatar"), (req, res) => {
  // req.file — { originalName, mimeType, size, buffer, ... }
  // req.body — parsed text fields
  res.sendStatus(200);
});
```

## Why not multer?

`multer` is stable but effectively unmaintained — infrequent releases, open security advisories, and a callback-first API from a pre-async/await era. filenest keeps the same mental model (storage engines, `.single()` / `.array()` / `.fields()` / `.any()` / `.none()`) but is:

- Written in TypeScript, ships its own types
- **Zero runtime dependencies** — the multipart parser is built directly on Node's `stream`/`buffer` built-ins, not on a third-party parser with its own transitive supply chain
- Built on Promises internally (no callback pyramids)
- Actively patched — dependencies checked daily, security audit run weekly (see `.github/workflows`)
- Explicit, typed errors (`FilenestError` with a `code`) instead of stringly-typed messages

## API

- `filenest(options)` — `{ storage, limits, fileFilter }`
- `.single(fieldName)` → `req.file`
- `.array(fieldName, maxCount?)` → `req.files: FilenestFile[]`
- `.fields([{ name, maxCount }])` → `req.files: Record<string, FilenestFile[]>`
- `.any()` → `req.files: FilenestFile[]` (accepts any field name)
- `.none()` → text fields only, rejects any file part

## Storage engines

- `memoryStorage()` — buffers files in memory (`file.buffer`)
- `diskStorage({ destination?, filename? })` — streams straight to disk (`file.path`)

## Status

Early release (v0.1.0). Core parsing, both storage engines, and the five middleware modes are implemented and tested, including chunk-boundary stress tests against the hand-rolled parser. It has not had the years of real-world traffic multer has, so treat it as early — file issues at the repo above if something breaks.

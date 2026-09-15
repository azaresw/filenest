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

Early scaffold — core parsing, both storage engines, and the five middleware modes are implemented and tested. Not yet published to npm.

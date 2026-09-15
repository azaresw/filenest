export interface ContentDispositionParams {
  name?: string;
  filename?: string;
}

/**
 * Minimal parser for the `Content-Disposition: form-data; name="..."; filename="..."`
 * header used by multipart/form-data parts. Handles quoted values (with backslash
 * escapes) and the RFC 5987 `filename*` extended form some clients send.
 */
export function parseContentDisposition(value: string): ContentDispositionParams {
  const result: ContentDispositionParams = {};
  const parts = value.split(";").slice(1);

  for (const raw of parts) {
    const eq = raw.indexOf("=");
    if (eq === -1) continue;

    const key = raw.slice(0, eq).trim().toLowerCase();
    let val = raw.slice(eq + 1).trim();

    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/\\(.)/g, "$1");
    }

    if (key === "name") {
      result.name = val;
    } else if (key === "filename") {
      result.filename = val;
    } else if (key === "filename*") {
      const match = /^[^']*''(.*)$/.exec(val);
      if (match?.[1]) {
        try {
          result.filename = decodeURIComponent(match[1]);
        } catch {
          // keep whatever filename we already have rather than throwing
        }
      }
    }
  }

  return result;
}

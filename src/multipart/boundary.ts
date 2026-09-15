/** Extracts the boundary token from a `Content-Type: multipart/form-data; boundary=...` header. */
export function parseBoundary(contentType: string): string | null {
  const match = /boundary=(?:"([^"]*)"|([^;]+))/i.exec(contentType);
  if (!match) return null;
  const boundary = match[1] ?? match[2];
  return boundary ? boundary.trim() : null;
}

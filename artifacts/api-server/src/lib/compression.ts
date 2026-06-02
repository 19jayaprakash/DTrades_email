import zlib from "node:zlib";

/**
 * Compresses any text content (base64 string or HTML text) using Gzip.
 * Returns the compressed content as a base64 string prefixed with "gzip:".
 */
export function compressContent(content: string): string {
  if (!content) return content;
  // If already compressed, return as-is
  if (content.startsWith("gzip:")) return content;

  // Convert text (Base64 or HTML) to a UTF-8 binary buffer
  const buffer = Buffer.from(content, "utf-8");
  // Compress the buffer
  const compressed = zlib.gzipSync(buffer);
  // Convert the compressed buffer to a Base64 string and prefix it
  return `gzip:${compressed.toString("base64")}`;
}

/**
 * Decompresses any Gzip-compressed content prefixed with "gzip:".
 * If the content is not compressed (i.e. doesn't start with "gzip:"),
 * it is returned as-is, ensuring 100% backward compatibility.
 */
export function decompressContent(content: string | null): string | null {
  if (!content) return content;
  if (!content.startsWith("gzip:")) return content;

  try {
    // Strip the "gzip:" prefix
    const base64Data = content.slice(5);
    // Convert Base64 string to compressed binary buffer
    const compressed = Buffer.from(base64Data, "base64");
    // Decompress the buffer
    const decompressed = zlib.gunzipSync(compressed);
    // Convert back to original UTF-8 text string (Base64 or HTML)
    return decompressed.toString("utf-8");
  } catch (err: any) {
    console.error("Failed to decompress content, returning raw:", err.message);
    return content;
  }
}

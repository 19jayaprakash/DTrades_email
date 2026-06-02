import zlib from "node:zlib";

/**
 * Compresses any text content (base64 string or HTML text) using Gzip.
 * Returns the compressed content as a base64 string prefixed with "gzip:".
 */
export function compressContent(content: string): string {
  if (!content) return content;
  if (content.startsWith("gzip:")) return content;

  const buffer = Buffer.from(content, "utf-8");
  const compressed = zlib.gzipSync(buffer);
  return `gzip:${compressed.toString("base64")}`;
}

/**
 * Decompresses any Gzip-compressed content prefixed with "gzip:".
 * If the content is not compressed, it is returned as-is.
 */
export function decompressContent(content: string | null): string | null {
  if (!content) return content;
  if (!content.startsWith("gzip:")) return content;

  try {
    const base64Data = content.slice(5);
    const compressed = Buffer.from(base64Data, "base64");
    const decompressed = zlib.gunzipSync(compressed);
    return decompressed.toString("utf-8");
  } catch (err: any) {
    console.error("Failed to decompress content:", err.message);
    return content;
  }
}

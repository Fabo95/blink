// Byte/base64 helpers. WebCrypto (TS 7 lib) requires ArrayBuffer-backed views,
// so the produced arrays pin the buffer type.

export function encodeUtf8(text: string): Uint8Array<ArrayBuffer> {
  const src = new TextEncoder().encode(text);
  const out = new Uint8Array(src.byteLength);
  out.set(src);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

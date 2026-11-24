/**
 * Keeps a dossier's Private Backstory out of plain sight in the page source.
 *
 * This is NOT security. It only means the text cannot be stumbled upon by
 * searching the page, selecting the redaction bars, or glancing at the source.
 * Anyone determined can undo it, exactly as anyone can tick the confirmation
 * box on a dossier that is not theirs. The host has chosen a trust-based
 * approach; nothing here should ever be described as access protection.
 *
 * Used at build time (Astro) to obscure the text and in the browser to restore it.
 */
const keyFor = (key: string) => new TextEncoder().encode(`the-velvet-cellar/${key}/1925`);

const mix = (bytes: Uint8Array, key: Uint8Array) => bytes.map((byte, i) => byte ^ key[i % key.length] ^ (i * 31 + 7) % 256);

export function seal(text: string, key: string): string {
  const bytes = mix(new TextEncoder().encode(text), keyFor(key));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 4096) binary += String.fromCharCode(...bytes.subarray(i, i + 4096));
  return btoa(binary);
}

export function unseal(data: string, key: string): string {
  const binary = atob(data);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(mix(bytes, keyFor(key)));
}

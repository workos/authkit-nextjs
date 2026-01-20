/**
 * CookieChunker - Framework-agnostic cookie chunking utility
 *
 * Handles splitting large cookie values across multiple cookies when they exceed
 * the browser's 4KB limit. Maintains backwards compatibility by detecting and
 * reading both chunked and non-chunked cookies.
 */

export interface ChunkedCookie {
  name: string;
  value: string;
  clear?: boolean;
}

const MAX_COOKIE_SIZE = 4096; // Maximum size of a cookie in bytes
const CHUNK_OVERHEAD = 160; // Overhead for chunking metadata
const CHUNK_SIZE = MAX_COOKIE_SIZE - CHUNK_OVERHEAD;
const CHUNK_PATTERN = /\.(\d+)$/;

/**
 * Reads a cookie value that may be chunked across multiple cookies.
 *
 * @param cookieName - The base name of the cookie
 * @param cookies - Record of all available cookies
 * @returns The reassembled cookie value, or null if not found
 *
 * @example
 * // Reading a non-chunked cookie
 * readValue('session', { session: 'abc123' }) // returns 'abc123'
 *
 * @example
 * // Reading a chunked cookie
 * readValue('session', {
 *   'session.0': 'part1',
 *   'session.1': 'part2'
 * }) // returns 'part1part2'
 */
export function readValue(cookieName: string, cookies: Record<string, string>): string | null {
  const chunks: Array<[number, string]> = [];
  let hasChunks = false;

  for (const [name, value] of Object.entries(cookies)) {
    if (name === cookieName) {
      // If we have a direct cookie but no chunks, use it
      if (!(`${cookieName}.0` in cookies)) {
        return value || null;
      }
    } else if (name.startsWith(`${cookieName}.`)) {
      const [, match] = name.match(CHUNK_PATTERN) ?? [];
      if (match) {
        hasChunks = true;
        chunks.push([parseInt(match, 10), value]);
      }
    }
  }

  if (!hasChunks) {
    return cookies[cookieName] || null;
  }

  return chunks
    .sort(([a], [b]) => a - b)
    .map(([, value]) => value)
    .join('');
}

/**
 * Chunks a cookie value into multiple cookies if it exceeds the size limit.
 *
 * @param cookieName - The base name of the cookie
 * @param value - The cookie value to chunk
 * @param existingCookies - Record of existing cookies (used for cleanup)
 * @returns Array of cookies to set, including cleanup instructions
 *
 * @example
 * // Small value - returns single cookie
 * chunkValue('session', 'small', {})
 * // [{ name: 'session', value: 'small' }]
 *
 * @example
 * // Large value - returns multiple chunks
 * chunkValue('session', 'x'.repeat(5000), {})
 * // [
 * //   { name: 'session.0', value: 'xxx...' },
 * //   { name: 'session.1', value: 'xxx...' }
 * // ]
 *
 * @example
 * // Cleanup old chunks when value shrinks
 * chunkValue('session', 'small', { 'session.0': 'old', 'session.1': 'old' })
 * // [
 * //   { name: 'session', value: 'small' },
 * //   { name: 'session.0', value: '', clear: true },
 * //   { name: 'session.1', value: '', clear: true }
 * // ]
 */
export function chunkValue(
  cookieName: string,
  value: string,
  existingCookies: Record<string, string> = {},
): Array<ChunkedCookie> {
  const cookies: Array<ChunkedCookie> = [];

  const existingChunks = Object.keys(existingCookies).filter(
    (name) => name.startsWith(`${cookieName}.`) && name.match(CHUNK_PATTERN),
  );

  // If value fits in a single cookie, use non-chunked format
  if (value.length <= CHUNK_SIZE) {
    cookies.push({ name: cookieName, value });

    // Clean up any existing chunks
    existingChunks.forEach((name) => {
      cookies.push({ name, value: '', clear: true });
    });

    return cookies;
  }

  // Value exceeds limit - chunk it
  const chunkCount = Math.ceil(value.length / CHUNK_SIZE);

  for (let i = 0; i < chunkCount; ++i) {
    const start = i * CHUNK_SIZE;
    const end = start + CHUNK_SIZE;
    cookies.push({
      name: `${cookieName}.${i}`,
      value: value.slice(start, end),
    });
  }

  // Clean up any extra chunks from previous larger sessions
  existingChunks.forEach((name) => {
    const [, match] = name.match(CHUNK_PATTERN) || [];
    if (match && parseInt(match, 10) >= chunkCount) {
      cookies.push({ name, value: '', clear: true });
    }
  });

  return cookies;
}

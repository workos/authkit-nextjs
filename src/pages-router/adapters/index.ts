import { NextJSPagesAdapter } from './NextJSPagesAdapter.js';

export { NextJSPagesAdapter };

/**
 * Factory function that creates a configured NextJS Pages adapter
 */
export function createPagesAdapter(cookieName?: string) {
  return new NextJSPagesAdapter(cookieName);
}
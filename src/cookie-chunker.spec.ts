import { readValue, chunkValue } from './cookie-chunker.js';

describe('cookie-chunker', () => {
  describe('readValue', () => {
    it('should return null when cookie does not exist', () => {
      const result = readValue('session', {});
      expect(result).toBeNull();
    });

    it('should read a non-chunked cookie', () => {
      const cookies = { session: 'simple-value' };
      const result = readValue('session', cookies);
      expect(result).toBe('simple-value');
    });

    it('should read chunked cookies and reassemble them in order', () => {
      const cookies = {
        'session.0': 'first',
        'session.1': 'second',
        'session.2': 'third',
      };
      const result = readValue('session', cookies);
      expect(result).toBe('firstsecondthird');
    });

    it('should handle chunks in any order', () => {
      const cookies = {
        'session.2': 'third',
        'session.0': 'first',
        'session.1': 'second',
      };
      const result = readValue('session', cookies);
      expect(result).toBe('firstsecondthird');
    });

    it('should prefer chunked cookies over non-chunked when both exist', () => {
      const cookies = {
        'session': 'old-value',
        'session.0': 'new',
        'session.1': 'value',
      };
      const result = readValue('session', cookies);
      expect(result).toBe('newvalue');
    });

    it('should ignore cookies with similar names but different patterns', () => {
      const cookies = {
        'session.0': 'chunk1',
        'session.1': 'chunk2',
        'session-backup': 'backup',
        'session.foo': 'invalid',
        'other-session.0': 'other',
      };
      const result = readValue('session', cookies);
      expect(result).toBe('chunk1chunk2');
    });

    it('should handle empty string values', () => {
      const cookies = {
        'session.0': '',
        'session.1': 'value',
      };
      const result = readValue('session', cookies);
      expect(result).toBe('value');
    });
  });

  describe('chunkValue', () => {
    it('should return single cookie for small values', () => {
      const result = chunkValue('session', 'small-value', {});
      expect(result).toEqual([{ name: 'session', value: 'small-value' }]);
    });

    it('should return single cookie for values at the threshold', () => {
      // CHUNK_SIZE = 4096 - 160 = 3936
      const value = 'x'.repeat(3936);
      const result = chunkValue('session', value, {});
      expect(result).toEqual([{ name: 'session', value }]);
    });

    it('should chunk large values into multiple cookies', () => {
      // Create a value that requires 2 chunks
      const value = 'x'.repeat(5000);
      const result = chunkValue('session', value, {});

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'session.0',
        value: expect.any(String),
      });
      expect(result[1]).toEqual({
        name: 'session.1',
        value: expect.any(String),
      });

      // Verify the chunks can be reassembled
      const reassembled = result.map((c) => c.value).join('');
      expect(reassembled).toBe(value);
    });

    it('should clean up old chunks when value shrinks', () => {
      const existingCookies = {
        'session.0': 'old',
        'session.1': 'old',
        'session.2': 'old',
      };
      const result = chunkValue('session', 'small', existingCookies);

      expect(result).toEqual([
        { name: 'session', value: 'small' },
        { name: 'session.0', value: '', clear: true },
        { name: 'session.1', value: '', clear: true },
        { name: 'session.2', value: '', clear: true },
      ]);
    });

    it('should clean up extra chunks when chunk count decreases', () => {
      // Start with 3 chunks, reduce to 2
      const existingCookies = {
        'session.0': 'old1',
        'session.1': 'old2',
        'session.2': 'old3',
      };
      // Value that requires exactly 2 chunks
      const value = 'x'.repeat(4500);
      const result = chunkValue('session', value, existingCookies);

      // Should have 2 new chunks + 1 cleanup
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('session.0');
      expect(result[1].name).toBe('session.1');
      expect(result[2]).toEqual({
        name: 'session.2',
        value: '',
        clear: true,
      });
    });

    it('should not include cleanup cookies when no existing chunks', () => {
      const value = 'x'.repeat(5000);
      const result = chunkValue('session', value, {});

      // Should only have the 2 chunks, no cleanup cookies
      expect(result).toHaveLength(2);
      expect(result.every((c) => !c.clear)).toBe(true);
    });

    it('should ignore non-chunk cookies in existing cookies', () => {
      const existingCookies = {
        'session': 'old-single',
        'session-backup': 'backup',
        'other.0': 'other',
      };
      const result = chunkValue('session', 'new', existingCookies);

      // Should only return the new single cookie, no cleanup
      expect(result).toEqual([{ name: 'session', value: 'new' }]);
    });

    it('should handle transition from non-chunked to chunked', () => {
      const existingCookies = {
        session: 'old-small-value',
      };
      const largeValue = 'x'.repeat(5000);
      const result = chunkValue('session', largeValue, existingCookies);

      // Should have 2 chunks, no cleanup needed since no existing chunks
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('session.0');
      expect(result[1].name).toBe('session.1');
    });

    it('should handle transition from chunked to non-chunked', () => {
      const existingCookies = {
        'session.0': 'chunk1',
        'session.1': 'chunk2',
      };
      const result = chunkValue('session', 'small', existingCookies);

      expect(result).toEqual([
        { name: 'session', value: 'small' },
        { name: 'session.0', value: '', clear: true },
        { name: 'session.1', value: '', clear: true },
      ]);
    });
  });

  describe('integration scenarios', () => {
    it('should handle round-trip for non-chunked cookie', () => {
      const original = 'my-session-value';
      const chunks = chunkValue('session', original, {});

      // Convert to cookie record
      const cookies: Record<string, string> = {};
      chunks.forEach((chunk) => {
        if (!chunk.clear) {
          cookies[chunk.name] = chunk.value;
        }
      });

      const result = readValue('session', cookies);
      expect(result).toBe(original);
    });

    it('should handle round-trip for chunked cookie', () => {
      const original = 'x'.repeat(8000);
      const chunks = chunkValue('session', original, {});

      // Convert to cookie record
      const cookies: Record<string, string> = {};
      chunks.forEach((chunk) => {
        if (!chunk.clear) {
          cookies[chunk.name] = chunk.value;
        }
      });

      const result = readValue('session', cookies);
      expect(result).toBe(original);
    });

    it('should handle growing session size', () => {
      // Start with small session
      let existingCookies: Record<string, string> = {};
      let chunks = chunkValue('session', 'small', existingCookies);
      chunks.forEach((chunk) => {
        if (!chunk.clear) {
          existingCookies[chunk.name] = chunk.value;
        } else {
          delete existingCookies[chunk.name];
        }
      });

      // Grow to medium
      chunks = chunkValue('session', 'x'.repeat(4500), existingCookies);
      expect(chunks.length).toBeGreaterThan(1);

      // Apply changes
      existingCookies = {};
      chunks.forEach((chunk) => {
        if (!chunk.clear) {
          existingCookies[chunk.name] = chunk.value;
        }
      });

      // Verify can read back
      const result = readValue('session', existingCookies);
      expect(result).toBe('x'.repeat(4500));
    });
  });
});

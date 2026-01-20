import { readValue, chunkValue } from './cookie-chunker.js';

describe('cookie-chunker', () => {
  describe('readValue', () => {
    it('returns null when cookie does not exist', () => {
      expect(readValue('session', {})).toBeNull();
    });

    it('reads a non-chunked cookie', () => {
      const cookies = { session: 'simple-value' };
      expect(readValue('session', cookies)).toBe('simple-value');
    });

    it('reassembles chunked cookies in order', () => {
      const cookies = {
        'session.0': 'first',
        'session.1': 'second',
        'session.2': 'third',
      };
      expect(readValue('session', cookies)).toBe('firstsecondthird');
    });

    it('handles chunks in any order', () => {
      const cookies = {
        'session.2': 'third',
        'session.0': 'first',
        'session.1': 'second',
      };
      expect(readValue('session', cookies)).toBe('firstsecondthird');
    });

    it('prefers chunked cookies when both chunked and non-chunked exist', () => {
      const cookies = {
        'session': 'old-value',
        'session.0': 'new',
        'session.1': 'value',
      };
      expect(readValue('session', cookies)).toBe('newvalue');
    });

    it('ignores cookies with similar names but different patterns', () => {
      const cookies = {
        'session.0': 'chunk1',
        'session.1': 'chunk2',
        'session-backup': 'backup',
        'session.foo': 'invalid',
        'other-session.0': 'other',
      };
      expect(readValue('session', cookies)).toBe('chunk1chunk2');
    });

    it('handles empty string values', () => {
      const cookies = {
        'session.0': '',
        'session.1': 'value',
      };
      expect(readValue('session', cookies)).toBe('value');
    });
  });

  describe('chunkValue', () => {
    it('returns single cookie for small values', () => {
      const result = chunkValue('session', 'small-value', {});
      expect(result).toEqual([{ name: 'session', value: 'small-value' }]);
    });

    it('returns single cookie for values at the threshold', () => {
      // CHUNK_SIZE = 4096 - 160 = 3936
      const value = 'x'.repeat(3936);
      const result = chunkValue('session', value, {});
      expect(result).toEqual([{ name: 'session', value }]);
    });

    it('chunks large values into multiple cookies', () => {
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

      const reassembled = result.map((c) => c.value).join('');
      expect(reassembled).toBe(value);
    });

    it('cleans up old chunks when value shrinks', () => {
      const existing = {
        'session.0': 'old',
        'session.1': 'old',
        'session.2': 'old',
      };
      const result = chunkValue('session', 'small', existing);

      expect(result).toEqual([
        { name: 'session', value: 'small' },
        { name: 'session.0', value: '', clear: true },
        { name: 'session.1', value: '', clear: true },
        { name: 'session.2', value: '', clear: true },
      ]);
    });

    it('cleans up extra chunks when chunk count decreases', () => {
      const existing = {
        'session.0': 'old1',
        'session.1': 'old2',
        'session.2': 'old3',
      };
      const value = 'x'.repeat(4500); // Requires 2 chunks
      const result = chunkValue('session', value, existing);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('session.0');
      expect(result[1].name).toBe('session.1');
      expect(result[2]).toEqual({
        name: 'session.2',
        value: '',
        clear: true,
      });
    });

    it('does not include cleanup cookies when no existing chunks', () => {
      const value = 'x'.repeat(5000);
      const result = chunkValue('session', value, {});

      expect(result).toHaveLength(2);
      expect(result.every((c) => !c.clear)).toBe(true);
    });

    it('ignores non-chunk cookies in existing cookies', () => {
      const existing = {
        'session': 'old-single',
        'session-backup': 'backup',
        'other.0': 'other',
      };
      const result = chunkValue('session', 'new', existing);
      expect(result).toEqual([{ name: 'session', value: 'new' }]);
    });

    it('handles transition from non-chunked to chunked', () => {
      const existing = {
        session: 'old-small-value',
      };
      const largeValue = 'x'.repeat(5000);
      const result = chunkValue('session', largeValue, existing);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('session.0');
      expect(result[1].name).toBe('session.1');
    });

    it('handles transition from chunked to non-chunked', () => {
      const existing = {
        'session.0': 'chunk1',
        'session.1': 'chunk2',
      };
      const result = chunkValue('session', 'small', existing);

      expect(result).toEqual([
        { name: 'session', value: 'small' },
        { name: 'session.0', value: '', clear: true },
        { name: 'session.1', value: '', clear: true },
      ]);
    });
  });

  describe('integration scenarios', () => {
    it('handles round-trip for non-chunked cookie', () => {
      const original = 'my-session-value';
      const chunks = chunkValue('session', original, {});

      const cookies: Record<string, string> = {};
      chunks.forEach((chunk) => {
        if (!chunk.clear) {
          cookies[chunk.name] = chunk.value;
        }
      });

      expect(readValue('session', cookies)).toBe(original);
    });

    it('handles round-trip for chunked cookie', () => {
      const original = 'x'.repeat(8000);
      const chunks = chunkValue('session', original, {});

      const cookies: Record<string, string> = {};
      chunks.forEach((chunk) => {
        if (!chunk.clear) {
          cookies[chunk.name] = chunk.value;
        }
      });

      expect(readValue('session', cookies)).toBe(original);
    });

    it('handles growing session size', () => {
      let cookies: Record<string, string> = {};
      let chunks = chunkValue('session', 'small', cookies);
      chunks.forEach((chunk) => {
        if (!chunk.clear) {
          cookies[chunk.name] = chunk.value;
        } else {
          delete cookies[chunk.name];
        }
      });

      chunks = chunkValue('session', 'x'.repeat(4500), cookies);
      expect(chunks.length).toBeGreaterThan(1);

      cookies = {};
      chunks.forEach((chunk) => {
        if (!chunk.clear) {
          cookies[chunk.name] = chunk.value;
        }
      });

      expect(readValue('session', cookies)).toBe('x'.repeat(4500));
    });
  });
});

import { jest } from '@jest/globals';

// Mock child_process
const mockSpawn = jest.fn();
jest.unstable_mockModule('child_process', () => ({
  spawn: mockSpawn,
}));

// Mock fs
const mockFs = {
  mkdtempSync: jest.fn(() => '/tmp/whisper-123'),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  rmSync: jest.fn(),
  existsSync: jest.fn(() => true),
};
jest.unstable_mockModule('fs', () => ({
  default: mockFs,
  ...mockFs,
}));

// Mock os
jest.unstable_mockModule('os', () => ({
  default: { tmpdir: () => '/tmp', homedir: () => '/Users/test' },
  tmpdir: () => '/tmp',
  homedir: () => '/Users/test',
}));

// Import after mocking
const { isWhisperAvailable, transcribe, transcribeBuffer, _resetCache } = await import('../src/whisper.js');

describe('Whisper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetCache();
  });

  describe('isWhisperAvailable', () => {
    it('returns true when whisper command exists', async () => {
      const mockProc = {
        on: jest.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
      };
      mockSpawn.mockReturnValue(mockProc);

      const result = await isWhisperAvailable();
      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith('whisper', ['--help'], expect.any(Object));
    });

    it('returns false when whisper command fails', async () => {
      const mockProc = {
        on: jest.fn((event, cb) => {
          if (event === 'error') cb(new Error('not found'));
        }),
      };
      mockSpawn.mockReturnValue(mockProc);

      const result = await isWhisperAvailable();
      expect(result).toBe(false);
    });

    it('returns false when whisper exits with non-zero', async () => {
      const mockProc = {
        on: jest.fn((event, cb) => {
          if (event === 'close') cb(1);
        }),
      };
      mockSpawn.mockReturnValue(mockProc);

      const result = await isWhisperAvailable();
      expect(result).toBe(false);
    });
  });

  describe('transcribe', () => {
    it('transcribes audio file successfully', async () => {
      mockFs.readFileSync.mockReturnValue('Hello, this is a test.');

      const mockProc = {
        stderr: { on: jest.fn() },
        on: jest.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
      };
      mockSpawn.mockReturnValue(mockProc);

      const result = await transcribe('/path/to/audio.ogg');

      expect(result).toBe('Hello, this is a test.');
      expect(mockSpawn).toHaveBeenCalledWith('whisper', expect.arrayContaining([
        '/path/to/audio.ogg',
        '--model', 'base',
        '--output_format', 'txt',
      ]), expect.any(Object));
    });

    it('uses specified model and language', async () => {
      mockFs.readFileSync.mockReturnValue('Hola mundo');

      const mockProc = {
        stderr: { on: jest.fn() },
        on: jest.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
      };
      mockSpawn.mockReturnValue(mockProc);

      await transcribe('/path/to/audio.ogg', { model: 'large', language: 'es' });

      expect(mockSpawn).toHaveBeenCalledWith('whisper', expect.arrayContaining([
        '--model', 'large',
        '--language', 'es',
      ]), expect.any(Object));
    });

    it('rejects when whisper is not found', async () => {
      const mockProc = {
        stderr: { on: jest.fn() },
        on: jest.fn((event, cb) => {
          if (event === 'error') cb(new Error('ENOENT'));
        }),
      };
      mockSpawn.mockReturnValue(mockProc);

      await expect(transcribe('/path/to/audio.ogg'))
        .rejects.toThrow('Whisper not found');
    });

    it('rejects when whisper fails', async () => {
      // First call succeeds (for findWhisperPath), second call fails (transcription)
      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: findWhisperPath check - succeed
          return {
            on: jest.fn((event, cb) => {
              if (event === 'close') cb(0);
            }),
          };
        }
        // Second call: actual transcription - fail
        return {
          stderr: {
            on: jest.fn((event, cb) => {
              if (event === 'data') cb(Buffer.from('Error: something went wrong'));
            }),
          },
          on: jest.fn((event, cb) => {
            if (event === 'close') cb(1);
          }),
        };
      });

      await expect(transcribe('/path/to/audio.ogg'))
        .rejects.toThrow('Whisper failed');
    });
  });

  describe('transcribeBuffer', () => {
    it('saves buffer to temp file and transcribes', async () => {
      const buffer = Buffer.from('fake audio data');
      mockFs.readFileSync.mockReturnValue('Transcribed text');

      const mockProc = {
        stderr: { on: jest.fn() },
        on: jest.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
      };
      mockSpawn.mockReturnValue(mockProc);

      const result = await transcribeBuffer(buffer, 'ogg');

      expect(result).toBe('Transcribed text');
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/tmp/whisper-123/audio.ogg',
        buffer
      );
    });

    it('cleans up temp files on error', async () => {
      const buffer = Buffer.from('fake audio data');

      const mockProc = {
        stderr: { on: jest.fn() },
        on: jest.fn((event, cb) => {
          if (event === 'error') cb(new Error('failed'));
        }),
      };
      mockSpawn.mockReturnValue(mockProc);

      await expect(transcribeBuffer(buffer, 'ogg')).rejects.toThrow();
      expect(mockFs.rmSync).toHaveBeenCalled();
    });
  });
});

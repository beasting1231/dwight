import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Common locations for whisper binary
const WHISPER_PATHS = [
  'whisper', // In PATH
  path.join(os.homedir(), 'Library/Python/3.9/bin/whisper'), // macOS pip user install
  path.join(os.homedir(), 'Library/Python/3.10/bin/whisper'),
  path.join(os.homedir(), 'Library/Python/3.11/bin/whisper'),
  path.join(os.homedir(), 'Library/Python/3.12/bin/whisper'),
  path.join(os.homedir(), '.local/bin/whisper'), // Linux pip user install
  '/usr/local/bin/whisper',
  '/opt/homebrew/bin/whisper',
];

let cachedWhisperPath = null;

// For testing: reset the cache
export function _resetCache() {
  cachedWhisperPath = null;
}

/**
 * Find the whisper binary path
 */
async function findWhisperPath() {
  if (cachedWhisperPath) return cachedWhisperPath;

  for (const whisperPath of WHISPER_PATHS) {
    const available = await new Promise((resolve) => {
      const proc = spawn(whisperPath, ['--help'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    });

    if (available) {
      cachedWhisperPath = whisperPath;
      return whisperPath;
    }
  }
  return null;
}

/**
 * Check if whisper CLI is available
 */
export async function isWhisperAvailable() {
  const whisperPath = await findWhisperPath();
  return whisperPath !== null;
}

/**
 * Transcribe an audio file using local Whisper
 * @param {string} audioPath - Path to the audio file
 * @param {object} options - Transcription options
 * @returns {Promise<string>} - Transcribed text
 */
export async function transcribe(audioPath, options = {}) {
  const {
    model = 'base',
    language = null, // Auto-detect by default
  } = options;

  // Create temp directory for output
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-'));
  const outputBase = path.join(tempDir, 'output');

  const whisperPath = await findWhisperPath();
  if (!whisperPath) {
    cleanup(tempDir);
    throw new Error('Whisper not found. Install with: pip install openai-whisper');
  }

  return new Promise((resolve, reject) => {
    const args = [
      audioPath,
      '--model', model,
      '--output_format', 'txt',
      '--output_dir', tempDir,
    ];

    // Add language if specified
    if (language) {
      args.push('--language', language);
    }

    const proc = spawn(whisperPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let stdout = '';
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (error) => {
      cleanup(tempDir);
      reject(new Error(`Whisper not found. Install with: pip install openai-whisper`));
    });

    proc.on('close', (code) => {
      console.log(`  Whisper exit code: ${code}`);
      if (stderr) console.log(`  Whisper stderr: ${stderr.slice(0, 500)}`);

      if (code !== 0) {
        cleanup(tempDir);
        reject(new Error(`Whisper failed (code ${code}): ${stderr}`));
        return;
      }

      // List files in output directory for debugging
      const files = fs.readdirSync(tempDir);
      console.log(`  Whisper output dir contents: ${files.join(', ')}`);

      // Read the output file
      const audioBasename = path.basename(audioPath, path.extname(audioPath));
      const outputPath = path.join(tempDir, `${audioBasename}.txt`);
      console.log(`  Looking for: ${outputPath}`);

      try {
        const text = fs.readFileSync(outputPath, 'utf-8').trim();
        cleanup(tempDir);
        resolve(text);
      } catch (readError) {
        // Try to find any .txt file
        const txtFile = files.find(f => f.endsWith('.txt'));
        if (txtFile) {
          try {
            const text = fs.readFileSync(path.join(tempDir, txtFile), 'utf-8').trim();
            cleanup(tempDir);
            resolve(text);
            return;
          } catch (e) {
            // Fall through to error
          }
        }
        cleanup(tempDir);
        reject(new Error(`Failed to read transcription output. Files: ${files.join(', ')}`));
      }
    });
  });
}

/**
 * Download and transcribe audio from a URL
 * @param {Buffer} audioBuffer - Audio data
 * @param {string} format - Audio format (ogg, mp3, etc.)
 * @returns {Promise<string>} - Transcribed text
 */
export async function transcribeBuffer(audioBuffer, format = 'ogg') {
  // Save buffer to temp file
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-audio-'));
  const tempFile = path.join(tempDir, `audio.${format}`);

  try {
    fs.writeFileSync(tempFile, audioBuffer);
    const text = await transcribe(tempFile);
    cleanup(tempDir);
    return text;
  } catch (error) {
    cleanup(tempDir);
    throw error;
  }
}

/**
 * Cleanup temporary directory
 */
function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

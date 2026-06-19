import { writeFile } from 'node:fs/promises';
import { CliError } from './errors.js';
import { pathExists } from './guards.js';

export interface FileOutputMeta {
  path: string;
  byteLength: number;
}

export async function writeBytesToPath(bytes: Uint8Array, outputPath: string, force = false): Promise<FileOutputMeta> {
  const exists = await pathExists(outputPath);
  if (exists && !force) {
    throw new CliError('OUTPUT_EXISTS', `Output path already exists: ${outputPath}`, {
      path: outputPath,
      hint: 'Use --force to overwrite.',
    });
  }

  try {
    await writeFile(outputPath, bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError('FILE_WRITE_ERROR', `Failed to write output file: ${outputPath}`, {
      message,
    });
  }

  return {
    path: outputPath,
    byteLength: bytes.byteLength,
  };
}

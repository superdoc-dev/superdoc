import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { createR2Client, BASELINES_PREFIX } from './r2.js';

const TESTS_DIR = path.resolve(import.meta.dirname, '../tests');
const VERSION_FILE = path.resolve(import.meta.dirname, '../.baselines-version');

function findSnapshots(dir: string): string[] {
  const files: string[] = [];

  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.png') && full.includes('-snapshots')) {
        files.push(full);
      }
    }
  }

  walk(dir);
  return files;
}

async function main() {
  const { client, bucket } = createR2Client();
  const snapshots = findSnapshots(TESTS_DIR);

  if (snapshots.length === 0) {
    console.log('No snapshots found. Run tests with --update-snapshots first.');
    process.exit(1);
  }

  console.log(`Uploading ${snapshots.length} snapshots to R2...`);

  const hash = crypto.createHash('sha256');

  for (const file of snapshots) {
    const relative = path.relative(TESTS_DIR, file);
    const key = `${BASELINES_PREFIX}/${relative}`;
    const body = fs.readFileSync(file);

    hash.update(relative);
    hash.update(body);

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'image/png',
      }),
    );

    console.log(`  ✓ ${relative}`);
  }

  const version = hash.digest('hex').slice(0, 16);
  fs.writeFileSync(VERSION_FILE, version);
  console.log(`\nDone. Version: ${version}`);

  client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

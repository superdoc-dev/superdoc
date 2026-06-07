/**
 * Test script for IT-1142: verify edits persist after close in collab-only mode.
 *
 * Usage:
 *   1. Start y-websocket server: HOST=0.0.0.0 PORT=8082 npx y-websocket
 *   2. Run this script: npx tsx test-close-sync.ts
 */

import { SuperDocClient } from '@superdoc-dev/sdk';

const COLLAB_URL = 'ws://localhost:8082';
const ROOM_ID = `test-close-sync-${Date.now()}`;

async function main() {
  console.log('=== Test: Close waits for Y.js sync ===\n');
  console.log(`Room: ${ROOM_ID}`);
  console.log(`Collab URL: ${COLLAB_URL}\n`);

  // --- Session 1: Make an edit and close immediately ---
  console.log('1. Opening first session...');
  const client1 = new SuperDocClient({
    startupTimeoutMs: 15_000,
    // Use local dev CLI for testing
    env: { SUPERDOC_CLI_BIN: './dev-cli.sh' },
  });
  await client1.connect();

  const doc1 = await client1.open({
    collaboration: {
      providerType: 'y-websocket',
      url: COLLAB_URL,
      documentId: ROOM_ID,
      syncTimeoutMs: 10_000,
    },
  });
  console.log(`   Session opened: ${doc1.sessionId}`);

  // Make an edit using create.paragraph
  const testText = `Edit made at ${new Date().toISOString()}`;
  console.log(`2. Creating paragraph with text: "${testText}"`);

  try {
    const result = await doc1.create.paragraph({
      text: testText,
      at: { kind: 'documentStart' },
    });
    console.log(`   Create result: success=${result?.receipt?.success}`);
  } catch (e: any) {
    console.log(`   Create failed: ${e.message}`);
  }

  // Test close() WITHOUT discard - this used to throw "no source path"
  console.log('3. Closing with close() (no discard flag)...');
  try {
    await doc1.close(); // Should work now for collab-only sessions
    console.log('   ✅ close() succeeded!');
  } catch (e: any) {
    console.log(`   ❌ close() failed: ${e.message}`);
  }
  await client1.dispose();
  console.log('   Client disposed\n');

  // --- Session 2: Reconnect and verify ---
  console.log('4. Opening second session to verify...');
  const client2 = new SuperDocClient({ startupTimeoutMs: 15_000 });
  await client2.connect();

  const doc2 = await client2.open({
    collaboration: {
      providerType: 'y-websocket',
      url: COLLAB_URL,
      documentId: ROOM_ID,
      syncTimeoutMs: 10_000,
    },
  });
  console.log(`   Session opened: ${doc2.sessionId}`);

  // Read the content
  console.log('5. Reading document content...');
  try {
    const text = await doc2.getText({});
    console.log(`   Text length: ${text?.length ?? 0}`);
    console.log(`   Text preview: "${text?.substring(0, 100) ?? '(empty)'}"`);

    if (text?.includes(testText)) {
      console.log('\n✅ SUCCESS: Edit persisted after close!');
    } else {
      console.log('\n❌ FAILURE: Edit was lost!');
      console.log(`   Expected to find: "${testText}"`);
    }
  } catch (e: any) {
    console.log(`   Read failed: ${e.message}`);
  }

  // Cleanup
  await doc2.close({ discard: true }).catch(() => {});
  await client2.dispose();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});

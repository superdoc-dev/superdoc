import Link from 'next/link';
import { AgentPrompts } from '@/components/agent-prompts';
import { CopyCommand } from '@/components/copy-command';
import { DocumentPreview } from '@/components/embeds/document-preview';
import styles from './docs-home.module.css';

export function DocsHome() {
  return (
    <main className={styles.home}>
      <header className={styles.hero}>
        <h1>
          <span className={styles.heroWordmark}>SuperDoc</span> <span>v2 is here</span>
        </h1>
        <p>Add DOCX editing into your product and agentic workflows</p>
        <div className={styles.heroActions}>
          <CopyCommand command='npm install superdoc' />
        </div>
        {/* A v1 reader arrives here from an archived link or an old bookmark and
            needs a different first page than someone starting fresh. */}
        <p className={styles.heroUpgrade}>
          Upgrading from v1?{' '}
          <Link href='/editor/migrate-from-v1/overview'>
            Read the migration guide <span aria-hidden='true'>→</span>
          </Link>
        </p>
      </header>

      <div className={styles.content}>
        <section className={styles.workflows} aria-labelledby='choose-workflow'>
          <h2 id='choose-workflow'>Get started</h2>

          <div className={styles.pathGrid}>
            <Link className={styles.pathCard} href='/editor/quickstart'>
              <div className={styles.cardCopy}>
                <h3>Web-based DOCX editor</h3>
                <p>Open, edit, review, and export DOCX files in your app.</p>
                <span className={styles.cardAction}>
                  Editor quickstart <span aria-hidden='true'>→</span>
                </span>
              </div>
              <div className={styles.editorPreview} aria-hidden='true'>
                <DocumentPreview
                  label='DOCX editor showing a selection and tracked date change'
                  selection
                  trackedChanges
                />
              </div>
            </Link>

            <Link className={styles.pathCard} href='/agents/overview'>
              <div className={styles.cardCopy}>
                <h3>Server-side DOCX automation</h3>
                <p>Inspect and change documents from SDKs, CLIs, pipelines, or agents.</p>
                <span className={styles.cardAction}>
                  Agents &amp; automation <span aria-hidden='true'>→</span>
                </span>
              </div>
              <div className={styles.codePreview} aria-hidden='true'>
                <div className={styles.codeChrome}>
                  <span />
                  <span />
                  <span />
                  <b>accept-changes.mjs</b>
                </div>
                <pre>
                  <code>{`const doc = await client.open({
  doc: './contract.docx',
});

const receipt = await doc.trackChanges.decide({
  decision: 'accept',
  target: { kind: 'all' },
});`}</code>
                </pre>
              </div>
            </Link>
          </div>
        </section>

        <AgentPrompts />
      </div>
    </main>
  );
}

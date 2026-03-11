/**
 * CLI examples registry for doc-backed commands.
 *
 * Maps document-api operation IDs to realistic CLI invocations.
 * These examples are wired into `describe command` output, wrapper `--help`,
 * and introspection JSON.
 *
 * Only doc-backed commands need entries here — CLI-only commands
 * (open, save, close, etc.) define their examples in commands.ts.
 *
 * IMPORTANT: Every example must parse cleanly against the operation's
 * CLI option specs. The smoke test in command-examples.test.ts guards this.
 * When adding examples, use only canonical CLI command tokens and flags
 * (not helper-command spellings).
 */

/**
 * Realistic CLI examples keyed by document-api operation ID.
 *
 * Each entry is an array of complete `superdoc` invocations that
 * exercise the command's most common usage patterns.
 */
export const DOC_COMMAND_EXAMPLES: Readonly<Record<string, readonly string[]>> = {
  // ── Core read/locate ────────────────────────────────────────────────
  find: [
    'superdoc find --type text --pattern "quarterly revenue" --limit 5',
    'superdoc find --select-json \'{"type":"node","nodeType":"heading"}\'',
  ],
  'query.match': [
    'superdoc query match --select-json \'{"type":"text","pattern":"Introduction"}\' --require exactlyOne',
    'superdoc query match --select-json \'{"type":"node","nodeType":"paragraph"}\' --require any --limit 3',
  ],
  getNode: ['superdoc get-node --address-json \'{"kind":"block","nodeType":"paragraph","nodeId":"abc123"}\''],
  getNodeById: ['superdoc get-node-by-id --id abc123'],
  getText: ['superdoc get-text'],
  info: ['superdoc info'],

  // ── Core mutations ──────────────────────────────────────────────────
  insert: [
    'superdoc insert --value "Hello, world!"',
    'superdoc insert --block-id abc123 --value "Appended text"',
    'superdoc insert --type markdown --value "## New Section"',
  ],
  replace: [
    'superdoc replace --block-id abc123 --start 0 --end 5 --text "Updated"',
    'superdoc replace --block-id abc123 --start 0 --end 5 --text "Updated" --dry-run',
    'superdoc replace --block-id abc123 --start 0 --end 5 --text "Updated" --expected-revision 3',
  ],
  delete: [
    'superdoc delete --block-id abc123 --start 0 --end 10',
    'superdoc delete --block-id abc123 --start 0 --end 10 --dry-run',
  ],
  'blocks.list': [
    'superdoc blocks list',
    'superdoc blocks list --limit 20',
    'superdoc blocks list --offset 10 --limit 10',
    'superdoc blocks list --node-types-json \'["paragraph","heading"]\'',
  ],
  'blocks.delete': [
    'superdoc blocks delete --node-type paragraph --node-id abc123',
    'superdoc blocks delete --node-type paragraph --node-id abc123 --dry-run',
  ],
  'blocks.deleteRange': [
    'superdoc blocks delete-range --start-json \'{"kind":"block","nodeType":"paragraph","nodeId":"abc123"}\' --end-json \'{"kind":"block","nodeType":"paragraph","nodeId":"def456"}\'',
    'superdoc blocks delete-range --start-json \'{"kind":"block","nodeType":"paragraph","nodeId":"abc123"}\' --end-json \'{"kind":"block","nodeType":"paragraph","nodeId":"def456"}\' --dry-run',
  ],

  // ── Create ──────────────────────────────────────────────────────────
  'create.paragraph': [
    'superdoc create paragraph --text "A new paragraph."',
    'superdoc create paragraph --at document-end --text "Last paragraph."',
    'superdoc create paragraph --at-json \'{"kind":"after","target":{"kind":"block","nodeType":"paragraph","nodeId":"abc123"}}\'',
  ],
  'create.heading': [
    'superdoc create heading --input-json \'{"level":2,"text":"Section Title"}\'',
    'superdoc create heading --input-json \'{"level":1,"text":"Document Title","at":{"kind":"documentStart"}}\'',
  ],
  'create.image': ['superdoc create image --src "https://example.com/photo.png" --alt "Photo caption"'],

  // ── Lists ───────────────────────────────────────────────────────────
  'lists.list': ['superdoc lists list', 'superdoc lists list --kind ordered'],
  'lists.get': ['superdoc lists get --address-json \'{"kind":"block","nodeType":"listItem","nodeId":"li1"}\''],
  'lists.insert': [
    'superdoc lists insert --node-id abc123 --position after --text "New list item"',
    'superdoc lists insert --node-id abc123 --position before',
  ],
  'lists.indent': ['superdoc lists indent --node-id abc123'],
  'lists.outdent': ['superdoc lists outdent --node-id abc123'],
  'lists.create': [
    'superdoc lists create --input-json \'{"mode":"empty","at":{"kind":"block","nodeType":"paragraph","nodeId":"abc123"},"kind":"ordered"}\'',
  ],
  'lists.attach': [
    'superdoc lists attach --input-json \'{"target":{"kind":"block","nodeType":"listItem","nodeId":"abc123"},"direction":"above"}\'',
  ],
  'lists.detach': ['superdoc lists detach --node-id abc123'],
  'lists.join': [
    'superdoc lists join --input-json \'{"target":{"kind":"block","nodeType":"listItem","nodeId":"abc123"},"direction":"above"}\'',
  ],
  'lists.separate': ['superdoc lists separate --node-id abc123'],
  'lists.setLevel': ['superdoc lists set-level --node-id abc123 --level 2'],
  'lists.setValue': ['superdoc lists set-value --node-id abc123 --value-json 5'],
  'lists.convertToText': ['superdoc lists convert-to-text --node-id abc123'],
  'lists.setType': [
    'superdoc lists set-type --target-json \'{"kind":"block","nodeType":"listItem","nodeId":"abc123"}\' --kind bullet',
  ],

  // ── Format ──────────────────────────────────────────────────────────
  'format.apply': ['superdoc format apply --block-id abc123 --start 0 --end 10 --inline-json \'{"bold":true}\''],

  // ── Comments ────────────────────────────────────────────────────────
  'comments.create': ['superdoc comments create --block-id abc123 --start 0 --end 5 --text "Review this section"'],
  'comments.list': ['superdoc comments list'],
  'comments.get': ['superdoc comments get --id comment-123'],
  'comments.patch': ['superdoc comments patch --id comment-123 --text "Updated wording."'],
  'comments.delete': ['superdoc comments delete --id comment-123'],

  // ── Track Changes ───────────────────────────────────────────────────
  'trackChanges.list': ['superdoc track-changes list'],
  'trackChanges.get': ['superdoc track-changes get --id tc-123'],
  'trackChanges.decide': ['superdoc track-changes decide --decision accept --target-json \'{"id":"tc-123"}\''],

  // ── History ─────────────────────────────────────────────────────────
  'history.get': ['superdoc history get'],
  'history.undo': ['superdoc history undo'],
  'history.redo': ['superdoc history redo'],

  // ── Mutations (batch) ───────────────────────────────────────────────
  'mutations.apply': [
    'superdoc mutations apply --atomic true --change-mode direct --steps-json \'[{"id":"s1","op":"text.rewrite","where":{"by":"select","select":{"type":"text","pattern":"old"},"require":"first"},"args":{"replacement":{"text":"new"}}}]\'',
  ],
  'mutations.preview': [
    'superdoc mutations preview --atomic true --change-mode direct --steps-json \'[{"id":"s1","op":"text.rewrite","where":{"by":"select","select":{"type":"text","pattern":"old"},"require":"first"},"args":{"replacement":{"text":"new"}}}]\'',
  ],

  // ── Table of Contents ───────────────────────────────────────────────
  'create.tableOfContents': [
    'superdoc create table-of-contents',
    'superdoc create table-of-contents --at-json \'{"kind":"documentStart"}\'',
  ],

  // ── Capabilities ────────────────────────────────────────────────────
  'capabilities.get': ['superdoc capabilities'],
};

/**
 * Registry of OPC package-level singleton parts and their required metadata.
 *
 * Each entry defines a part that must have exactly one content-type Override in
 * [Content_Types].xml and exactly one root Relationship in _rels/.rels when the
 * part exists in the final package. When the part is absent, both registrations
 * must be removed.
 *
 * Values sourced from ECMA-376 / ISO 29500 and verified against real DOCX
 * fixtures produced by Microsoft Word.
 */

/** @typedef {import('./sync-package-metadata.js').ManagedPartEntry} ManagedPartEntry */

/** @type {ManagedPartEntry[]} */
export const MANAGED_PACKAGE_PARTS = [
  {
    zipPath: 'word/document.xml',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    relationshipType: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  },
  {
    zipPath: 'docProps/core.xml',
    contentType: 'application/vnd.openxmlformats-package.core-properties+xml',
    relationshipType: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  },
  {
    zipPath: 'docProps/app.xml',
    contentType: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
    relationshipType: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',
  },
  {
    zipPath: 'docProps/custom.xml',
    contentType: 'application/vnd.openxmlformats-officedocument.custom-properties+xml',
    relationshipType: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties',
  },
];

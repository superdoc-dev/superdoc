# Extension Commands to Document API: Gap Analysis

Mapping of extension commands that do NOT have a Document API equivalent yet.
Commands with full Document API coverage are omitted — this only lists the gaps.

> **77.7% of extension commands are already covered** by the Document API.
> The remaining 22.3% (66 commands) fall into the categories below.

## Category 1: Field Annotation (30 commands) — COMPLETE GAP

The Field Annotation extension handles form fields (text inputs, checkboxes, dropdowns).
None of these have Document API equivalents.

| Extension Command | Description |
|---|---|
| `insertFieldAnnotation` | Insert a form field at cursor |
| `updateFieldAnnotation` | Update field properties |
| `deleteFieldAnnotation` | Remove a form field |
| `setFieldAnnotationValue` | Set the current value |
| `getFieldAnnotations` | List all form fields |
| `getFieldAnnotationById` | Get specific field |
| `setFieldAnnotationRequired` | Mark field as required |
| `setFieldAnnotationReadonly` | Make field read-only |
| `setFieldAnnotationHidden` | Hide/show field |
| `validateFieldAnnotations` | Validate all fields |
| `setFieldAnnotationOptions` | Set dropdown options |
| `setFieldAnnotationLabel` | Set field label |
| `setFieldAnnotationPlaceholder` | Set placeholder text |
| `setFieldAnnotationGroup` | Group fields together |
| `getFieldAnnotationGroups` | List field groups |
| `setFieldAnnotationConditional` | Set conditional logic |
| `setFieldAnnotationFormat` | Set display format |
| `setFieldAnnotationValidation` | Set validation rules |
| `importFieldAnnotations` | Bulk import fields |
| `exportFieldAnnotations` | Bulk export fields |
| `lockFieldAnnotation` | Lock field from editing |
| `unlockFieldAnnotation` | Unlock field |
| `setFieldAnnotationOrder` | Set tab order |
| `focusFieldAnnotation` | Focus a specific field |
| `blurFieldAnnotation` | Remove focus |
| `getFieldAnnotationValue` | Get current value |
| `resetFieldAnnotation` | Reset to default |
| `resetAllFieldAnnotations` | Reset all fields |
| `setFieldAnnotationStyle` | Set visual style |
| `getFieldAnnotationErrors` | Get validation errors |

**Recommendation:** Add `fieldAnnotations.*` namespace to Document API, or consider whether Content Controls (`contentControls.*`) already cover most form field use cases.

## Category 2: Track Changes — Mode Switching (11 commands)

Core accept/reject operations ARE covered (`trackChanges.decide`), but editor mode switching is not.

| Extension Command | Description | Gap Type |
|---|---|---|
| `enableTrackChanges` | Turn on track changes mode | Editor state / config |
| `disableTrackChanges` | Turn off track changes mode | Editor state / config |
| `toggleTrackChanges` | Toggle track changes on/off | Editor state / config |
| `enableTrackChangesShowOriginal` | Show original document | View mode |
| `disableTrackChangesShowOriginal` | Exit original view | View mode |
| `toggleTrackChangesShowOriginal` | Toggle original view | View mode |
| `setTrackChangesAuthor` | Set current author | Editor config |
| `acceptAllTrackedChanges` | Accept all changes at once | Bulk operation |
| `rejectAllTrackedChanges` | Reject all changes at once | Bulk operation |
| `acceptTrackedChangeByRange` | Accept by range | Range-based |
| `rejectTrackedChangeByRange` | Reject by range | Range-based |

**Recommendation:** `acceptAll`/`rejectAll` and range-based operations should be added to `trackChanges.*`. Mode switching is an editor-level concern that may belong in a separate `editor.mode.*` or `editor.config.*` API rather than Document API.

## Category 3: Table — Navigation & Headers (5 commands)

Most table operations are well covered. These gaps are mostly UI/navigation.

| Extension Command | Description | Gap Type |
|---|---|---|
| `toggleHeaderColumn` | Mark/unmark column as header | Table structure |
| `toggleHeaderCell` | Mark/unmark cell as header | Table structure |
| `goToNextCell` | Move cursor to next cell | UI navigation |
| `goToPreviousCell` | Move cursor to previous cell | UI navigation |
| `fixTables` | Validate and repair table structure | Maintenance |

**Recommendation:** `toggleHeaderColumn`/`toggleHeaderCell` → add to `tables.*`. Navigation commands are UI concerns. `fixTables` is internal maintenance.

## Category 4: Format Commands (2 commands)

| Extension Command | Description | Gap Type |
|---|---|---|
| `clearNodesFormat` | Reset block nodes to paragraphs | Complex mutation |
| `copyFormat` | Copy formatting from selection (format painter) | UI + clipboard |

**Recommendation:** `clearNodesFormat` could map to a `format.clearBlock` operation. `copyFormat` is inherently a UI/clipboard operation.

## Category 5: Comments — UI State (1 command)

| Extension Command | Description | Gap Type |
|---|---|---|
| `setActiveComment` | Highlight/focus a specific comment in the UI | UI state |

**Recommendation:** This is a UI concern, not a document mutation. May belong in a future `editor.ui.*` API.

## Category 6: Content Block (3 commands)

| Extension Command | Description | Gap Type |
|---|---|---|
| `insertContentBlock` | Insert decorative separator/layout block | Create operation |
| `updateContentBlock` | Update content block properties | Mutation |
| `removeContentBlock` | Delete content block | Delete operation |

**Recommendation:** Add `create.contentBlock` + corresponding operations if content blocks are retained post-PM.

## Category 7: Block Node (1 command)

| Extension Command | Description | Gap Type |
|---|---|---|
| `updateBlockNodeAttributes` | Non-destructive attribute update | Generic mutation |

**Recommendation:** Could be covered by a generic `blocks.patch` operation.

## Category 8: Custom Selection (2 commands)

| Extension Command | Description | Gap Type |
|---|---|---|
| `setCustomSelection` | Set a programmatic selection range | UI state |
| `clearCustomSelection` | Clear custom selection | UI state |

**Recommendation:** These are UI/editor state operations, not document mutations. Belong in `editor.ui.*`.

## Category 9: Text Style (1 command)

| Extension Command | Description | Gap Type |
|---|---|---|
| `removeEmptyTextStyle` | Clean up empty text style marks | Internal cleanup |

**Recommendation:** Internal operation — should not need a public API.

---

## Summary by Priority

### High Priority (should add to Document API)
- **Track changes bulk ops**: `acceptAll`, `rejectAll`, range-based accept/reject (11 ops)
- **Table headers**: `toggleHeaderColumn`, `toggleHeaderCell` (2 ops)

### Medium Priority (evaluate need)
- **Field annotations**: 30 ops — evaluate overlap with Content Controls
- **Content blocks**: 3 ops — depends on post-PM feature support
- **Format clear block**: 1 op (`clearNodesFormat`)

### Low Priority / Out of Scope for Document API
- **UI state**: `setActiveComment`, `setCustomSelection`, `clearCustomSelection` (3 ops)
- **UI navigation**: `goToNextCell`, `goToPreviousCell` (2 ops)
- **Editor config**: track changes mode switching (6 ops) — belongs in editor config API
- **Internal**: `fixTables`, `removeEmptyTextStyle`, `copyFormat` (3 ops)

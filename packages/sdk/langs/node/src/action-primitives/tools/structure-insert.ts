import type { BoundDocApi, DocBlocksListResult } from '../../generated/client.js';
import type { InvokeOptions } from '../../runtime/process.js';
import { buildWorkflowDocIndex } from '../doc-index.js';
import {
  runWorkflowEngine,
  workflowStepFailure,
  workflowStepSuccess,
  type WorkflowEngineContext,
  type WorkflowEngineRunResult,
  type WorkflowStepResult,
} from '../engine.js';
import {
  resolveWorkflowTargetFromUnknown,
  type WorkflowResolvedTarget,
  type WorkflowTargetRequest,
} from '../resolve.js';

const STRUCTURE_INSERT_ACTIONS = [
  'insert_toc',
  'insert_section_break',
  'insert_paragraph',
  'insert_paragraphs',
  'move_range',
] as const;
const DOCUMENT_PLACEMENTS = ['document_start', 'document_end'] as const;
const RELATIVE_POSITIONS = ['before', 'after'] as const;
const SECTION_BREAK_TYPES = ['continuous', 'nextPage', 'evenPage', 'oddPage'] as const;
const CHANGE_MODES = ['direct', 'tracked'] as const;
const DEFAULT_TOC_CONFIG = {
  outlineLevels: { from: 1, to: 3 },
  hyperlinks: true,
  includePageNumbers: true,
  rightAlignPageNumbers: true,
  tabLeader: 'dot',
} as const;

type SuperdocStructureInsertAction = (typeof STRUCTURE_INSERT_ACTIONS)[number];
type SuperdocStructureInsertDocumentPlacement = (typeof DOCUMENT_PLACEMENTS)[number];
type SuperdocStructureInsertRelativePosition = (typeof RELATIVE_POSITIONS)[number];
type SuperdocStructureInsertSectionBreakType = (typeof SECTION_BREAK_TYPES)[number];
type SuperdocStructureInsertChangeMode = (typeof CHANGE_MODES)[number];
type StructureInsertInvokeOptions = InvokeOptions & { changeMode?: SuperdocStructureInsertChangeMode };
type StructureInsertAt = NonNullable<NonNullable<Parameters<BoundDocApi['create']['tableOfContents']>[0]>['at']>;
type StructureInsertRelativeTarget = Extract<StructureInsertAt, { target: unknown }>['target'];
type StructureInsertTocParams = NonNullable<Parameters<BoundDocApi['create']['tableOfContents']>[0]>;
type StructureInsertParagraphParams = NonNullable<Parameters<BoundDocApi['create']['paragraph']>[0]>;
type StructureInsertHeadingParams = NonNullable<Parameters<BoundDocApi['create']['heading']>[0]>;
type StructureInsertSectionBreakParams = NonNullable<Parameters<BoundDocApi['create']['sectionBreak']>[0]>;
type StructureInsertListedBlock = DocBlocksListResult['blocks'][number];
type StructureInsertBlockTarget = {
  kind: 'block';
  nodeType: StructureInsertListedBlock['nodeType'];
  nodeId: string;
};

type SuperdocStructureInsertPlacement =
  | {
      mode: 'document';
      at: SuperdocStructureInsertDocumentPlacement;
      source: 'default' | 'provided';
    }
  | {
      mode: 'relative';
      position: SuperdocStructureInsertRelativePosition;
      source: 'provided';
      request: WorkflowTargetRequest;
      target: WorkflowResolvedTarget;
    };

type SuperdocStructureInsertResolvedToc = {
  action: 'insert_toc';
  placement: SuperdocStructureInsertPlacement;
  title?: string;
};

type SuperdocStructureInsertResolvedSectionBreak = {
  action: 'insert_section_break';
  placement: SuperdocStructureInsertPlacement;
  breakType: SuperdocStructureInsertSectionBreakType;
};

type SuperdocStructureInsertResolvedParagraph = {
  action: 'insert_paragraph';
  placement: SuperdocStructureInsertPlacement;
  text: string;
  changeMode: SuperdocStructureInsertChangeMode;
};

type SuperdocStructureInsertResolvedParagraphs = {
  action: 'insert_paragraphs';
  placement: SuperdocStructureInsertPlacement;
  texts: string[];
  headingLevel?: number;
  changeMode: SuperdocStructureInsertChangeMode;
};

type SuperdocStructureInsertResolvedMoveRange = {
  action: 'move_range';
  /** First block of the contiguous range to move (already resolved to a nodeId by the caller). */
  startNodeId: string;
  /** Last block of the range. When omitted, the range auto-extends to the visual section end. */
  endNodeId?: string;
  /** Destination anchor block; the range lands before/after this block. */
  destinationNodeId: string;
  position: SuperdocStructureInsertRelativePosition;
  changeMode: SuperdocStructureInsertChangeMode;
};

type SuperdocStructureInsertResolved =
  | SuperdocStructureInsertResolvedToc
  | SuperdocStructureInsertResolvedSectionBreak
  | SuperdocStructureInsertResolvedParagraph
  | SuperdocStructureInsertResolvedParagraphs
  | SuperdocStructureInsertResolvedMoveRange;

type SuperdocStructureInsertPlanToc = {
  action: 'insert_toc';
  placement: SuperdocStructureInsertPlacement;
  title?: string;
  titleParagraphParams?: StructureInsertParagraphParams;
  tocParams: StructureInsertTocParams;
};

type SuperdocStructureInsertPlanSectionBreak = {
  action: 'insert_section_break';
  placement: SuperdocStructureInsertPlacement;
  breakType: SuperdocStructureInsertSectionBreakType;
  sectionBreakParams: StructureInsertSectionBreakParams;
};

type SuperdocStructureInsertPlanParagraph = {
  action: 'insert_paragraph';
  placement: SuperdocStructureInsertPlacement;
  text: string;
  changeMode: SuperdocStructureInsertChangeMode;
  paragraphParams: StructureInsertParagraphParams;
};

type SuperdocStructureInsertPlanParagraphs = {
  action: 'insert_paragraphs';
  placement: SuperdocStructureInsertPlacement;
  texts: string[];
  headingLevel?: number;
  changeMode: SuperdocStructureInsertChangeMode;
  firstParagraphParams: StructureInsertParagraphParams;
  firstHeadingParams?: StructureInsertHeadingParams;
};

type SuperdocStructureInsertPlanMoveRange = SuperdocStructureInsertResolvedMoveRange;

type SuperdocStructureInsertPlan =
  | SuperdocStructureInsertPlanToc
  | SuperdocStructureInsertPlanSectionBreak
  | SuperdocStructureInsertPlanParagraph
  | SuperdocStructureInsertPlanParagraphs
  | SuperdocStructureInsertPlanMoveRange;

type WorkflowRevision = {
  before: string;
  after: string;
  unchanged: boolean;
};

type SuperdocStructureInsertExecutionToc = {
  action: 'insert_toc';
  placement: ReturnType<typeof summarizePlacement>;
  revision: WorkflowRevision;
  tocNodeId: string;
  title?: string;
  titleNodeId?: string;
};

type SuperdocStructureInsertExecutionSectionBreak = {
  action: 'insert_section_break';
  placement: ReturnType<typeof summarizePlacement>;
  revision: WorkflowRevision;
  breakType: SuperdocStructureInsertSectionBreakType;
  sectionId: string;
  breakParagraphNodeId?: string;
};

type SuperdocStructureInsertExecutionParagraph = {
  action: 'insert_paragraph';
  placement: ReturnType<typeof summarizePlacement>;
  revision: WorkflowRevision;
  text: string;
  changeMode: SuperdocStructureInsertChangeMode;
  paragraphNodeId: string;
};

type SuperdocStructureInsertExecutionParagraphs = {
  action: 'insert_paragraphs';
  placement: ReturnType<typeof summarizePlacement>;
  revision: WorkflowRevision;
  texts: string[];
  headingLevel?: number;
  changeMode: SuperdocStructureInsertChangeMode;
  paragraphNodeIds: string[];
};

type SuperdocStructureInsertExecutionMoveRange = {
  action: 'move_range';
  revision: WorkflowRevision;
  position: SuperdocStructureInsertRelativePosition;
  changeMode: SuperdocStructureInsertChangeMode;
  /** First block of the moved range (original nodeId). */
  startNodeId: string;
  /** Last block of the moved range (original nodeId — the resolved end, whether explicit or auto-extended). */
  endNodeId: string;
  /** Destination anchor the caller pointed at. */
  destinationNodeId: string;
  /** Block the recreated range was actually placed relative to (may be the destination's section-end). */
  anchorNodeId: string;
  /** True when the destination was heading-like and `after` extended past its whole visual section. */
  destinationExtendedToSectionEnd: boolean;
  movedBlockCount: number;
  movedTexts: string[];
  insertedBlockNodeIds: string[];
  deletedCount: number;
};

type SuperdocStructureInsertExecution =
  | SuperdocStructureInsertExecutionToc
  | SuperdocStructureInsertExecutionSectionBreak
  | SuperdocStructureInsertExecutionParagraph
  | SuperdocStructureInsertExecutionParagraphs
  | SuperdocStructureInsertExecutionMoveRange;

type SuperdocStructureInsertVerification = {
  action: SuperdocStructureInsertAction;
  passed: boolean;
  summary: string;
  checks: Record<string, unknown>;
};

export type RunSuperdocStructureInsertInput = {
  documentHandle: BoundDocApi;
  args: Record<string, unknown>;
  invokeOptions?: InvokeOptions;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function parseAction(raw: unknown): SuperdocStructureInsertAction | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  return STRUCTURE_INSERT_ACTIONS.find((action) => action === raw);
}

function parseOptionalText(raw: unknown): string | undefined {
  if (raw == null) {
    return undefined;
  }
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseTexts(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const texts = raw.map((value) => (typeof value === 'string' ? value.trim() : '')).filter((value) => value.length > 0);
  return texts.length === raw.length && texts.length > 0 ? texts : undefined;
}

function parseHeadingLevel(raw: unknown): number | undefined {
  if (raw == null) {
    return undefined;
  }
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > 6) {
    return Number.NaN;
  }
  return raw;
}

function parseRequiredNodeId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseBreakType(raw: unknown): SuperdocStructureInsertSectionBreakType | undefined {
  if (raw == null) {
    return 'nextPage';
  }
  if (typeof raw !== 'string') {
    return undefined;
  }
  return SECTION_BREAK_TYPES.find((value) => value === raw);
}

function parseChangeMode(raw: unknown): SuperdocStructureInsertChangeMode | undefined {
  if (raw == null) {
    return 'direct';
  }
  if (typeof raw !== 'string') {
    return undefined;
  }
  return CHANGE_MODES.find((mode) => mode === raw);
}

function parseRelativePosition(raw: unknown): SuperdocStructureInsertRelativePosition | undefined {
  if (raw == null) {
    return 'before';
  }
  if (typeof raw !== 'string') {
    return undefined;
  }
  return RELATIVE_POSITIONS.find((position) => position === raw);
}

function toApiRelativeTarget(target: WorkflowResolvedTarget): StructureInsertRelativeTarget {
  if (target.entity.kind === 'table') {
    return {
      kind: 'block',
      nodeType: 'table',
      nodeId: target.entity.nodeId,
    };
  }

  if (target.entity.kind === 'listItem') {
    return {
      kind: 'block',
      nodeType: 'listItem',
      nodeId: target.entity.nodeId,
    };
  }

  return {
    kind: 'block',
    nodeType: target.entity.nodeType,
    nodeId: target.entity.nodeId,
  };
}

function toApiPlacement(placement: SuperdocStructureInsertPlacement): StructureInsertAt {
  if (placement.mode === 'document') {
    return {
      kind: placement.at === 'document_start' ? 'documentStart' : 'documentEnd',
    };
  }

  return {
    kind: placement.position,
    target: toApiRelativeTarget(placement.target),
  };
}

function summarizePlacement(placement: SuperdocStructureInsertPlacement) {
  if (placement.mode === 'document') {
    return {
      mode: placement.mode,
      at: placement.at,
      source: placement.source,
    };
  }

  return {
    mode: placement.mode,
    position: placement.position,
    source: placement.source,
    targetNodeId: placement.target.nodeId,
    targetKind: placement.target.entity.kind,
  };
}

function resolvePlacement(
  context: WorkflowEngineContext,
  action: SuperdocStructureInsertAction,
): WorkflowStepResult<SuperdocStructureInsertPlacement> {
  const rawPlacement = context.args.placement;
  const defaultPlacement: SuperdocStructureInsertPlacement = {
    mode: 'document',
    at: action === 'insert_toc' ? 'document_start' : 'document_end',
    source: 'default',
  };

  if (rawPlacement == null) {
    return workflowStepSuccess(defaultPlacement);
  }

  if (typeof rawPlacement === 'string') {
    const at = DOCUMENT_PLACEMENTS.find((value) => value === rawPlacement);
    if (at == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STRUCTURE_INSERT_PLACEMENT_INVALID',
        message: 'placement must be document_start, document_end, or an object with {at} or {position,target}.',
        details: { received: rawPlacement },
      });
    }
    return workflowStepSuccess({
      mode: 'document',
      at,
      source: 'provided',
    });
  }

  if (!isObjectRecord(rawPlacement)) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_STRUCTURE_INSERT_PLACEMENT_INVALID',
      message: 'placement must be an object when not using a document_start/document_end string.',
      details: { receivedType: typeof rawPlacement },
    });
  }

  const hasAt = rawPlacement.at != null;
  const hasPosition = rawPlacement.position != null || rawPlacement.target != null;
  if (hasAt && hasPosition) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_STRUCTURE_INSERT_PLACEMENT_INVALID',
      message: 'placement must specify either {at} or {position,target}, not both.',
    });
  }

  if (hasAt) {
    const at = DOCUMENT_PLACEMENTS.find((value) => value === rawPlacement.at);
    if (at == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STRUCTURE_INSERT_PLACEMENT_INVALID',
        message: 'placement.at must be document_start or document_end.',
        details: { received: rawPlacement.at },
      });
    }
    return workflowStepSuccess({
      mode: 'document',
      at,
      source: 'provided',
    });
  }

  const position = RELATIVE_POSITIONS.find((value) => value === rawPlacement.position);
  if (position == null || rawPlacement.target == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_STRUCTURE_INSERT_PLACEMENT_INVALID',
      message: 'Relative placement requires {position,target} with position before or after.',
      details: {
        position: rawPlacement.position,
        hasTarget: rawPlacement.target != null,
      },
    });
  }

  const resolved = resolveWorkflowTargetFromUnknown(context.index, rawPlacement.target);
  if (!resolved.ok) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: `WORKFLOW_${resolved.code}`,
      message: resolved.message,
      details: {
        targetArgKey: 'placement.target',
        ...resolved.details,
      },
    });
  }

  return workflowStepSuccess({
    mode: 'relative',
    position,
    source: 'provided',
    request: resolved.request,
    target: resolved.target,
  });
}

function resolveStep(context: WorkflowEngineContext): WorkflowStepResult<SuperdocStructureInsertResolved> {
  const action = parseAction(context.args.action);
  if (action == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_STRUCTURE_INSERT_ACTION_INVALID',
      message:
        'superdoc_structure_insert requires action to be insert_toc, insert_section_break, insert_paragraph, insert_paragraphs, or move_range.',
    });
  }

  if (action === 'move_range') {
    // The caller (SDK move_range action) resolves fromText/toText/afterText/beforeText
    // to nodeIds and a destination position, so the workflow only validates presence.
    const startNodeId = parseRequiredNodeId(context.args.startNodeId);
    const endNodeId = parseRequiredNodeId(context.args.endNodeId);
    const destinationNodeId = parseRequiredNodeId(context.args.destinationNodeId);
    const position = parseRelativePosition(context.args.position);
    const changeMode = parseChangeMode(context.args.changeMode);

    if (startNodeId == null || destinationNodeId == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STRUCTURE_INSERT_RANGE_NODE_REQUIRED',
        message: 'move_range requires startNodeId and destinationNodeId.',
        details: {
          startNodeId: context.args.startNodeId,
          destinationNodeId: context.args.destinationNodeId,
        },
      });
    }

    if (startNodeId === destinationNodeId) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STRUCTURE_INSERT_RANGE_NODE_INVALID',
        message: 'move_range startNodeId and destinationNodeId must differ.',
      });
    }

    if (position == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STRUCTURE_INSERT_POSITION_INVALID',
        message: 'move_range position must be "before" or "after".',
        details: { received: context.args.position },
      });
    }

    if (changeMode == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STRUCTURE_INSERT_CHANGE_MODE_INVALID',
        message: 'changeMode must be "direct" or "tracked".',
        details: { received: context.args.changeMode },
      });
    }

    return workflowStepSuccess({
      action,
      startNodeId,
      endNodeId,
      destinationNodeId,
      position,
      changeMode,
    });
  }

  const placement = resolvePlacement(context, action);
  if (!placement.ok) {
    return placement;
  }

  if (action === 'insert_toc') {
    if (context.args.breakType != null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STRUCTURE_INSERT_ARG_UNSUPPORTED',
        message: 'breakType is only supported for insert_section_break.',
      });
    }

    return workflowStepSuccess({
      action,
      placement: placement.value,
      title: parseOptionalText(context.args.title),
    });
  }

  if (action === 'insert_paragraph') {
    if (context.args.breakType != null || context.args.title != null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STRUCTURE_INSERT_ARG_UNSUPPORTED',
        message: 'title and breakType are not supported for insert_paragraph.',
      });
    }

    const text = parseOptionalText(context.args.text);
    if (text == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STRUCTURE_INSERT_TEXT_REQUIRED',
        message: 'insert_paragraph requires non-empty text.',
      });
    }

    const changeMode = parseChangeMode(context.args.changeMode);
    if (changeMode == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STRUCTURE_INSERT_CHANGE_MODE_INVALID',
        message: 'changeMode must be "direct" or "tracked".',
        details: { received: context.args.changeMode },
      });
    }

    return workflowStepSuccess({
      action,
      placement: placement.value,
      text,
      changeMode,
    });
  }

  if (action === 'insert_paragraphs') {
    if (context.args.breakType != null || context.args.title != null || context.args.text != null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STRUCTURE_INSERT_ARG_UNSUPPORTED',
        message: 'text, title, and breakType are not supported for insert_paragraphs; use texts.',
      });
    }

    const texts = parseTexts(context.args.texts);
    if (texts == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STRUCTURE_INSERT_TEXTS_REQUIRED',
        message: 'insert_paragraphs requires a non-empty texts array of non-empty paragraph strings.',
      });
    }

    const headingLevel = parseHeadingLevel(context.args.headingLevel);
    if (Number.isNaN(headingLevel)) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STRUCTURE_INSERT_HEADING_LEVEL_INVALID',
        message: 'headingLevel must be an integer from 1 to 6 when provided.',
        details: { received: context.args.headingLevel },
      });
    }

    const changeMode = parseChangeMode(context.args.changeMode);
    if (changeMode == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STRUCTURE_INSERT_CHANGE_MODE_INVALID',
        message: 'changeMode must be "direct" or "tracked".',
        details: { received: context.args.changeMode },
      });
    }

    return workflowStepSuccess({
      action,
      placement: placement.value,
      texts,
      headingLevel,
      changeMode,
    });
  }

  if (context.args.title != null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_STRUCTURE_INSERT_ARG_UNSUPPORTED',
      message: 'title is only supported for insert_toc.',
    });
  }

  const breakType = parseBreakType(context.args.breakType);
  if (breakType == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'resolve',
      code: 'WORKFLOW_STRUCTURE_INSERT_BREAK_TYPE_INVALID',
      message: 'breakType must be one of continuous, nextPage, evenPage, or oddPage.',
      details: { received: context.args.breakType },
    });
  }

  return workflowStepSuccess({
    action,
    placement: placement.value,
    breakType,
  });
}

function planStep(
  _context: WorkflowEngineContext,
  resolved: SuperdocStructureInsertResolved,
): WorkflowStepResult<SuperdocStructureInsertPlan> {
  if (resolved.action === 'move_range') {
    return workflowStepSuccess(resolved);
  }

  const at = toApiPlacement(resolved.placement);

  if (resolved.action === 'insert_toc') {
    return workflowStepSuccess({
      action: resolved.action,
      placement: resolved.placement,
      title: resolved.title,
      titleParagraphParams:
        resolved.title == null
          ? undefined
          : {
              text: resolved.title,
              at,
            },
      tocParams: {
        ...(resolved.title == null ? { at } : {}),
        config: DEFAULT_TOC_CONFIG,
      },
    });
  }

  if (resolved.action === 'insert_paragraph') {
    return workflowStepSuccess({
      action: resolved.action,
      placement: resolved.placement,
      text: resolved.text,
      changeMode: resolved.changeMode,
      paragraphParams: {
        text: resolved.text,
        changeMode: resolved.changeMode,
        at,
      },
    });
  }

  if (resolved.action === 'insert_paragraphs') {
    return workflowStepSuccess({
      action: resolved.action,
      placement: resolved.placement,
      texts: resolved.texts,
      headingLevel: resolved.headingLevel,
      changeMode: resolved.changeMode,
      firstParagraphParams: {
        text: resolved.texts[0] ?? '',
        changeMode: resolved.changeMode,
        at,
      },
      firstHeadingParams:
        resolved.headingLevel == null
          ? undefined
          : {
              text: resolved.texts[0] ?? '',
              level: resolved.headingLevel,
              changeMode: resolved.changeMode,
              at,
            },
    });
  }

  return workflowStepSuccess({
    action: resolved.action,
    placement: resolved.placement,
    breakType: resolved.breakType,
    sectionBreakParams: {
      at,
      breakType: resolved.breakType,
    },
  });
}

function textOfListedBlock(block: StructureInsertListedBlock | undefined): string {
  if (block == null) {
    return '';
  }
  const text =
    typeof block.text === 'string' ? block.text : typeof block.textPreview === 'string' ? block.textPreview : '';
  return text.trim();
}

function normalizeSectionHeadingText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Broadened "section boundary" detector used by move_range's visual-section
 * logic. A real contract/Will rarely uses Word heading NODES: its "sections"
 * (PREAMBLE, SCHEDULE A, RECITALS…) are short paragraphs STYLED to look like
 * titles — ALL-CAPS, bold, or carrying a heading/title style. We treat both as
 * section boundaries so the range auto-extends across a visual section and so a
 * destination "after SCHEDULE A" lands past that whole visual section.
 *
 * The length/word/punctuation guards keep body sentences (which can inherit a
 * heading style via numbering) from being mistaken for a section title.
 */
function isHeadingLikeBlock(block: StructureInsertListedBlock): boolean {
  const text = normalizeSectionHeadingText(textOfListedBlock(block));
  if (text.length === 0 || text.length > 80) {
    return false;
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 8) {
    return false;
  }

  // Sentence-terminated text is body content, not a movable section title —
  // this also filters long clause bodies that surface as Heading3 via inherited
  // numbering styles.
  if (/[.:;!?]$/.test(text)) {
    return false;
  }

  // 1) A real heading node is always a boundary.
  if (block.nodeType === 'heading') {
    return true;
  }

  // Only paragraphs can masquerade as styled titles; skip tables, list items, images…
  if (block.nodeType !== 'paragraph') {
    return false;
  }

  // 2) A heading/title/subtitle paragraph style.
  const styleId = typeof block.styleId === 'string' ? block.styleId.toLowerCase() : '';
  if (/heading|title|subtitle/.test(styleId)) {
    return true;
  }

  // 3) A short bold line (e.g. a bold clause title).
  if (block.bold === true) {
    return true;
  }

  // 4) A short ALL-CAPS line (e.g. "PREAMBLE", "SCHEDULE A").
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 2 && text === text.toUpperCase() && /[A-Z]/.test(text)) {
    return true;
  }

  return false;
}

async function listAllBlocksForStructureMove(
  documentHandle: BoundDocApi,
  invokeOptions: InvokeOptions | undefined,
): Promise<StructureInsertListedBlock[]> {
  const blocks: StructureInsertListedBlock[] = [];
  const pageLimit = 250;
  let offset = 0;

  for (;;) {
    const page = await documentHandle.blocks.list({ offset, limit: pageLimit, includeText: true }, invokeOptions);
    blocks.push(...page.blocks);
    if (blocks.length >= page.total || page.blocks.length === 0) {
      break;
    }
    offset += page.blocks.length;
  }

  return blocks;
}

function findBlockIndexByNodeId(blocks: StructureInsertListedBlock[], nodeId: string): number {
  return blocks.findIndex((block) => block.nodeId === nodeId);
}

/**
 * Given the index of a section-opening block, return the index of the LAST
 * block belonging to that visual section — i.e. the block just before the next
 * heading-like block (`nextHeadingIndex - 1`), or the end of the document when
 * no further section boundary exists. This is the same next-heading detection
 * the section move has always used, generalized to visual (styled-paragraph) sections.
 *
 * When the opening block carries a heading level, only boundaries at the same
 * or a higher (shallower) level end the section, so a sub-heading does not cut
 * the section short. Styled-title paragraphs (no heading level) always act as
 * boundaries.
 */
function computeVisualSectionEndIndex(blocks: StructureInsertListedBlock[], startIndex: number): number {
  const startBlock = blocks[startIndex];
  const sourceLevel = typeof startBlock?.headingLevel === 'number' ? startBlock.headingLevel : 9;
  const relativeNextIndex = blocks
    .slice(startIndex + 1)
    .findIndex(
      (block) =>
        isHeadingLikeBlock(block) && (typeof block.headingLevel !== 'number' || block.headingLevel <= sourceLevel),
    );
  if (relativeNextIndex < 0) {
    return blocks.length - 1;
  }
  // absolute next-boundary index = startIndex + 1 + relativeNextIndex; section end is the block before it.
  return startIndex + relativeNextIndex;
}

function toListedBlockTarget(block: StructureInsertListedBlock): StructureInsertBlockTarget {
  return {
    kind: 'block',
    nodeType: block.nodeType,
    nodeId: block.nodeId,
  };
}

function toCreatePlacementFromListedBlock(
  block: StructureInsertListedBlock,
  position: SuperdocStructureInsertRelativePosition,
): StructureInsertAt {
  return {
    kind: position,
    target: toListedBlockTarget(block) as StructureInsertRelativeTarget,
  };
}

function headingLevelForCopiedBlock(block: StructureInsertListedBlock): number {
  return typeof block.headingLevel === 'number' &&
    Number.isInteger(block.headingLevel) &&
    block.headingLevel >= 1 &&
    block.headingLevel <= 6
    ? block.headingLevel
    : 3;
}

function withChangeModeOption(
  invokeOptions: InvokeOptions | undefined,
  changeMode: SuperdocStructureInsertChangeMode,
): StructureInsertInvokeOptions {
  return { ...(invokeOptions ?? {}), changeMode };
}

async function createCopiedSectionBlock(input: {
  context: WorkflowEngineContext;
  block: StructureInsertListedBlock;
  at: StructureInsertAt;
  changeMode: SuperdocStructureInsertChangeMode;
}): Promise<{ nodeId: string; nodeType: 'paragraph' | 'heading' }> {
  const text = textOfListedBlock(input.block);
  if (input.block.nodeType === 'heading') {
    const result = await input.context.documentHandle.create.heading(
      {
        text,
        level: headingLevelForCopiedBlock(input.block),
        at: input.at,
      },
      withChangeModeOption(input.context.invokeOptions, input.changeMode),
    );
    return {
      nodeId: result.heading.nodeId,
      nodeType: 'heading',
    };
  }

  const result = await input.context.documentHandle.create.paragraph(
    {
      text,
      at: input.at,
    },
    withChangeModeOption(input.context.invokeOptions, input.changeMode),
  );
  return {
    nodeId: result.paragraph.nodeId,
    nodeType: 'paragraph',
  };
}

async function executeMoveRangeStep(
  context: WorkflowEngineContext,
  plan: SuperdocStructureInsertPlanMoveRange,
): Promise<WorkflowStepResult<SuperdocStructureInsertExecutionMoveRange>> {
  const beforeRevision = context.info.revision;
  const blocks = await listAllBlocksForStructureMove(context.documentHandle, context.invokeOptions);

  const startIndex = findBlockIndexByNodeId(blocks, plan.startNodeId);
  if (startIndex < 0) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'execute',
      code: 'WORKFLOW_STRUCTURE_INSERT_RANGE_START_NOT_FOUND',
      message: 'move_range could not find the range start block (startNodeId) in the current document.',
      details: { startNodeId: plan.startNodeId },
    });
  }

  // Resolve the range end: an explicit endNodeId, else auto-extend across the
  // visual section (up to but excluding the next heading-like block).
  let endIndex: number;
  if (plan.endNodeId != null) {
    const explicitEnd = findBlockIndexByNodeId(blocks, plan.endNodeId);
    if (explicitEnd < 0) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'execute',
        code: 'WORKFLOW_STRUCTURE_INSERT_RANGE_END_NOT_FOUND',
        message: 'move_range could not find the range end block (endNodeId) in the current document.',
        details: { endNodeId: plan.endNodeId },
      });
    }
    if (explicitEnd < startIndex) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'execute',
        code: 'WORKFLOW_STRUCTURE_INSERT_RANGE_REVERSED',
        message:
          'move_range resolved toText before fromText. Nothing was changed. Use fromText from the first block and toText from the last block of the range.',
        details: { startNodeId: plan.startNodeId, endNodeId: plan.endNodeId },
      });
    }
    endIndex = explicitEnd;
  } else {
    endIndex = computeVisualSectionEndIndex(blocks, startIndex);
  }

  const resolvedEndNodeId = blocks[endIndex]?.nodeId ?? plan.startNodeId;

  // move_range recreates blocks as plain paragraph/heading text — a table,
  // list, or image in the range would be silently flattened to its text
  // preview and the original destroyed. Refuse instead of losing content.
  // (Structural relocation that preserves node subtrees is follow-up work.)
  const unsupportedBlocks = blocks
    .slice(startIndex, endIndex + 1)
    .filter((block) => block.nodeType !== 'paragraph' && block.nodeType !== 'heading');
  if (unsupportedBlocks.length > 0) {
    const kinds = [...new Set(unsupportedBlocks.map((block) => block.nodeType))].join(', ');
    return workflowStepFailure({
      status: 'failed',
      phase: 'execute',
      code: 'WORKFLOW_STRUCTURE_INSERT_RANGE_UNSUPPORTED_CONTENT',
      message:
        `move_range only moves plain paragraph/heading text, but the resolved range contains: ${kinds}. ` +
        'Nothing was changed. Narrow the range to exclude those blocks (tighten fromText/toText or pass an explicit endNodeId), or move the surrounding paragraphs in smaller ranges around them.',
      details: {
        startNodeId: plan.startNodeId,
        endNodeId: resolvedEndNodeId,
        unsupported: unsupportedBlocks.map((block) => ({ nodeId: block.nodeId, nodeType: block.nodeType })),
      },
    });
  }

  const rangeBlocks = blocks.slice(startIndex, endIndex + 1).filter((block) => textOfListedBlock(block).length > 0);
  if (rangeBlocks.length === 0) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'execute',
      code: 'WORKFLOW_STRUCTURE_INSERT_RANGE_EMPTY',
      message: 'move_range resolved a range with no movable (non-empty) blocks.',
      details: { startNodeId: plan.startNodeId, endNodeId: resolvedEndNodeId },
    });
  }

  if (plan.changeMode === 'tracked') {
    return workflowStepFailure({
      status: 'failed',
      phase: 'execute',
      code: 'WORKFLOW_STRUCTURE_INSERT_RANGE_TRACKED_UNSUPPORTED',
      message:
        'move_range is direct-only today. Tracked mode would require a tracked block-range move. Nothing was changed. Use move_text for tracked text-span moves or run move_range without changeMode.',
      details: { startNodeId: plan.startNodeId, endNodeId: resolvedEndNodeId },
    });
  }

  const destinationIndex = findBlockIndexByNodeId(blocks, plan.destinationNodeId);
  if (destinationIndex < 0) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'execute',
      code: 'WORKFLOW_STRUCTURE_INSERT_RANGE_DESTINATION_NOT_FOUND',
      message: 'move_range could not find the destination anchor block in the current document.',
      details: { destinationNodeId: plan.destinationNodeId },
    });
  }

  if (destinationIndex >= startIndex && destinationIndex <= endIndex) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'execute',
      code: 'WORKFLOW_STRUCTURE_INSERT_RANGE_DESTINATION_INSIDE',
      message: 'move_range destination falls inside the range being moved.',
      details: {
        destinationNodeId: plan.destinationNodeId,
        startNodeId: plan.startNodeId,
        endNodeId: resolvedEndNodeId,
      },
    });
  }

  // "after a section": if the destination anchor is itself heading-like and the
  // caller asked to land AFTER it, place the range after that anchor's WHOLE
  // visual section (its section end) — so "afterText: SCHEDULE A" lands after
  // the entire SCHEDULE A section, not just its title line.
  const destinationBlock = blocks[destinationIndex]!;
  let anchorIndex = destinationIndex;
  let destinationExtendedToSectionEnd = false;
  if (plan.position === 'after' && isHeadingLikeBlock(destinationBlock)) {
    anchorIndex = computeVisualSectionEndIndex(blocks, destinationIndex);
    destinationExtendedToSectionEnd = anchorIndex !== destinationIndex;
  }

  // The extended anchor must not reach into the source range.
  if (anchorIndex >= startIndex && anchorIndex <= endIndex) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'execute',
      code: 'WORKFLOW_STRUCTURE_INSERT_RANGE_DESTINATION_INSIDE',
      message: 'move_range destination section overlaps the range being moved.',
      details: {
        destinationNodeId: plan.destinationNodeId,
        startNodeId: plan.startNodeId,
        endNodeId: resolvedEndNodeId,
      },
    });
  }

  const anchorBlock = blocks[anchorIndex] ?? destinationBlock;
  const insertedBlockNodeIds: string[] = [];
  // First copy lands relative to the anchor with the requested position; every
  // subsequent copy lands right after the previous one, preserving range order.
  let insertionAt = toCreatePlacementFromListedBlock(anchorBlock, plan.position);
  let previousInserted: { nodeId: string; nodeType: 'paragraph' | 'heading' } | undefined;

  for (const block of rangeBlocks) {
    if (previousInserted != null) {
      insertionAt = {
        kind: 'after',
        target: {
          kind: 'block',
          nodeType: previousInserted.nodeType,
          nodeId: previousInserted.nodeId,
        },
      };
    }

    previousInserted = await createCopiedSectionBlock({ context, block, at: insertionAt, changeMode: plan.changeMode });
    insertedBlockNodeIds.push(previousInserted.nodeId);
  }

  const sourceStart = blocks[startIndex];
  const sourceEnd = blocks[endIndex];
  if (sourceStart == null || sourceEnd == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'execute',
      code: 'WORKFLOW_STRUCTURE_INSERT_RANGE_NOT_FOUND',
      message: 'move_range lost the source range while preparing deletion.',
    });
  }

  // Delete the ORIGINAL source range by nodeId. The freshly-created copies have
  // new nodeIds, so the delete cannot touch them (the copy is preserved).
  const deleteResult = await context.documentHandle.blocks.deleteRange(
    {
      start: toListedBlockTarget(sourceStart),
      end: toListedBlockTarget(sourceEnd),
      force: true,
    },
    withChangeModeOption(context.invokeOptions, plan.changeMode),
  );

  const afterInfo = await context.documentHandle.info({}, context.invokeOptions);
  return workflowStepSuccess({
    action: plan.action,
    revision: {
      before: beforeRevision,
      after: afterInfo.revision,
      unchanged: beforeRevision === afterInfo.revision,
    },
    position: plan.position,
    changeMode: plan.changeMode,
    startNodeId: plan.startNodeId,
    endNodeId: resolvedEndNodeId,
    destinationNodeId: plan.destinationNodeId,
    anchorNodeId: anchorBlock.nodeId,
    destinationExtendedToSectionEnd,
    movedBlockCount: rangeBlocks.length,
    movedTexts: rangeBlocks.map((block) => textOfListedBlock(block)),
    insertedBlockNodeIds,
    deletedCount: deleteResult.deletedCount,
  });
}

async function executeStep(
  context: WorkflowEngineContext,
  _resolved: SuperdocStructureInsertResolved,
  plan: SuperdocStructureInsertPlan,
): Promise<WorkflowStepResult<SuperdocStructureInsertExecution>> {
  const beforeRevision = context.info.revision;

  if (plan.action === 'move_range') {
    return executeMoveRangeStep(context, plan);
  }

  if (plan.action === 'insert_toc') {
    let titleNodeId: string | undefined;
    if (plan.titleParagraphParams != null) {
      const titleResult = await context.documentHandle.create.paragraph(
        plan.titleParagraphParams,
        context.invokeOptions,
      );
      titleNodeId = titleResult.paragraph.nodeId;
    }

    const tocParams: StructureInsertTocParams =
      titleNodeId == null
        ? plan.tocParams
        : {
            ...plan.tocParams,
            at: {
              kind: 'after',
              target: {
                kind: 'block',
                nodeType: 'paragraph',
                nodeId: titleNodeId,
              },
            },
          };

    const tocResult = await context.documentHandle.create.tableOfContents(tocParams, context.invokeOptions);
    const afterInfo = await context.documentHandle.info({}, context.invokeOptions);

    return workflowStepSuccess({
      action: plan.action,
      placement: summarizePlacement(plan.placement),
      revision: {
        before: beforeRevision,
        after: afterInfo.revision,
        unchanged: beforeRevision === afterInfo.revision,
      },
      tocNodeId: tocResult.toc.nodeId,
      title: plan.title,
      titleNodeId,
    });
  }

  if (plan.action === 'insert_paragraph') {
    const paragraphResult = await context.documentHandle.create.paragraph(plan.paragraphParams, context.invokeOptions);
    const afterInfo = await context.documentHandle.info({}, context.invokeOptions);

    return workflowStepSuccess({
      action: plan.action,
      placement: summarizePlacement(plan.placement),
      revision: {
        before: beforeRevision,
        after: afterInfo.revision,
        unchanged: beforeRevision === afterInfo.revision,
      },
      text: plan.text,
      changeMode: plan.changeMode,
      paragraphNodeId: paragraphResult.paragraph.nodeId,
    });
  }

  if (plan.action === 'insert_paragraphs') {
    const paragraphNodeIds: string[] = [];
    let previousNodeType: 'paragraph' | 'heading' = 'paragraph';
    if (plan.firstHeadingParams != null) {
      const firstResult = await context.documentHandle.create.heading(plan.firstHeadingParams, context.invokeOptions);
      paragraphNodeIds.push(firstResult.heading.nodeId);
      previousNodeType = 'heading';
    } else {
      const firstResult = await context.documentHandle.create.paragraph(
        plan.firstParagraphParams,
        context.invokeOptions,
      );
      paragraphNodeIds.push(firstResult.paragraph.nodeId);
    }

    for (const text of plan.texts.slice(1)) {
      const previousNodeId = paragraphNodeIds[paragraphNodeIds.length - 1];
      if (previousNodeId == null) break;
      const result = await context.documentHandle.create.paragraph(
        {
          text,
          changeMode: plan.changeMode,
          at: {
            kind: 'after',
            target: {
              kind: 'block',
              nodeType: previousNodeType,
              nodeId: previousNodeId,
            },
          },
        },
        context.invokeOptions,
      );
      paragraphNodeIds.push(result.paragraph.nodeId);
      previousNodeType = 'paragraph';
    }

    const afterInfo = await context.documentHandle.info({}, context.invokeOptions);
    return workflowStepSuccess({
      action: plan.action,
      placement: summarizePlacement(plan.placement),
      revision: {
        before: beforeRevision,
        after: afterInfo.revision,
        unchanged: beforeRevision === afterInfo.revision,
      },
      texts: plan.texts,
      headingLevel: plan.headingLevel,
      changeMode: plan.changeMode,
      paragraphNodeIds,
    });
  }

  let sectionResult: Awaited<ReturnType<BoundDocApi['create']['sectionBreak']>> | undefined;
  try {
    sectionResult = await context.documentHandle.create.sectionBreak(plan.sectionBreakParams, context.invokeOptions);
  } catch {
    // Some runtimes cannot materialize section breaks yet. Treat this as a
    // non-fatal planning marker so unrelated multi-step workflows can proceed.
    return workflowStepSuccess({
      action: plan.action,
      placement: summarizePlacement(plan.placement),
      revision: {
        before: beforeRevision,
        after: beforeRevision,
        unchanged: true,
      },
      breakType: plan.breakType,
      sectionId: 'section-break-fallback',
    });
  }
  const sectionId =
    isObjectRecord(sectionResult.section) && typeof sectionResult.section.sectionId === 'string'
      ? sectionResult.section.sectionId
      : undefined;
  const afterInfo = await context.documentHandle.info({}, context.invokeOptions);
  if (sectionId == null) {
    return workflowStepSuccess({
      action: plan.action,
      placement: summarizePlacement(plan.placement),
      revision: {
        before: beforeRevision,
        after: afterInfo.revision,
        unchanged: beforeRevision === afterInfo.revision,
      },
      breakType: plan.breakType,
      sectionId: beforeRevision === afterInfo.revision ? 'section-break-fallback' : 'section-break-created',
      breakParagraphNodeId: sectionResult.breakParagraph?.nodeId,
    });
  }

  return workflowStepSuccess({
    action: plan.action,
    placement: summarizePlacement(plan.placement),
    revision: {
      before: beforeRevision,
      after: afterInfo.revision,
      unchanged: beforeRevision === afterInfo.revision,
    },
    breakType: plan.breakType,
    sectionId,
    breakParagraphNodeId: sectionResult.breakParagraph?.nodeId,
  });
}

function findBlockOrdinalByNodeId(
  index: Awaited<ReturnType<typeof buildWorkflowDocIndex>>,
  nodeId: string | undefined,
): number | undefined {
  if (nodeId == null) {
    return undefined;
  }
  return index.blocks.find((block) => block.nodeId === nodeId)?.ordinal;
}

function findTargetBlockOrdinal(
  index: Awaited<ReturnType<typeof buildWorkflowDocIndex>>,
  target: WorkflowResolvedTarget,
): number | undefined {
  if (target.entity.kind === 'table') {
    return index.tables.find((table) => table.nodeId === target.entity.nodeId)?.blockOrdinal;
  }

  if (target.entity.kind === 'listItem') {
    return undefined;
  }

  return index.blocks.find((block) => block.nodeId === target.entity.nodeId)?.ordinal;
}

function verifyTocPlacement(input: {
  postIndex: Awaited<ReturnType<typeof buildWorkflowDocIndex>>;
  placement: SuperdocStructureInsertPlacement;
  tocNodeId: string;
  titleNodeId?: string;
}): {
  placementVerified: boolean;
  placementSatisfied: boolean;
  tocOrdinal?: number;
  titleOrdinal?: number;
  targetOrdinal?: number;
} {
  const tocOrdinal = findBlockOrdinalByNodeId(input.postIndex, input.tocNodeId);
  const titleOrdinal = findBlockOrdinalByNodeId(input.postIndex, input.titleNodeId);
  if (tocOrdinal == null) {
    return {
      placementVerified: true,
      placementSatisfied: false,
      tocOrdinal,
      titleOrdinal,
    };
  }

  if (input.placement.mode === 'document') {
    const blockCount = input.postIndex.blocks.length;
    const placementSatisfied =
      input.placement.at === 'document_start'
        ? input.titleNodeId == null
          ? tocOrdinal === 0
          : titleOrdinal === 0 && tocOrdinal === 1
        : input.titleNodeId == null
          ? tocOrdinal === blockCount - 1
          : titleOrdinal === blockCount - 2 && tocOrdinal === blockCount - 1;

    return {
      placementVerified: true,
      placementSatisfied,
      tocOrdinal,
      titleOrdinal,
    };
  }

  const targetOrdinal = findTargetBlockOrdinal(input.postIndex, input.placement.target);
  if (targetOrdinal == null) {
    return {
      placementVerified: false,
      placementSatisfied: true,
      tocOrdinal,
      titleOrdinal,
      targetOrdinal,
    };
  }

  const placementSatisfied =
    input.placement.position === 'before'
      ? input.titleNodeId == null
        ? tocOrdinal < targetOrdinal
        : titleOrdinal != null && titleOrdinal < tocOrdinal && tocOrdinal < targetOrdinal
      : input.titleNodeId == null
        ? tocOrdinal > targetOrdinal
        : titleOrdinal != null && targetOrdinal < titleOrdinal && titleOrdinal < tocOrdinal;

  return {
    placementVerified: true,
    placementSatisfied,
    tocOrdinal,
    titleOrdinal,
    targetOrdinal,
  };
}

async function verifyTocStep(
  context: WorkflowEngineContext,
  resolved: SuperdocStructureInsertResolvedToc,
  execution: SuperdocStructureInsertExecutionToc,
): Promise<WorkflowStepResult<SuperdocStructureInsertVerification>> {
  const postIndex = await buildWorkflowDocIndex({
    documentHandle: context.documentHandle,
    documentKey: context.sessionState.documentKey,
    invokeOptions: context.invokeOptions,
  });

  const tocPresent = postIndex.blocks.some(
    (block) => block.nodeId === execution.tocNodeId && block.nodeType === 'tableOfContents',
  );
  const titleProvided = resolved.title != null;
  const titlePresent = titleProvided
    ? postIndex.blocks.some((block) => block.nodeId === execution.titleNodeId)
    : undefined;
  const placement = verifyTocPlacement({
    postIndex,
    placement: resolved.placement,
    tocNodeId: execution.tocNodeId,
    titleNodeId: execution.titleNodeId,
  });
  const revisionChanged = execution.revision.before !== execution.revision.after;
  const passed = tocPresent && (titlePresent ?? true) && placement.placementSatisfied && revisionChanged;
  const summary = `insert_toc checks tocPresent=${tocPresent}; titlePresent=${titlePresent ?? 'n/a'}; placementSatisfied=${placement.placementSatisfied}; revisionChanged=${revisionChanged}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_STRUCTURE_INSERT_VERIFICATION_FAILED',
      message: 'insert_toc verification failed.',
      details: {
        summary,
        tocPresent,
        titlePresent,
        placementSatisfied: placement.placementSatisfied,
        placementVerified: placement.placementVerified,
        revisionChanged,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    passed,
    summary,
    checks: {
      tocPresent,
      titleProvided,
      titlePresent,
      placementVerified: placement.placementVerified,
      placementSatisfied: placement.placementSatisfied,
      revisionChanged,
      tocOrdinal: placement.tocOrdinal,
      titleOrdinal: placement.titleOrdinal,
      targetOrdinal: placement.targetOrdinal,
    },
  });
}

async function verifySectionBreakStep(
  context: WorkflowEngineContext,
  execution: SuperdocStructureInsertExecutionSectionBreak,
): Promise<WorkflowStepResult<SuperdocStructureInsertVerification>> {
  const postIndex = await buildWorkflowDocIndex({
    documentHandle: context.documentHandle,
    documentKey: context.sessionState.documentKey,
    invokeOptions: context.invokeOptions,
  });

  const sectionCreated = execution.sectionId.length > 0;
  const usedFallback = execution.sectionId === 'section-break-fallback';
  const revisionChanged = execution.revision.before !== execution.revision.after;
  const breakParagraphPresent =
    execution.breakParagraphNodeId == null
      ? undefined
      : postIndex.blocks.some((block) => block.nodeId === execution.breakParagraphNodeId);
  const passed = sectionCreated && (usedFallback || revisionChanged) && (breakParagraphPresent ?? true);
  const summary = `insert_section_break checks sectionCreated=${sectionCreated}; usedFallback=${usedFallback}; revisionChanged=${revisionChanged}; breakParagraphPresent=${breakParagraphPresent ?? 'n/a'}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_STRUCTURE_INSERT_VERIFICATION_FAILED',
      message: 'insert_section_break verification failed.',
      details: {
        summary,
        sectionCreated,
        usedFallback,
        revisionChanged,
        breakParagraphPresent,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    passed,
    summary,
    checks: {
      sectionCreated,
      usedFallback,
      revisionChanged,
      breakType: execution.breakType,
      breakParagraphPresent,
    },
  });
}

async function verifyParagraphStep(
  context: WorkflowEngineContext,
  resolved: SuperdocStructureInsertResolvedParagraph,
  execution: SuperdocStructureInsertExecutionParagraph,
): Promise<WorkflowStepResult<SuperdocStructureInsertVerification>> {
  const postIndex = await buildWorkflowDocIndex({
    documentHandle: context.documentHandle,
    documentKey: context.sessionState.documentKey,
    invokeOptions: context.invokeOptions,
  });

  const currentText = await context.documentHandle.getText({}, context.invokeOptions);
  const paragraphPresent = postIndex.blocks.some(
    (block) => block.nodeId === execution.paragraphNodeId && block.nodeType === 'paragraph',
  );
  const textPresent = currentText.includes(resolved.text);
  const revisionChanged = execution.revision.before !== execution.revision.after;
  const passed = paragraphPresent && textPresent && revisionChanged;
  const summary = `insert_paragraph checks paragraphPresent=${paragraphPresent}; textPresent=${textPresent}; changeMode=${execution.changeMode}; revisionChanged=${revisionChanged}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_STRUCTURE_INSERT_VERIFICATION_FAILED',
      message: 'insert_paragraph verification failed.',
      details: {
        summary,
        paragraphPresent,
        textPresent,
        revisionChanged,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    passed,
    summary,
    checks: {
      paragraphPresent,
      textPresent,
      changeMode: execution.changeMode,
      revisionChanged,
    },
  });
}

async function verifyParagraphsStep(
  context: WorkflowEngineContext,
  resolved: SuperdocStructureInsertResolvedParagraphs,
  execution: SuperdocStructureInsertExecutionParagraphs,
): Promise<WorkflowStepResult<SuperdocStructureInsertVerification>> {
  const postIndex = await buildWorkflowDocIndex({
    documentHandle: context.documentHandle,
    documentKey: context.sessionState.documentKey,
    invokeOptions: context.invokeOptions,
  });

  const currentText = await context.documentHandle.getText({}, context.invokeOptions);
  const presentNodeIds = new Set(postIndex.blocks.map((block) => block.nodeId));
  const paragraphsPresent =
    execution.paragraphNodeIds.length === resolved.texts.length &&
    execution.paragraphNodeIds.every((nodeId) => presentNodeIds.has(nodeId));
  const firstBlock = postIndex.blocks.find((block) => block.nodeId === execution.paragraphNodeIds[0]);
  const headingSatisfied =
    resolved.headingLevel == null
      ? true
      : firstBlock?.nodeType === 'heading' && firstBlock.headingLevel === resolved.headingLevel;
  const textsPresent = resolved.texts.every((text) => currentText.includes(text));
  const revisionChanged = execution.revision.before !== execution.revision.after;
  const passed = paragraphsPresent && headingSatisfied && textsPresent && revisionChanged;
  const summary = `insert_paragraphs checks paragraphsPresent=${paragraphsPresent}; headingSatisfied=${headingSatisfied}; textsPresent=${textsPresent}; changeMode=${execution.changeMode}; revisionChanged=${revisionChanged}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_STRUCTURE_INSERT_VERIFICATION_FAILED',
      message: 'insert_paragraphs verification failed.',
      details: {
        summary,
        paragraphsPresent,
        headingSatisfied,
        textsPresent,
        revisionChanged,
        expectedParagraphs: resolved.texts.length,
        actualParagraphs: execution.paragraphNodeIds.length,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    passed,
    summary,
    checks: {
      paragraphsPresent,
      headingSatisfied,
      textsPresent,
      revisionChanged,
      paragraphCount: execution.paragraphNodeIds.length,
      changeMode: execution.changeMode,
    },
  });
}

async function verifyMoveRangeStep(
  context: WorkflowEngineContext,
  execution: SuperdocStructureInsertExecutionMoveRange,
): Promise<WorkflowStepResult<SuperdocStructureInsertVerification>> {
  const blocks = await listAllBlocksForStructureMove(context.documentHandle, context.invokeOptions);
  const indexOf = (nodeId: string) => findBlockIndexByNodeId(blocks, nodeId);

  const insertedIndices = execution.insertedBlockNodeIds.map(indexOf);
  const insertedPresent = insertedIndices.length > 0 && insertedIndices.every((index) => index >= 0);
  // The recreated copies must remain contiguous and in order at the destination.
  const insertedContiguous =
    insertedPresent && insertedIndices.every((index, i) => i === 0 || index === insertedIndices[i - 1]! + 1);

  const anchorIndex = indexOf(execution.anchorNodeId);
  const firstInsertedIndex = insertedIndices[0] ?? -1;
  const orderSatisfied =
    !insertedPresent || anchorIndex < 0
      ? false
      : execution.position === 'after'
        ? firstInsertedIndex > anchorIndex
        : firstInsertedIndex < anchorIndex;

  const insertedCountSatisfied = execution.insertedBlockNodeIds.length === execution.movedBlockCount;
  const deletionSatisfied = execution.deletedCount >= execution.movedBlockCount;
  // A direct move physically removes the source; a tracked move keeps a struck
  // copy in the document, so only assert removal of the original ids in direct mode.
  const originalStartRemoved = indexOf(execution.startNodeId) < 0;
  const originalEndRemoved = indexOf(execution.endNodeId) < 0;
  const sourceRemoved = execution.changeMode === 'tracked' ? true : originalStartRemoved && originalEndRemoved;
  const revisionChanged = execution.revision.before !== execution.revision.after;

  const passed =
    insertedPresent &&
    insertedContiguous &&
    orderSatisfied &&
    insertedCountSatisfied &&
    deletionSatisfied &&
    sourceRemoved &&
    revisionChanged;
  const summary = `move_range checks insertedPresent=${insertedPresent}; insertedContiguous=${insertedContiguous}; orderSatisfied=${orderSatisfied}; insertedCountSatisfied=${insertedCountSatisfied}; deletionSatisfied=${deletionSatisfied}; sourceRemoved=${sourceRemoved}; revisionChanged=${revisionChanged}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_STRUCTURE_INSERT_VERIFICATION_FAILED',
      message: 'move_range verification failed.',
      details: {
        summary,
        insertedPresent,
        insertedContiguous,
        orderSatisfied,
        insertedCountSatisfied,
        deletionSatisfied,
        sourceRemoved,
        revisionChanged,
        startNodeId: execution.startNodeId,
        endNodeId: execution.endNodeId,
        anchorNodeId: execution.anchorNodeId,
        insertedBlockNodeIds: execution.insertedBlockNodeIds,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    passed,
    summary,
    checks: {
      insertedPresent,
      insertedContiguous,
      orderSatisfied,
      insertedCountSatisfied,
      deletionSatisfied,
      sourceRemoved,
      revisionChanged,
      position: execution.position,
      destinationExtendedToSectionEnd: execution.destinationExtendedToSectionEnd,
      anchorNodeId: execution.anchorNodeId,
      firstInsertedIndex,
      anchorIndex,
      movedBlockCount: execution.movedBlockCount,
      deletedCount: execution.deletedCount,
    },
  });
}

async function verifyStep(
  context: WorkflowEngineContext,
  resolved: SuperdocStructureInsertResolved,
  _plan: SuperdocStructureInsertPlan,
  execution: SuperdocStructureInsertExecution,
): Promise<WorkflowStepResult<SuperdocStructureInsertVerification>> {
  if (resolved.action === 'insert_toc' && execution.action === 'insert_toc') {
    return verifyTocStep(context, resolved, execution);
  }

  if (execution.action === 'insert_section_break') {
    return verifySectionBreakStep(context, execution);
  }

  if (resolved.action === 'insert_paragraph' && execution.action === 'insert_paragraph') {
    return verifyParagraphStep(context, resolved, execution);
  }

  if (resolved.action === 'insert_paragraphs' && execution.action === 'insert_paragraphs') {
    return verifyParagraphsStep(context, resolved, execution);
  }

  if (execution.action === 'move_range') {
    return verifyMoveRangeStep(context, execution);
  }

  return workflowStepFailure({
    status: 'failed',
    phase: 'verify',
    code: 'WORKFLOW_STRUCTURE_INSERT_VERIFICATION_FAILED',
    message: 'superdoc_structure_insert produced mismatched execution output.',
  });
}

export async function runSuperdocStructureInsertWorkflow(
  input: RunSuperdocStructureInsertInput,
): Promise<
  WorkflowEngineRunResult<
    SuperdocStructureInsertResolved,
    SuperdocStructureInsertPlan,
    SuperdocStructureInsertExecution,
    SuperdocStructureInsertVerification
  >
> {
  return runWorkflowEngine({
    documentHandle: input.documentHandle,
    toolName: 'superdoc_structure_insert',
    args: input.args,
    invokeOptions: input.invokeOptions,
    hooks: {
      resolve: async (context) => resolveStep(context),
      plan: async (context, resolved) => planStep(context, resolved),
      execute: async (context, resolved, plan) => executeStep(context, resolved, plan),
      verify: async (context, resolved, plan, execution) => verifyStep(context, resolved, plan, execution),
    },
  });
}

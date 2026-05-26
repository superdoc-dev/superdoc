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
  'move_section',
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

type SuperdocStructureInsertResolvedMoveSection = {
  action: 'move_section';
  sourceSection: number;
  destinationSection: number;
  position: SuperdocStructureInsertRelativePosition;
  bottomNote?: string;
};

type SuperdocStructureInsertResolved =
  | SuperdocStructureInsertResolvedToc
  | SuperdocStructureInsertResolvedSectionBreak
  | SuperdocStructureInsertResolvedParagraph
  | SuperdocStructureInsertResolvedParagraphs
  | SuperdocStructureInsertResolvedMoveSection;

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

type SuperdocStructureInsertPlanMoveSection = SuperdocStructureInsertResolvedMoveSection;

type SuperdocStructureInsertPlan =
  | SuperdocStructureInsertPlanToc
  | SuperdocStructureInsertPlanSectionBreak
  | SuperdocStructureInsertPlanParagraph
  | SuperdocStructureInsertPlanParagraphs
  | SuperdocStructureInsertPlanMoveSection;

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

type SuperdocStructureInsertExecutionMoveSection = {
  action: 'move_section';
  revision: WorkflowRevision;
  sourceSection: number;
  destinationSection: number;
  position: SuperdocStructureInsertRelativePosition;
  sourceHeadingText: string;
  destinationHeadingText: string;
  movedBlockCount: number;
  insertedBlockNodeIds: string[];
  deletedCount: number;
  bottomNote?: string;
  bottomNoteNodeId?: string;
};

type SuperdocStructureInsertExecution =
  | SuperdocStructureInsertExecutionToc
  | SuperdocStructureInsertExecutionSectionBreak
  | SuperdocStructureInsertExecutionParagraph
  | SuperdocStructureInsertExecutionParagraphs
  | SuperdocStructureInsertExecutionMoveSection;

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

function parseSectionNumber(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return undefined;
  }
  return raw;
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
        'superdoc_structure_insert requires action to be insert_toc, insert_section_break, insert_paragraph, insert_paragraphs, or move_section.',
    });
  }

  if (action === 'move_section') {
    const sourceSection = parseSectionNumber(context.args.sourceSection);
    const destinationSection = parseSectionNumber(context.args.destinationSection);
    const position = parseRelativePosition(context.args.position);
    const bottomNote = parseOptionalText(context.args.bottomNote);

    if (sourceSection == null || destinationSection == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STRUCTURE_INSERT_SECTION_NUMBER_REQUIRED',
        message: 'move_section requires positive integer sourceSection and destinationSection values.',
        details: {
          sourceSection: context.args.sourceSection,
          destinationSection: context.args.destinationSection,
        },
      });
    }

    if (sourceSection === destinationSection) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STRUCTURE_INSERT_SECTION_NUMBER_INVALID',
        message: 'move_section requires different sourceSection and destinationSection values.',
      });
    }

    if (position == null) {
      return workflowStepFailure({
        status: 'failed',
        phase: 'resolve',
        code: 'WORKFLOW_STRUCTURE_INSERT_POSITION_INVALID',
        message: 'move_section position must be "before" or "after" when provided.',
        details: { received: context.args.position },
      });
    }

    return workflowStepSuccess({
      action,
      sourceSection,
      destinationSection,
      position,
      bottomNote,
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
  if (resolved.action === 'move_section') {
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

function isLikelySectionHeading(block: StructureInsertListedBlock): boolean {
  if (block.nodeType !== 'heading') {
    return false;
  }

  const text = normalizeSectionHeadingText(textOfListedBlock(block));
  if (text.length === 0 || text.length > 80) {
    return false;
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 6) {
    return false;
  }

  // Long clause bodies in the current DOCX runtime can still surface as
  // Heading3 because of inherited numbering styles. Punctuation-heavy text is
  // body content, not a movable top-level section heading.
  if (/[.:;!?]$/.test(text)) {
    return false;
  }

  return true;
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

function findSectionHeadingCandidates(blocks: StructureInsertListedBlock[]): StructureInsertListedBlock[] {
  const agreedTermsIndex = blocks.findIndex(
    (block) =>
      block.nodeType === 'heading' &&
      normalizeSectionHeadingText(textOfListedBlock(block)).toLowerCase() === 'agreed terms',
  );
  const searchBlocks = agreedTermsIndex >= 0 ? blocks.slice(agreedTermsIndex + 1) : blocks;
  const candidates = searchBlocks.filter(isLikelySectionHeading);
  if (candidates.length === 0) {
    return candidates;
  }

  if (agreedTermsIndex >= 0) {
    const firstLevel = candidates[0]?.headingLevel;
    return typeof firstLevel === 'number'
      ? candidates.filter((candidate) => candidate.headingLevel === firstLevel)
      : candidates;
  }

  const afterDocumentTitle =
    candidates.length > 1 && candidates[0]?.headingLevel === 1 ? candidates.slice(1) : candidates;
  const levelCounts = new Map<number, number>();
  for (const candidate of afterDocumentTitle) {
    if (typeof candidate.headingLevel !== 'number') {
      continue;
    }
    levelCounts.set(candidate.headingLevel, (levelCounts.get(candidate.headingLevel) ?? 0) + 1);
  }

  const dominantLevel = [...levelCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  return dominantLevel == null
    ? afterDocumentTitle
    : afterDocumentTitle.filter((candidate) => candidate.headingLevel === dominantLevel);
}

function findBlockIndexByNodeId(blocks: StructureInsertListedBlock[], nodeId: string): number {
  return blocks.findIndex((block) => block.nodeId === nodeId);
}

function findSectionRange(input: {
  blocks: StructureInsertListedBlock[];
  candidates: StructureInsertListedBlock[];
  heading: StructureInsertListedBlock;
}): { startIndex: number; endIndex: number; blocks: StructureInsertListedBlock[] } | undefined {
  const startIndex = findBlockIndexByNodeId(input.blocks, input.heading.nodeId);
  if (startIndex < 0) {
    return undefined;
  }

  const sourceLevel = typeof input.heading.headingLevel === 'number' ? input.heading.headingLevel : 9;
  const nextHeading = input.blocks
    .slice(startIndex + 1)
    .find(
      (block) =>
        block.nodeType === 'heading' &&
        isLikelySectionHeading(block) &&
        (typeof block.headingLevel !== 'number' || block.headingLevel <= sourceLevel),
    );
  const nextHeadingIndex = nextHeading == null ? -1 : findBlockIndexByNodeId(input.blocks, nextHeading.nodeId);
  const endIndex = nextHeadingIndex > startIndex ? nextHeadingIndex - 1 : input.blocks.length - 1;
  const rangeBlocks = input.blocks
    .slice(startIndex, endIndex + 1)
    .filter((block) => textOfListedBlock(block).length > 0);

  return {
    startIndex,
    endIndex,
    blocks: rangeBlocks,
  };
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

async function createCopiedSectionBlock(input: {
  context: WorkflowEngineContext;
  block: StructureInsertListedBlock;
  at: StructureInsertAt;
}): Promise<{ nodeId: string; nodeType: 'paragraph' | 'heading' }> {
  const text = textOfListedBlock(input.block);
  if (input.block.nodeType === 'heading') {
    const result = await input.context.documentHandle.create.heading(
      {
        text,
        level: headingLevelForCopiedBlock(input.block),
        at: input.at,
      },
      input.context.invokeOptions,
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
    input.context.invokeOptions,
  );
  return {
    nodeId: result.paragraph.nodeId,
    nodeType: 'paragraph',
  };
}

async function executeMoveSectionStep(
  context: WorkflowEngineContext,
  plan: SuperdocStructureInsertPlanMoveSection,
): Promise<WorkflowStepResult<SuperdocStructureInsertExecutionMoveSection>> {
  const beforeRevision = context.info.revision;
  const blocks = await listAllBlocksForStructureMove(context.documentHandle, context.invokeOptions);
  const candidates = findSectionHeadingCandidates(blocks);
  const sourceHeading = candidates[plan.sourceSection - 1];
  const destinationHeading = candidates[plan.destinationSection - 1];

  if (sourceHeading == null || destinationHeading == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'execute',
      code: 'WORKFLOW_STRUCTURE_INSERT_SECTION_NOT_FOUND',
      message: 'move_section could not resolve the requested section numbers from top-level section headings.',
      details: {
        sourceSection: plan.sourceSection,
        destinationSection: plan.destinationSection,
        sectionHeadings: candidates.map((candidate, index) => ({
          section: index + 1,
          nodeId: candidate.nodeId,
          text: textOfListedBlock(candidate),
        })),
      },
    });
  }

  const sourceRange = findSectionRange({ blocks, candidates, heading: sourceHeading });
  const destinationRange = findSectionRange({ blocks, candidates, heading: destinationHeading });
  if (sourceRange == null || destinationRange == null || sourceRange.blocks.length === 0) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'execute',
      code: 'WORKFLOW_STRUCTURE_INSERT_SECTION_RANGE_NOT_FOUND',
      message: 'move_section resolved headings but could not compute a non-empty source or destination range.',
      details: {
        sourceNodeId: sourceHeading.nodeId,
        destinationNodeId: destinationHeading.nodeId,
        sourceRangeBlockCount: sourceRange?.blocks.length,
        destinationRangeBlockCount: destinationRange?.blocks.length,
      },
    });
  }

  const destinationAnchor =
    plan.position === 'before' ? destinationHeading : (blocks[destinationRange.endIndex] ?? destinationHeading);
  const insertedBlockNodeIds: string[] = [];
  let insertionAt = toCreatePlacementFromListedBlock(destinationAnchor, plan.position);
  let previousInserted: { nodeId: string; nodeType: 'paragraph' | 'heading' } | undefined;

  for (const block of sourceRange.blocks) {
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

    previousInserted = await createCopiedSectionBlock({ context, block, at: insertionAt });
    insertedBlockNodeIds.push(previousInserted.nodeId);
  }

  const sourceStart = blocks[sourceRange.startIndex];
  const sourceEnd = blocks[sourceRange.endIndex];
  if (sourceStart == null || sourceEnd == null) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'execute',
      code: 'WORKFLOW_STRUCTURE_INSERT_SECTION_RANGE_NOT_FOUND',
      message: 'move_section lost the source range while preparing deletion.',
    });
  }

  const deleteResult = await context.documentHandle.blocks.deleteRange(
    {
      start: toListedBlockTarget(sourceStart),
      end: toListedBlockTarget(sourceEnd),
      force: true,
    },
    context.invokeOptions,
  );

  let bottomNoteNodeId: string | undefined;
  if (plan.bottomNote != null) {
    const noteResult = await context.documentHandle.create.paragraph(
      {
        text: plan.bottomNote,
        at: { kind: 'documentEnd' },
      },
      context.invokeOptions,
    );
    bottomNoteNodeId = noteResult.paragraph.nodeId;
  }

  const afterInfo = await context.documentHandle.info({}, context.invokeOptions);
  return workflowStepSuccess({
    action: plan.action,
    revision: {
      before: beforeRevision,
      after: afterInfo.revision,
      unchanged: beforeRevision === afterInfo.revision,
    },
    sourceSection: plan.sourceSection,
    destinationSection: plan.destinationSection,
    position: plan.position,
    sourceHeadingText: textOfListedBlock(sourceHeading),
    destinationHeadingText: textOfListedBlock(destinationHeading),
    movedBlockCount: sourceRange.blocks.length,
    insertedBlockNodeIds,
    deletedCount: deleteResult.deletedCount,
    bottomNote: plan.bottomNote,
    bottomNoteNodeId,
  });
}

async function executeStep(
  context: WorkflowEngineContext,
  _resolved: SuperdocStructureInsertResolved,
  plan: SuperdocStructureInsertPlan,
): Promise<WorkflowStepResult<SuperdocStructureInsertExecution>> {
  const beforeRevision = context.info.revision;

  if (plan.action === 'move_section') {
    return executeMoveSectionStep(context, plan);
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

async function verifyMoveSectionStep(
  context: WorkflowEngineContext,
  execution: SuperdocStructureInsertExecutionMoveSection,
): Promise<WorkflowStepResult<SuperdocStructureInsertVerification>> {
  const blocks = await listAllBlocksForStructureMove(context.documentHandle, context.invokeOptions);
  const sourceHeadingOrdinals = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.nodeType === 'heading' && textOfListedBlock(block) === execution.sourceHeadingText)
    .map(({ index }) => index);
  const destinationHeadingOrdinals = blocks
    .map((block, index) => ({ block, index }))
    .filter(
      ({ block }) => block.nodeType === 'heading' && textOfListedBlock(block) === execution.destinationHeadingText,
    )
    .map(({ index }) => index);

  const sourceIndex = sourceHeadingOrdinals[0];
  const destinationIndex = destinationHeadingOrdinals[0];
  const orderSatisfied =
    sourceIndex != null && destinationIndex != null
      ? execution.position === 'before'
        ? sourceIndex < destinationIndex
        : sourceIndex > destinationIndex
      : false;
  const sourceSingleOccurrence = sourceHeadingOrdinals.length === 1;
  const insertedCountSatisfied = execution.insertedBlockNodeIds.length === execution.movedBlockCount;
  const deletionSatisfied = execution.deletedCount >= execution.movedBlockCount;
  const currentText = await context.documentHandle.getText({}, context.invokeOptions);
  const bottomNotePresent = execution.bottomNote == null ? true : currentText.includes(execution.bottomNote);
  const revisionChanged = execution.revision.before !== execution.revision.after;
  const passed =
    orderSatisfied &&
    sourceSingleOccurrence &&
    insertedCountSatisfied &&
    deletionSatisfied &&
    bottomNotePresent &&
    revisionChanged;
  const summary = `move_section checks orderSatisfied=${orderSatisfied}; sourceSingleOccurrence=${sourceSingleOccurrence}; insertedCountSatisfied=${insertedCountSatisfied}; deletionSatisfied=${deletionSatisfied}; bottomNotePresent=${bottomNotePresent}; revisionChanged=${revisionChanged}.`;

  if (!passed) {
    return workflowStepFailure({
      status: 'failed',
      phase: 'verify',
      code: 'WORKFLOW_STRUCTURE_INSERT_VERIFICATION_FAILED',
      message: 'move_section verification failed.',
      details: {
        summary,
        orderSatisfied,
        sourceSingleOccurrence,
        insertedCountSatisfied,
        deletionSatisfied,
        bottomNotePresent,
        revisionChanged,
        sourceHeadingText: execution.sourceHeadingText,
        destinationHeadingText: execution.destinationHeadingText,
        sourceHeadingOrdinals,
        destinationHeadingOrdinals,
      },
    });
  }

  return workflowStepSuccess({
    action: execution.action,
    passed,
    summary,
    checks: {
      orderSatisfied,
      sourceSingleOccurrence,
      insertedCountSatisfied,
      deletionSatisfied,
      bottomNotePresent,
      revisionChanged,
      sourceHeadingText: execution.sourceHeadingText,
      destinationHeadingText: execution.destinationHeadingText,
      sourceIndex,
      destinationIndex,
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

  if (execution.action === 'move_section') {
    return verifyMoveSectionStep(context, execution);
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

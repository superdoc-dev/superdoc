import type { ToolRouter } from '../types.js';
import { routeRead } from './read.js';
import { routeFind } from './find.js';
import { routeEdit } from './edit.js';
import { routeCreate } from './create.js';
import { routeFormat } from './format.js';
import { routeTable } from './table.js';
import { routeList } from './list.js';
import { routeImage } from './image.js';
import { routeComment } from './comment.js';
import { routeReview } from './review.js';
import { routeSection } from './section.js';
import { routeReference } from './reference.js';
import { routeControl } from './control.js';

export {
  routeRead,
  routeFind,
  routeEdit,
  routeCreate,
  routeFormat,
  routeTable,
  routeList,
  routeImage,
  routeComment,
  routeReview,
  routeSection,
  routeReference,
  routeControl,
};

/** Map of tool name → router function. */
export const ROUTERS: Record<string, ToolRouter> = {
  superdoc_read: routeRead,
  superdoc_find: routeFind,
  superdoc_edit: routeEdit,
  superdoc_create: routeCreate,
  superdoc_format: routeFormat,
  superdoc_table: routeTable,
  superdoc_list: routeList,
  superdoc_image: routeImage,
  superdoc_comment: routeComment,
  superdoc_review: routeReview,
  superdoc_section: routeSection,
  superdoc_reference: routeReference,
  superdoc_control: routeControl,
};

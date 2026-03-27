import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import {
  commentRangeStartTranslator,
  commentRangeEndTranslator,
} from '../../v3/handlers/w/commentRange/comment-range-translator.js';

export const commentRangeStartHandlerEntity = generateV2HandlerEntity(
  'commentRangeStartHandler',
  commentRangeStartTranslator,
);

export const commentRangeEndHandlerEntity = generateV2HandlerEntity(
  'commentRangeEndHandler',
  commentRangeEndTranslator,
);

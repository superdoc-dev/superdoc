import { EditorState, TextSelection } from 'prosemirror-state';
import { testSchema } from './test-schema.js';

export const createState = (doc) => EditorState.create({ schema: testSchema, doc });

export const setSelection = (state, pos, end = pos) => {
  const $from = state.doc.resolve(pos);
  const $to = state.doc.resolve(end);
  const selection = new TextSelection($from, $to);
  return state.tr.setSelection(selection);
};

export const createDispatch = () => {
  const dispatched = [];
  const dispatch = (tr) => dispatched.push(tr);
  return { dispatch, dispatched };
};

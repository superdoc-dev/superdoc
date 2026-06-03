/**
 * Consumer typecheck: CommonJS require() entry points.
 *
 * These three subpaths advertise CJS runtime conditions in package.json. Under
 * moduleResolution node16/nodenext, TypeScript must resolve them to `.d.cts`
 * declarations so CommonJS consumers do not hit TS1471/TS1541.
 */

import superdoc = require('superdoc');
import superdocTypes = require('superdoc/types');
import superEditor = require('superdoc/super-editor');

import type { NodeName } from 'superdoc/types';

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertNotAny<T> = IsAny<T> extends true ? never : true;

const _rootIsTyped: AssertNotAny<typeof superdoc> = true;
const _typesEntryIsTyped: AssertNotAny<typeof superdocTypes> = true;
const _superEditorIsTyped: AssertNotAny<typeof superEditor> = true;
const _nodeNameIsTyped: AssertNotAny<NodeName> = true;

const _SuperDoc: AssertNotAny<typeof superdoc.SuperDoc> = true;
const _createTheme: AssertNotAny<typeof superdoc.createTheme> = true;
const _Editor: AssertNotAny<typeof superEditor.Editor> = true;

const _instance = new superdoc.SuperDoc({
  selector: '#editor',
});

void _rootIsTyped;
void _typesEntryIsTyped;
void _superEditorIsTyped;
void _nodeNameIsTyped;
void _SuperDoc;
void _createTheme;
void _Editor;
void _instance;

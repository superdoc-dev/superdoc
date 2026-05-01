/**
 * Consumer typecheck: "superdoc/ui/react" sub-export.
 *
 * Official React bindings for the `createSuperDocUI` controller. The
 * fixture imports the provider, the lifecycle context hook, and the
 * domain hooks (selection, comments, track changes, toolbar, command,
 * document) and asserts each value-level export keeps its real type.
 *
 * This fixture is type-only: it does not render JSX. Rendering would
 * pull in a JSX runtime, which is unrelated to the type-contract gate.
 */
import {
  SuperDocUIProvider,
  useSuperDocUI,
  useSuperDocHost,
  useSetSuperDoc,
  useSuperDocSlice,
  useSuperDocSelection,
  useSuperDocComments,
  useSuperDocTrackChanges,
  useSuperDocToolbar,
  useSuperDocCommand,
  useSuperDocDocument,
} from 'superdoc/ui/react';
import type { SuperDocHost } from 'superdoc/ui/react';

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertNotAny<T> = IsAny<T> extends true ? never : true;

const _real_SuperDocUIProvider: AssertNotAny<typeof SuperDocUIProvider> = true;
const _real_useSuperDocUI: AssertNotAny<typeof useSuperDocUI> = true;
const _real_useSuperDocHost: AssertNotAny<typeof useSuperDocHost> = true;
const _real_useSetSuperDoc: AssertNotAny<typeof useSetSuperDoc> = true;
const _real_useSuperDocSlice: AssertNotAny<typeof useSuperDocSlice> = true;
const _real_useSuperDocSelection: AssertNotAny<typeof useSuperDocSelection> = true;
const _real_useSuperDocComments: AssertNotAny<typeof useSuperDocComments> = true;
const _real_useSuperDocTrackChanges: AssertNotAny<typeof useSuperDocTrackChanges> = true;
const _real_useSuperDocToolbar: AssertNotAny<typeof useSuperDocToolbar> = true;
const _real_useSuperDocCommand: AssertNotAny<typeof useSuperDocCommand> = true;
const _real_useSuperDocDocument: AssertNotAny<typeof useSuperDocDocument> = true;

const _real_SuperDocHost: AssertNotAny<SuperDocHost> = true;

void _real_SuperDocUIProvider;
void _real_useSuperDocUI;
void _real_useSuperDocHost;
void _real_useSetSuperDoc;
void _real_useSuperDocSlice;
void _real_useSuperDocSelection;
void _real_useSuperDocComments;
void _real_useSuperDocTrackChanges;
void _real_useSuperDocToolbar;
void _real_useSuperDocCommand;
void _real_useSuperDocDocument;
void _real_SuperDocHost;

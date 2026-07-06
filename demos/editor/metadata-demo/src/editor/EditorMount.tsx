import { useEffect, useState, useRef, useMemo } from 'react';
import { SuperDocEditor } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';
import { useSetSuperDoc } from 'superdoc/ui/react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';

const ADJECTIVES = ['Swift', 'Clever', 'Brave', 'Happy', 'Calm', 'Bold', 'Bright', 'Gentle', 'Lucky', 'Wise'];
const ANIMALS = ['Panda', 'Fox', 'Eagle', 'Wolf', 'Otter', 'Hawk', 'Bear', 'Owl', 'Tiger', 'Dolphin'];

function getOrCreateUser() {
  const stored = sessionStorage.getItem('demo-user');
  if (stored) {
    return JSON.parse(stored);
  }
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const id = Math.random().toString(36).substring(2, 8);
  const name = `${adj} ${animal}`;
  const email = `${adj.toLowerCase()}.${animal.toLowerCase()}.${id}@example.com`;
  const user = { name, email };
  sessionStorage.setItem('demo-user', JSON.stringify(user));
  return user;
}

const CURRENT_USER = getOrCreateUser();

// Telemetry opt-out is the default the example demonstrates.
const TELEMETRY = { enabled: false as const };

interface CollabConfig {
  room: string;
  websocketUrl: string;
}

interface EditorMountProps {
  document?: string | File;
  collaboration?: CollabConfig;
}

// Non-collab editor - simple case
function NonCollabEditor({ documentSource, setSuperDoc }: { documentSource: string | File; setSuperDoc: (sd: unknown) => void }) {
  const modules = useMemo(() => ({
    trackChanges: { replacements: 'independent' as const },
  }), []);

  return (
    <SuperDocEditor
      document={documentSource}
      documentMode="editing"
      user={CURRENT_USER}
      modules={modules}
      telemetry={TELEMETRY}
      hideToolbar
      contained
      disableContextMenu
      style={{ height: '100%' }}
      onReady={({ superdoc }: { superdoc: unknown }) => setSuperDoc(superdoc)}
    />
  );
}

// Check if ydoc has existing SuperDoc content
function hasSuperDocContent(ydoc: Y.Doc) {
  return (
    ydoc.getXmlFragment('supereditor').length > 0 ||
    ydoc.getMap('parts').size > 0 ||
    ydoc.getMap('meta').has('docx')
  );
}

// Collab editor - manages ydoc/provider lifecycle
function CollabEditor({ documentSource, collaboration, setSuperDoc }: {
  documentSource: string | File;
  collaboration: CollabConfig;
  setSuperDoc: (sd: unknown) => void;
}) {
  const [synced, setSynced] = useState(false);
  const [modules, setModules] = useState<object | null>(null);
  const [seedDocument, setSeedDocument] = useState<object | undefined>(undefined);

  useEffect(() => {
    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: collaboration.websocketUrl,
      name: collaboration.room,
      document: ydoc,
    });

    const handleSynced = () => {
      // Only load the seed document if the room is empty
      const hasContent = hasSuperDocContent(ydoc);
      if (!hasContent) {
        const url = typeof documentSource === 'string' ? documentSource : URL.createObjectURL(documentSource);
        const name = typeof documentSource === 'string' ? documentSource.split('/').pop() || 'document.docx' : documentSource.name;
        setSeedDocument({
          id: collaboration.room,
          type: 'docx',
          url,
          name,
          isNewFile: true,
        });
      }
      setModules({
        trackChanges: { replacements: 'independent' as const },
        collaboration: { ydoc, provider },
      });
      setSynced(true);
    };

    provider.on('synced', handleSynced);

    return () => {
      provider.off('synced', handleSynced);
      provider.destroy();
      ydoc.destroy();
    };
  }, [collaboration.websocketUrl, collaboration.room, documentSource]);

  if (!synced || !modules) {
    return <div style={{ padding: 20 }}>Connecting to collaboration server...</div>;
  }

  return (
    <SuperDocEditor
      document={seedDocument}
      documentMode="editing"
      user={CURRENT_USER}
      modules={modules}
      telemetry={TELEMETRY}
      hideToolbar
      contained
      disableContextMenu
      style={{ height: '100%' }}
      onReady={({ superdoc }: { superdoc: unknown }) => setSuperDoc(superdoc)}
    />
  );
}

/**
 * Mounts `<SuperDocEditor>` and hands the running SuperDoc instance to
 * the {@link SuperDocUIProvider} once `onReady` fires.
 */
export function EditorMount({ document: documentSource = '/sample-review.docx', collaboration }: EditorMountProps) {
  const setSuperDoc = useSetSuperDoc();

  if (collaboration) {
    return <CollabEditor documentSource={documentSource} collaboration={collaboration} setSuperDoc={setSuperDoc} />;
  }

  return <NonCollabEditor documentSource={documentSource} setSuperDoc={setSuperDoc} />;
}

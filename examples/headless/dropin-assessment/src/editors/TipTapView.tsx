import { useEffect, useMemo, useRef } from 'react';
import { TipTapAdapter } from '../adapters/TipTapAdapter';
import { Toolbar } from '../ui/Toolbar';
import { CommentsSidebar } from '../ui/CommentsSidebar';

export function TipTapView() {
  const adapter = useMemo(() => new TipTapAdapter(), []);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hostRef.current) adapter.mount(hostRef.current);
    return () => adapter.destroy();
  }, [adapter]);

  return (
    <>
      <Toolbar adapter={adapter} />
      <div className="body">
        <div className="doc-host">
          <div className="doc-surface" ref={hostRef} />
        </div>
        <CommentsSidebar adapter={adapter} currentAuthorId="alex" />
      </div>
    </>
  );
}

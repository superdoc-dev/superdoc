type DocumentPreviewProps = {
  label?: string;
  selection?: boolean;
  trackedChanges?: boolean;
};

export function DocumentPreview({
  label = 'Document preview',
  selection = false,
  trackedChanges = false,
}: DocumentPreviewProps) {
  return (
    <figure className='sd-document-frame' aria-label={label} role='img'>
      <div className='sd-document-page'>
        <div className='sd-document-heading'>Services agreement</div>
        <div className='sd-document-rule' />
        <p>
          This agreement describes the services and delivery terms for the project. Each party will keep a complete copy
          of the signed document.
        </p>
        <p>
          The review period is{' '}
          {selection ? <mark className='sd-document-selection'>ten business days</mark> : 'ten business days'}. Written
          feedback must identify the section that needs revision.
        </p>
        <p>
          Changes take effect on{' '}
          {trackedChanges ? (
            <>
              <del className='sd-document-deletion'>June 1</del> <ins className='sd-document-insertion'>July 1</ins>
            </>
          ) : (
            'July 1'
          )}
          . All other terms remain unchanged.
        </p>
        <div className='sd-document-signatures' aria-hidden='true'>
          <span />
          <span />
        </div>
      </div>
    </figure>
  );
}

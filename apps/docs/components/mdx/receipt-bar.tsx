type ReceiptBarProps = {
  detail: string;
  operation: string;
};

export function ReceiptBar({ detail, operation }: ReceiptBarProps) {
  return (
    <dl className='sd-receipt-bar' aria-label={`${operation} operation receipt`}>
      <div className='sd-receipt-status'>
        <dt>Status</dt>
        <dd>applied</dd>
      </div>
      <div>
        <dt>Operation</dt>
        <dd>{operation}</dd>
      </div>
      <div className='sd-receipt-detail'>
        <dt>Detail</dt>
        <dd>{detail}</dd>
      </div>
    </dl>
  );
}

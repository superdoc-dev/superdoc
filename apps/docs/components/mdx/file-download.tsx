type FileDownloadProps = {
  description: string;
  fileType: string;
  href: string;
  label: string;
};

export function FileDownload({ description, fileType, href, label }: FileDownloadProps) {
  return (
    <a className='sd-file-download' href={href} download>
      <span className='sd-file-download-icon' aria-hidden='true'>
        ↓
      </span>
      <span className='sd-file-download-copy'>
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
      <span className='sd-file-download-type'>{fileType}</span>
    </a>
  );
}

export const SourceCodeLink = ({ extension, path }) => {
  // Default to standard extension path if no custom path provided
  const githubPath = path || `packages/super-editor/src/extensions/${extension.toLowerCase()}`;
  const githubUrl = `https://github.com/Harbour-Enterprises/SuperDoc/tree/main/${githubPath}`;

  return (
    <div>
      <p>
        <a href={githubUrl} target='_blank' rel='noopener noreferrer'>
          View on GitHub →
        </a>
      </p>
    </div>
  );
};

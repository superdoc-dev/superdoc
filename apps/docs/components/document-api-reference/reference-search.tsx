'use client';

import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReferenceGroup, ReferenceOperationSummary } from '@/lib/document-api-reference/types';
import { referenceUrl } from '@/lib/document-api-reference/urls';

export function ReferenceSearch({
  groups,
  operations,
}: {
  groups: ReferenceGroup[];
  operations: ReferenceOperationSummary[];
}) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!normalized) return [];
    return operations.filter((operation) =>
      [operation.operationId, operation.memberPath, operation.description, operation.groupKey]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [normalized, operations]);
  const results = matches.slice(0, 40);

  return (
    <div className='sd-docapi-search-region'>
      <label className='sd-docapi-search'>
        <Search aria-hidden='true' size={17} />
        <span className='sr-only'>Search Document API operations</span>
        <input
          type='search'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder='Search operation names, paths, and descriptions…'
        />
      </label>
      {normalized ? (
        <div className='sd-docapi-search-results'>
          <p aria-live='polite'>
            {matches.length === 0
              ? 'No matching operations.'
              : matches.length > results.length
                ? `Showing ${results.length} of ${matches.length} matching operations.`
                : `${matches.length} matching operation${matches.length === 1 ? '' : 's'}.`}
          </p>
          {results.map((operation) => (
            <a key={operation.operationId} href={referenceUrl(operation.path)} className='sd-docapi-operation-row'>
              <code>{operation.operationId}</code>
              <span>{operation.description}</span>
              <OperationFlags operation={operation} />
            </a>
          ))}
        </div>
      ) : (
        <div className='sd-docapi-namespace-grid'>
          {groups.map((group) => (
            <a key={group.key} href={referenceUrl(group.path)} className='sd-docapi-namespace-card'>
              <span>
                <code>{group.key}</code>
                <small>{group.operationIds.length}</small>
              </span>
              <p>{group.description}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function NamespaceOperations({
  operations,
  jobs,
}: {
  operations: ReferenceOperationSummary[];
  jobs?: Array<{ id: string; title: string; operationIds: string[] }>;
}) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const visible = new Set(
    operations
      .filter((operation) =>
        [operation.operationId, operation.memberPath, operation.description]
          .join(' ')
          .toLowerCase()
          .includes(normalized),
      )
      .map((operation) => operation.operationId),
  );
  const byId = new Map(operations.map((operation) => [operation.operationId, operation]));
  const sections = jobs ?? [
    { id: 'operations', title: 'Operations', operationIds: operations.map((operation) => operation.operationId) },
  ];

  return (
    <div className='sd-docapi-namespace-operations'>
      <label className='sd-docapi-filter'>
        <Search aria-hidden='true' size={15} />
        <span className='sr-only'>Filter operations in this namespace</span>
        <input
          type='search'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder='Filter operations…'
        />
      </label>
      {sections.map((section) => {
        const sectionOperations = section.operationIds.flatMap((operationId) => {
          const operation = byId.get(operationId);
          return operation && visible.has(operationId) ? [operation] : [];
        });
        if (sectionOperations.length === 0) return null;
        return (
          <section key={section.id} className='sd-docapi-job'>
            <h2>{section.title}</h2>
            <div>
              {sectionOperations.map((operation) => (
                <a key={operation.operationId} href={referenceUrl(operation.path)} className='sd-docapi-operation-row'>
                  <code>{operation.operationId}</code>
                  <span>{operation.description}</span>
                  <OperationFlags operation={operation} />
                </a>
              ))}
            </div>
          </section>
        );
      })}
      {visible.size === 0 ? <p className='sd-docapi-empty'>No matching operations.</p> : null}
    </div>
  );
}

function OperationFlags({ operation }: { operation: ReferenceOperationSummary }) {
  return (
    <span className='sd-docapi-flags' aria-label='Operation behavior'>
      <small data-kind={operation.metadata.mutates ? 'mutates' : 'reads'}>
        {operation.metadata.mutates ? 'mutates' : 'read'}
      </small>
      {operation.metadata.supportsTrackedMode ? <small data-kind='tracked'>tracked</small> : null}
    </span>
  );
}

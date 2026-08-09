import type { ReactNode } from 'react';
import { CopyButton } from './copy-button';
import { NamespaceOperations, ReferenceSearch } from './reference-search';
import { featuredInputFields, getNamespaceJobs, relatedOperations } from '@/lib/document-api-reference/curation';
import {
  getGroupOperations,
  getOperationSummaries,
  getReferenceExample,
  getReferenceGroup,
  getReferenceModel,
  getReferenceOperation,
} from '@/lib/document-api-reference/model';
import {
  schemaDescription,
  schemaProperties,
  schemaType,
  schemaVariants,
  variantLabels,
} from '@/lib/document-api-reference/schema';
import type { JsonSchema, ReferenceOperation, ReferenceOperationSummary } from '@/lib/document-api-reference/types';
import { referenceSchemaUrl, referenceUrl } from '@/lib/document-api-reference/urls';

export function DocumentApiReferenceLanding() {
  const model = getReferenceModel();
  return (
    <div className='sd-docapi-reference sd-docapi-landing'>
      <p className='sd-docapi-lede'>
        Search all {Object.keys(model.operations).length} operations in contract {model.contractVersion}. Learn with the
        task guides, then use this reference for exact inputs, results, and failures.
      </p>
      <ReferenceSearch groups={model.groups} operations={getOperationSummaries()} />
      <section className='sd-docapi-common-tasks'>
        <h2>Common tasks</h2>
        <div>
          <TaskCard href='/document-api/query-content' title='Find and replace text'>
            Search with a selector, then mutate the exact match.
          </TaskCard>
          <TaskCard href='/document-api/comments' title='Comment on a phrase'>
            Anchor a comment thread to a query result target.
          </TaskCard>
          <TaskCard href='/document-api/mutation-plans' title='Batch edits with one plan'>
            Preview and apply several revision-guarded changes.
          </TaskCard>
        </div>
      </section>
    </div>
  );
}

export function DocumentApiNamespace({ namespace }: { namespace: string }) {
  const group = getReferenceGroup(namespace);
  if (!group) return <p>Unknown Document API namespace: {namespace}</p>;
  const operations = getGroupOperations(group);
  const jobs = getNamespaceJobs(
    namespace,
    operations.map((operation) => operation.operationId),
  );

  return (
    <div className='sd-docapi-reference sd-docapi-namespace'>
      <p className='sd-docapi-lede'>
        {group.operationIds.length} operations. Names, descriptions, and behavior flags come from the canonical
        contract.
        {jobs ? ' Job groupings are curated for navigation.' : ''}
      </p>
      <NamespaceOperations operations={operations.map(toSummary)} jobs={jobs} />
    </div>
  );
}

export function DocumentApiOperation({ operationId }: { operationId: string }) {
  const operation = getReferenceOperation(operationId);
  if (!operation) return <p>Unknown Document API operation: {operationId}</p>;
  const model = getReferenceModel();
  const example = getReferenceExample(operationId);
  const inputFields = schemaProperties(operation.schemas.input, model.definitions);
  const inputVariants = schemaVariants(operation.schemas.input, model.definitions);
  const featured = featuredInputFields[operationId];
  const featuredFields = featured
    ? featured.flatMap((name) => inputFields.find((field) => field.name === name) ?? [])
    : [];
  const requiredFields = inputFields.filter((field) => field.required || field.conditionallyRequired);
  const selectedPrimaryFields = featured
    ? [...featuredFields, ...requiredFields.filter((field) => !featured.includes(field.name))]
    : requiredFields;
  const primaryFields = selectedPrimaryFields.length > 0 ? selectedPrimaryFields : inputFields;
  const advancedFields = inputFields.filter((field) => !primaryFields.some((primary) => primary.name === field.name));
  const outputFields = schemaProperties(operation.schemas.output, model.definitions);
  const outputVariants = schemaVariants(operation.schemas.output, model.definitions);
  const related = relatedOperations[operationId] ?? [];
  const summarizeOutputFields = JSON.stringify(operation.schemas.output).length > 50_000;
  const memberPath = `${operation.metadata.returnsPromise ? 'await ' : ''}doc.${operation.memberPath}(${operation.memberPath === 'capabilities' ? '' : '…'})`;

  return (
    <div className='sd-docapi-reference sd-docapi-operation'>
      <div className='sd-docapi-behavior'>
        <span data-kind={operation.metadata.mutates ? 'mutates' : 'reads'}>
          {operation.metadata.mutates ? 'mutates document' : 'read-only'}
        </span>
        {operation.metadata.supportsTrackedMode ? <span data-kind='tracked'>tracked mode</span> : null}
        {operation.metadata.supportsDryRun ? <span>dry run</span> : null}
        <span>{operation.metadata.idempotency}</span>
      </div>

      <div className='sd-docapi-member-path'>
        <code>{memberPath}</code>
        <CopyButton value={memberPath} label={`Copy member path for ${operation.operationId}`} />
      </div>

      {example ? (
        <section>
          <h2>Usage</h2>
          <div className='sd-docapi-provenance' data-kind='typechecked'>
            Typechecked example
          </div>
          <p>{example.provenance}</p>
          <div className='sd-docapi-code'>
            <div>
              <span>{example.label}</span>
              <CopyButton value={example.code} label={`Copy ${operation.operationId} example`} />
            </div>
            <pre>
              <code>{example.code}</code>
            </pre>
          </div>
        </section>
      ) : null}

      <section>
        <h2>Expected result</h2>
        <p>{operation.expectedResult}</p>
      </section>

      <section>
        <h2>Inputs</h2>
        {inputFields.length > 0 ? (
          <>
            <SchemaFields fields={primaryFields} definitions={model.definitions} />
            {advancedFields.length > 0 ? (
              <details className='sd-docapi-disclosure'>
                <summary>
                  {advancedFields.length} additional input field{advancedFields.length === 1 ? '' : 's'}
                </summary>
                <SchemaFields fields={advancedFields} definitions={model.definitions} />
              </details>
            ) : null}
          </>
        ) : inputVariants.length > 0 ? (
          <SchemaVariants variants={inputVariants} definitions={model.definitions} depth={0} />
        ) : (
          <p>This operation takes no input fields.</p>
        )}
      </section>

      <section>
        <h2>Result</h2>
        {summarizeOutputFields ? (
          <p>The top-level fields are shown here. Use the raw schema artifact for the complete capability matrix.</p>
        ) : null}
        <details className='sd-docapi-disclosure' open={operationId === 'query.match'}>
          <summary>Output fields</summary>
          {outputFields.length > 0 ? (
            <SchemaFields fields={outputFields} definitions={model.definitions} depth={summarizeOutputFields ? 2 : 0} />
          ) : outputVariants.length > 0 ? (
            <SchemaVariants
              variants={outputVariants}
              definitions={model.definitions}
              depth={summarizeOutputFields ? 2 : 0}
              idPrefix='output'
            />
          ) : (
            <p>No fields.</p>
          )}
        </details>
      </section>

      <FailureSection operation={operation} />

      {related.length > 0 ? (
        <section>
          <h2>Related</h2>
          <div className='sd-docapi-related'>
            {related.map((item) => {
              const relatedOperation = item.operationId ? getReferenceOperation(item.operationId) : undefined;
              const href = item.href ?? (relatedOperation ? referenceUrl(relatedOperation.path) : '#');
              return (
                <a key={`${item.title}-${href}`} href={href}>
                  <code>{item.title}</code>
                  <span>{item.description}</span>
                </a>
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <h2>Raw schemas</h2>
        <p>
          Open the generated JSON artifact for the exact input, output, success, and failure schemas represented by this
          contract version.
        </p>
        <a className='sd-docapi-schema-link' href={referenceSchemaUrl(operation.path)}>
          View raw JSON schemas
        </a>
      </section>
    </div>
  );
}

function TaskCard({ href, title, children }: { href: string; title: string; children: ReactNode }) {
  return (
    <a href={href}>
      <strong>{title}</strong>
      <span>{children}</span>
    </a>
  );
}

function toSummary({
  schemas: _schemas,
  expectedResult: _expectedResult,
  ...operation
}: ReferenceOperation): ReferenceOperationSummary {
  return operation;
}

function SchemaFields({
  fields,
  definitions,
  depth = 0,
}: {
  fields: Array<{ name: string; schema: JsonSchema; required: boolean; conditionallyRequired: boolean }>;
  definitions: Record<string, JsonSchema>;
  depth?: number;
}) {
  if (fields.length === 0) return <p>No fields.</p>;
  return (
    <div className='sd-docapi-fields'>
      {fields.map((field) => (
        <SchemaField key={field.name} {...field} definitions={definitions} depth={depth} />
      ))}
    </div>
  );
}

function SchemaField({
  name,
  schema,
  required,
  conditionallyRequired,
  definitions,
  depth,
}: {
  name: string;
  schema: JsonSchema;
  required: boolean;
  conditionallyRequired: boolean;
  definitions: Record<string, JsonSchema>;
  depth: number;
}) {
  const description = schemaDescription(schema, definitions);
  const variants = schemaVariants(schema, definitions);
  const nested = depth < 2 ? schemaProperties(schema, definitions) : [];
  return (
    <div className='sd-docapi-field'>
      <div>
        <code>{name}</code>
        <span>{schemaType(schema, definitions)}</span>
        {required ? <strong>required</strong> : null}
        {conditionallyRequired ? <strong>conditionally required</strong> : null}
      </div>
      {description ? <p>{description}</p> : null}
      {variants.length > 0 ? (
        <SchemaVariants variants={variants} definitions={definitions} depth={depth + 1} idPrefix={name} />
      ) : nested.length > 0 ? (
        <details className='sd-docapi-nested'>
          <summary>Fields</summary>
          <SchemaFields fields={nested} definitions={definitions} depth={depth + 1} />
        </details>
      ) : null}
    </div>
  );
}

function SchemaVariants({
  variants,
  definitions,
  depth,
  idPrefix = 'input',
}: {
  variants: JsonSchema[];
  definitions: Record<string, JsonSchema>;
  depth: number;
  idPrefix?: string;
}) {
  const labels = variantLabels(variants, definitions);
  return (
    <div className='sd-docapi-variants'>
      {variants.map((variant, index) => {
        const fields = schemaProperties(variant, definitions);
        const nestedVariants = fields.length === 0 ? schemaVariants(variant, definitions) : [];
        return (
          <details key={`${idPrefix}-${index}`} open={index === 0 && variants.length <= 3}>
            <summary>{labels[index]}</summary>
            {fields.length > 0 ? (
              <SchemaFields fields={fields} definitions={definitions} depth={depth} />
            ) : nestedVariants.length > 0 ? (
              <SchemaVariants
                variants={nestedVariants}
                definitions={definitions}
                depth={depth + 1}
                idPrefix={`${idPrefix}-${index}`}
              />
            ) : (
              <p>No fields.</p>
            )}
          </details>
        );
      })}
    </div>
  );
}

function FailureSection({ operation }: { operation: ReferenceOperation }) {
  const throws = operation.metadata.throws.preApply;
  const failures = operation.metadata.possibleFailureCodes;
  if (throws.length === 0 && failures.length === 0) return null;
  return (
    <section>
      <h2>Failures</h2>
      {throws.length > 0 ? <FailureCodes title='Pre-apply throws' codes={throws} /> : null}
      {failures.length > 0 ? <FailureCodes title='Non-applied receipt codes' codes={failures} /> : null}
      {operation.metadata.remediationHints?.length ? (
        <details className='sd-docapi-disclosure'>
          <summary>Remediation guidance</summary>
          <ul>
            {operation.metadata.remediationHints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function FailureCodes({ title, codes }: { title: string; codes: string[] }) {
  const visible = codes.slice(0, 3);
  const remaining = codes.slice(3);
  return (
    <div className='sd-docapi-failures'>
      <h3>{title}</h3>
      <ul>
        {visible.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ul>
      {remaining.length > 0 ? (
        <details>
          <summary>{remaining.length} more codes</summary>
          <ul>
            {remaining.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

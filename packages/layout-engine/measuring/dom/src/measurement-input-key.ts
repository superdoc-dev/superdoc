/**
 * Deterministically serializes authored measurement inputs while excluding
 * positional/provenance fields that measuring/dom does not read for geometry.
 *
 * Absolute PM/source positions shift after edits earlier in a document. They
 * must not invalidate a geometry cache. A tab run's `width` is also excluded:
 * paragraph measurement stamps it as an output and reconstructs it from the
 * authored tab stops on a cache miss. Inline-box ids remain included because
 * they are copied into measured output and used as painter identity.
 */
const serializeMeasurementInputValue = (
  value: unknown,
  options: { omitObjectIds?: boolean },
  preserveObjectIds: boolean,
): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeMeasurementInputValue(item, options, preserveObjectIds)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.entries(record)
    .filter(([key]) => key !== 'pmStart' && key !== 'pmEnd' && key !== 'sourceAnchor')
    .filter(([key]) => !(options.omitObjectIds === true && key === 'id' && !preserveObjectIds))
    .filter(([key]) => !(record.kind === 'tab' && key === 'width'))
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(
      ([key, entry]) =>
        `${JSON.stringify(key)}:${serializeMeasurementInputValue(
          entry,
          options,
          preserveObjectIds || key === 'inlineBoxes',
        )}`,
    )
    .join(',')}}`;
};

export function serializeMeasurementInput(value: unknown, options: { omitObjectIds?: boolean } = {}): string {
  return serializeMeasurementInputValue(value, options, false);
}

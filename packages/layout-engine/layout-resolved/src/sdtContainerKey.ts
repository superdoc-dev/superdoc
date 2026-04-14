import type { SdtMetadata } from '@superdoc/contracts';

/**
 * Returns a stable key for grouping consecutive fragments in the same SDT container.
 *
 * This is a minimal duplicate of the logic in `painters/dom/src/utils/sdt-helpers.ts`
 * (`getSdtContainerKey`), kept here to avoid a dependency on the painter package.
 * Only the key derivation is needed; DOM styling helpers are not.
 */
export function computeSdtContainerKey(sdt?: SdtMetadata | null, containerSdt?: SdtMetadata | null): string | null {
  const metadata = getSdtContainerMetadata(sdt, containerSdt);
  if (!metadata) return null;

  if (metadata.type === 'structuredContent') {
    if (metadata.scope !== 'block') return null;
    if (!metadata.id) return null;
    return `structuredContent:${metadata.id}`;
  }

  if (metadata.type === 'documentSection') {
    const sectionId = metadata.id ?? metadata.sdBlockId;
    if (!sectionId) return null;
    return `documentSection:${sectionId}`;
  }

  return null;
}

function isSdtContainer(sdt?: SdtMetadata | null): boolean {
  if (!sdt) return false;
  if (sdt.type === 'documentSection') return true;
  if (sdt.type === 'structuredContent' && sdt.scope === 'block') return true;
  return false;
}

function getSdtContainerMetadata(sdt?: SdtMetadata | null, containerSdt?: SdtMetadata | null): SdtMetadata | null {
  if (isSdtContainer(sdt)) return sdt ?? null;
  if (isSdtContainer(containerSdt)) return containerSdt ?? null;
  return null;
}

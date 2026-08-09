import type { ComponentProps } from 'react';
import type { MDXComponents } from 'mdx/types';
import type { StaticImageData } from 'next/image';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { CommandStateDemo } from '@/components/embeds/command-state-demo';
import { CustomBoldDemo } from '@/components/embeds/custom-bold-demo';
import { CustomUiArchitecture } from '@/components/embeds/custom-ui-architecture';
import { DocumentPreview } from '@/components/embeds/document-preview';
import { EditorDemo } from '@/components/embeds/editor-demo';
import { DocsHome } from '@/components/docs-home';
import { Callout } from '@/components/mdx/callout';
import { FileDownload } from '@/components/mdx/file-download';
import { MigrationAgentPrompt } from '@/components/mdx/MigrationAgentPrompt';
import { MigrationExplorer } from '@/components/mdx/migration-explorer';
import { MigrationExample, MigrationExampleTabs } from '@/components/mdx/migration-example-tabs';
import { ReceiptBar } from '@/components/mdx/receipt-bar';
import { RuntimeExample, RuntimeExampleTabs } from '@/components/mdx/runtime-example-tabs';
import {
  DocumentApiNamespace,
  DocumentApiOperation,
  DocumentApiReferenceLanding,
} from '@/components/document-api-reference';

function isStaticImageData(value: unknown): value is StaticImageData {
  if (typeof value !== 'object' || value === null || !('src' in value)) return false;
  return typeof value.src === 'string';
}

function DocsImage({ src, ...props }: ComponentProps<'img'>) {
  const imageSource: unknown = src;

  if (typeof imageSource === 'string' || isStaticImageData(imageSource)) {
    return <ImageZoom src={imageSource} {...props} />;
  }

  return <img src={src} {...props} />;
}

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Callout,
    CommandStateDemo,
    CustomBoldDemo,
    CustomUiArchitecture,
    DocumentPreview,
    DocumentApiNamespace,
    DocumentApiOperation,
    DocumentApiReferenceLanding,
    DocsHome,
    EditorDemo,
    FileDownload,
    MigrationAgentPrompt,
    MigrationExplorer,
    MigrationExample,
    MigrationExampleTabs,
    ReceiptBar,
    RuntimeExample,
    RuntimeExampleTabs,
    img: DocsImage,
    ...components,
  };
}

export const useMDXComponents = getMDXComponents;

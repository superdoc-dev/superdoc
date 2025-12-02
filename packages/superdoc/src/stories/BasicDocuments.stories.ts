import type { Meta, StoryObj } from '@storybook/vue3-vite';

import App from '../../../../e2e-tests/templates/vue/src/App.vue';

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories
const meta = {
  title: 'Basic Documents',
  component: App,
  tags: ['!autodocs'],
  argTypes: {
    filename: { control: 'text' },
    onReady: { table: { disable: true } },
  },
  mount: ({ args, canvas, renderToCanvas }) => async () => {
    const { promise: readyPromise, resolve: onReady } = Promise.withResolvers();
    args.onReady = onReady;

    await renderToCanvas();
    await readyPromise;
    return canvas;
  },
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AdvancedTables: Story = {
  args: {
    filename: 'basic-documents/advanced-tables.docx',
  },
};

export const AdvancedText: Story = {
  args: {
    filename: 'basic-documents/advanced-text.docx',
  },
};

export const BaseCustom: Story = {
  args: {
    filename: 'basic-documents/base-custom.docx',
  },
};

export const BaseListStyleIndent: Story = {
  args: {
    filename: 'basic-documents/base-list-style-indent.docx',
  },
};

export const BaseOrdered: Story = {
  args: {
    filename: 'basic-documents/base-ordered.docx',
  },
};

export const BrokenListMissingItems: Story = {
  args: {
    filename: 'basic-documents/broken-list-missing-items.docx',
  },
};

export const ContractAcc: Story = {
  args: {
    filename: 'basic-documents/contract-acc.docx',
  },
};

export const CustomListNumbering: Story = {
  args: {
    filename: 'basic-documents/custom-list-numbering.docx',
  },
};

export const CustomList1: Story = {
  args: {
    filename: 'basic-documents/custom-list1.docx',
  },
};

export const ExportedListFont: Story = {
  args: {
    filename: 'basic-documents/exported-list-font.docx',
  },
};

export const ExtensionsStructuredContent: Story = {
  args: {
    filename: 'basic-documents/extensions-structured-content.docx',
  },
};

export const FeaturesLists: Story = {
  args: {
    filename: 'basic-documents/features-lists.docx',
  },
};

export const FeaturesRedlinesCommentsAnnotationsAndMore: Story = {
  args: {
    filename: 'basic-documents/features-redlines-comments-annotations-and-more.docx',
  },
};

export const GdocsCommentsExport: Story = {
  args: {
    filename: 'basic-documents/gdocs-comments-export.docx',
  },
};

export const GdocsTrackedChanges: Story = {
  args: {
    filename: 'basic-documents/gdocs-tracked-changes.docx',
  },
};

export const HeaderFooterAnchoredImages: Story = {
  args: {
    filename: 'basic-documents/header-footer-anchored-images.docx',
  },
};

export const ImageWrapping: Story = {
  args: {
    filename: 'basic-documents/image-wrapping.docx',
  },
};

export const InvalidListDefFallback: Story = {
  args: {
    filename: 'basic-documents/invalid-list-def-fallback.docx',
  },
};

export const ListAbsIds: Story = {
  args: {
    filename: 'basic-documents/list-abs-ids.docx',
  },
};

export const ListFormattingIndents: Story = {
  args: {
    filename: 'basic-documents/list-formatting-indents.docx',
  },
};

export const ListMarkers: Story = {
  args: {
    filename: 'basic-documents/list-markers.docx',
  },
};

export const ListMixedAbstractIds: Story = {
  args: {
    filename: 'basic-documents/list-mixed-abstract-ids.docx',
  },
};

export const ListRestart: Story = {
  args: {
    filename: 'basic-documents/list-restart.docx',
  },
};

export const ListStyle: Story = {
  args: {
    filename: 'basic-documents/list-style.docx',
  },
};

export const ListWithTableBreak: Story = {
  args: {
    filename: 'basic-documents/list-with-table-break.docx',
  },
};

export const ListsComplexItems: Story = {
  args: {
    filename: 'basic-documents/lists-complex-items.docx',
  },
};

export const LongerHeader: Story = {
  args: {
    filename: 'basic-documents/longer-header.docx',
  },
};

export const MsaListBaseIndent: Story = {
  args: {
    filename: 'basic-documents/msa-list-base-indent.docx',
  },
};

export const MswordTrackedChanges: Story = {
  args: {
    filename: 'basic-documents/msword-tracked-changes.docx',
  },
};

export const MultipleNodesInList: Story = {
  args: {
    filename: 'basic-documents/multiple-nodes-in-list.docx',
  },
};

export const OoxmlBoldRstyleLinkedCombosDemo: Story = {
  args: {
    filename: 'basic-documents/ooxml-bold-rstyle-linked-combos-demo.docx',
  },
};

export const OoxmlColorRstyleLinkedCombosDemo: Story = {
  args: {
    filename: 'basic-documents/ooxml-color-rstyle-linked-combos-demo.docx',
  },
};

export const OoxmlHighlightRstyleLinkedCombosDemo: Story = {
  args: {
    filename: 'basic-documents/ooxml-highlight-rstyle-linked-combos-demo.docx',
  },
};

export const OoxmlItalicRstyleCombosDemo: Story = {
  args: {
    filename: 'basic-documents/ooxml-italic-rstyle-combos-demo.docx',
  },
};

export const OoxmlRfontsRstyleLinkedCombosDemo: Story = {
  args: {
    filename: 'basic-documents/ooxml-rFonts-rstyle-linked-combos-demo.docx',
  },
};

export const OoxmlSizeRstyleLinkedCombosDemo: Story = {
  args: {
    filename: 'basic-documents/ooxml-size-rstyle-linked-combos-demo.docx',
  },
};

export const OoxmlStrikeRstyleLinkedCombosDemo: Story = {
  args: {
    filename: 'basic-documents/ooxml-strike-rstyle-linked-combos-demo.docx',
  },
};

export const OoxmlUnderlineRstyleLinkedCombosDemo: Story = {
  args: {
    filename: 'basic-documents/ooxml-underline-rstyle-linked-combos-demo.docx',
  },
};

export const RestartNumberingSubList: Story = {
  args: {
    filename: 'basic-documents/restart-numbering-sub-list.docx',
  },
};

export const Sdpr: Story = {
  args: {
    filename: 'basic-documents/sdpr.docx',
  },
};

export const SublistIssue: Story = {
  args: {
    filename: 'basic-documents/sublist-issue.docx',
  },
};

export const SuperdocHyperlinkCases: Story = {
  args: {
    filename: 'basic-documents/superdoc-hyperlink-cases.docx',
  },
};

export const TabStopsBasicTest: Story = {
  args: {
    filename: 'basic-documents/tab-stops-basic-test.docx',
  },
};

export const TabStopsTestSignerArea: Story = {
  args: {
    filename: 'basic-documents/tab-stops-test-signer-area.docx',
  },
};

export const TableInList: Story = {
  args: {
    filename: 'basic-documents/table-in-list.docx',
  },
};

export const TableOfContentsSdt: Story = {
  args: {
    filename: 'basic-documents/table-of-contents-sdt.docx',
  },
};

export const TableOfContents: Story = {
  args: {
    filename: 'basic-documents/table-of-contents.docx',
  },
};

export const TableWidthIssue: Story = {
  args: {
    filename: 'basic-documents/table-width-issue.docx',
  },
};

export const TableWidthsSd732: Story = {
  args: {
    filename: 'basic-documents/table-widths-SD-732.docx',
  },
};

export const TableWithBlockBookmarks: Story = {
  args: {
    filename: 'basic-documents/table-with-block-bookmarks.docx',
  },
};

export const TinySpacing: Story = {
  args: {
    filename: 'basic-documents/tiny-spacing.docx',
  },
};

export const VerticalMerge: Story = {
  args: {
    filename: 'basic-documents/vertical-merge.docx',
  },
};


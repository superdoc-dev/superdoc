type CreateRelsProps = {
  filename: string;
  rels: Record<string, string>;
};

/**
 * Create the rels entry for a docx directory
 * @param filename - filename of the word document (defaults to document.xml)
 * @param rels - record mapping rId keys to target filename values
 */
export function createRels({ filename = 'document.xml', rels }: CreateRelsProps) {
  return {
    [`word/_rels/${filename}.rels`]: {
      elements: [
        {
          name: 'Relationships',
          elements: Object.entries(rels).map(([key, value]) => ({
            name: 'Relationship',
            attributes: {
              Id: key,
              Target: value,
            },
          })),
        },
      ],
    },
  };
}

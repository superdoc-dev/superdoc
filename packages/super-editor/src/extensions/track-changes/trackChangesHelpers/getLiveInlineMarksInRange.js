export const getLiveInlineMarksInRange = ({ doc, from, to }) => {
  const marks = [];
  const seen = new Set();

  doc.nodesBetween(from, to, (node) => {
    if (!node.isInline) {
      return;
    }

    node.marks.forEach((mark) => {
      const key = `${mark.type.name}:${JSON.stringify(mark.attrs || {})}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      marks.push(mark);
    });
  });

  return marks;
};

import { TextRun } from "@superdoc/contracts";
import type { RunProperties } from '@superdoc/style-engine/ooxml';
import { ConverterContext } from "../../converter-context";
import { computeRunAttrs } from "../../attributes/paragraph";

export const applyInlineRunProperties = (
  run: TextRun,
  runProperties: RunProperties | undefined,
  converterContext?: ConverterContext,
): TextRun => {
  if (!runProperties) {
    return run;
  }
  const runAttrs = computeRunAttrs(runProperties, converterContext);
  return { ...run, ...runAttrs };
};

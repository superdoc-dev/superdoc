/**
 * Consumer typecheck: v2 shell capability surface on `SuperDoc`.
 *
 * Locks the public return shapes of the opt-in v2 capability helpers exposed
 * on the root `SuperDoc` instance.
 *
 * Drained obligations (2):
 *   - getV2FeatureMatrix:returns
 *   - v2:returns
 */
import type { SuperDoc } from 'superdoc';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertEqual<A, B> = Equal<A, B> extends true ? true : never;

type V2FeatureMatrixEntry = {
  feature: string;
  status: string;
  reason: string;
};

type SuperDocV2Surface = {
  version: number;
  featureMatrix: V2FeatureMatrixEntry[];
} | null;

declare const sd: SuperDoc;

const _getV2FeatureMatrixReturnOk: AssertEqual<
  ReturnType<SuperDoc['getV2FeatureMatrix']>,
  V2FeatureMatrixEntry[]
> = true;
const _v2GetterReturnOk: AssertEqual<SuperDoc['v2'], SuperDocV2Surface> = true;
const _v2GetterValue: SuperDoc['v2'] = sd.v2;

const _featureMatrix: V2FeatureMatrixEntry[] = sd.getV2FeatureMatrix();
const _v2: SuperDocV2Surface = sd.v2;

if (_v2) {
  const _version: number = _v2.version;
  const _feature: V2FeatureMatrixEntry | undefined = _v2.featureMatrix[0];
  void [_version, _feature];
}

void [_getV2FeatureMatrixReturnOk, _v2GetterReturnOk, _v2GetterValue, _featureMatrix, _v2];

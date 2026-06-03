import { describe, it, expect } from 'vitest';
import {
  resolveFontFamily,
  resolvePhysicalFamily,
  resolvePrimaryPhysicalFamily,
  resolvePhysicalFamilies,
} from './index';

describe('font resolver', () => {
  it('maps the five verified clean clones (bare names)', () => {
    expect(resolvePhysicalFamily('Calibri')).toBe('Carlito');
    expect(resolvePhysicalFamily('Cambria')).toBe('Caladea');
    expect(resolvePhysicalFamily('Arial')).toBe('Liberation Sans');
    expect(resolvePhysicalFamily('Times New Roman')).toBe('Liberation Serif');
    expect(resolvePhysicalFamily('Courier New')).toBe('Liberation Mono');
  });

  it('resolves the PRIMARY family of a CSS stack and keeps the fallbacks', () => {
    // The real shape reaching measure/paint (toCssFontFamily output).
    expect(resolvePhysicalFamily('Calibri, sans-serif')).toBe('Carlito, sans-serif');
    expect(resolvePhysicalFamily('Times New Roman, serif')).toBe('Liberation Serif, serif');
    expect(resolvePhysicalFamily('Calibri , Arial , sans-serif')).toBe('Carlito, Arial, sans-serif');
  });

  it('is case- and quote-insensitive on the primary name', () => {
    expect(resolvePhysicalFamily('"CAMBRIA", serif')).toBe('Caladea, serif');
    expect(resolvePhysicalFamily('courier new')).toBe('Liberation Mono');
  });

  it('passes through a family with no known substitute', () => {
    expect(resolvePhysicalFamily('Verdana, sans-serif')).toBe('Verdana, sans-serif');
    expect(resolveFontFamily('Verdana')).toEqual({
      logicalFamily: 'Verdana',
      physicalFamily: 'Verdana',
      reason: 'as_requested',
    });
    // Aptos/Georgia have no clean clone yet -> not mapped.
    expect(resolvePhysicalFamily('Aptos')).toBe('Aptos');
    expect(resolvePhysicalFamily('Georgia')).toBe('Georgia');
  });

  it('reports the substitution reason + preserves the logical family', () => {
    expect(resolveFontFamily('Cambria')).toEqual({
      logicalFamily: 'Cambria',
      physicalFamily: 'Caladea',
      reason: 'bundled_substitute',
    });
    expect(resolveFontFamily('Calibri, sans-serif').logicalFamily).toBe('Calibri, sans-serif');
  });

  it('extracts the bare physical face the gate must await', () => {
    expect(resolvePrimaryPhysicalFamily('Arial, sans-serif')).toBe('Liberation Sans');
    expect(resolvePrimaryPhysicalFamily('Verdana, sans-serif')).toBe('Verdana');
  });

  it('resolvePhysicalFamilies dedupes to the loadable face names', () => {
    expect(resolvePhysicalFamilies(['Calibri, sans-serif', 'Cambria', 'Calibri', 'Verdana']).sort()).toEqual([
      'Caladea',
      'Carlito',
      'Verdana',
    ]);
  });
});

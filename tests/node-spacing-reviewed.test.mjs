import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reviewedSpacingBinding, reviewedSpacingReference, reviewedSpacingIssues, reconcileReviewedAliases } from '../services/local-storage/node-spacing-reviewed.mjs';
import { spacingReference } from '../services/local-storage/node-spacing-reference.mjs';
import { spacingEvidenceReader } from '../services/local-storage/node-spacing.mjs';

const { rows, pending } = JSON.parse(readFileSync(new URL('../data/pump-spacing-reviewed.json', import.meta.url), 'utf8'));
function input(row) {
  return { variant: { id: row.variantId, designation: row.designation, manufacturer_article: row.article }, model: { id: row.modelId }, motor: { ...row.motor }, manufacturer: row.manufacturer, series: row.series,
    dimensions: { sourceValues: Object.entries(row.dimensionGuard?.values ?? {}).map(([symbol, valueMm]) => ({ symbol, valueMm, mappingStatus: 'symbol_only' })) }, evidence: { dimensionSetId: row.dimensionGuard?.id }, links: [], motorKey: 'test-motor' };
}

test('reviewed drawings bind only to the exact execution, article and motor configuration', () => {
  const row = rows.find(r => r.series === 'EST'), args = input(row);
  assert.deepEqual(reviewedSpacingBinding(args), row);
  for (const mutation of [
    { variant: { ...args.variant, id: 'another' } }, { variant: { ...args.variant, manufacturer_article: 'another' } },
    { variant: { ...args.variant, designation: row.designation + 'S' } }, { model: { id: 'another' } },
    { manufacturer: 'LEO' }, { motor: { ...args.motor, power_kw: args.motor.power_kw + 1 } },
    { motor: { ...args.motor, phase_count: 1 } }, { motor: { ...args.motor, frequency_hz: 60 } },
    { motor: { ...args.motor, efficiency_class: 'another' } },
  ]) assert.equal(reviewedSpacingBinding({ ...args, ...mutation }), undefined);
});

test('selected dimension-set guards reject edits, contradictory assertions and alternative executions', () => {
  const row = rows.find(r => r.series === 'CMI'), args = input(row), first = args.dimensions.sourceValues[0];
  assert.deepEqual(reviewedSpacingBinding(args), row);
  for (const changed of [
    { ...args, evidence: { dimensionSetId: 'another' } },
    { ...args, dimensions: { sourceValues: [] } },
    { ...args, dimensions: { sourceValues: args.dimensions.sourceValues.map(v => ({ ...v, mappingStatus: 'alternative_execution' })) } },
    { ...args, dimensions: { sourceValues: [...args.dimensions.sourceValues, { ...first, valueMm: first.valueMm + 1 }] } },
  ]) assert.equal(reviewedSpacingBinding(changed), undefined);
});

test('ECH aliases resolve to the exact three-phase CAD identity; unexpected aliases remain conflicting', () => {
  const row = rows.find(r => r.series === 'ECH'), args = input(row);
  const links = row.identity.aliases.map(legacyId => ({ legacyId, scope: 'model', relation: 'imported', source: 'archive' }));
  const reconciled = reconcileReviewedAliases(links, row);
  assert.equal(reconciled.length, 1); assert.equal(reconciled[0].legacyId, row.identity.canonical);
  assert(row.identity.canonical.startsWith('nu-'));
  assert(spacingReference({ ...args, links: reconciled }));
  const extra = [...links, { ...links[0], legacyId: 'unknown' }];
  assert.equal(reconcileReviewedAliases(extra, row), extra);
  assert.equal(reconcileReviewedAliases(links.slice(0, 1), row).length, 1);
  const tables = { legacy_model_map: links.map(l => ({ legacy_id: l.legacyId, model_id: row.modelId, status: 'imported' })), legacy_variant_links: [] };
  const read = spacingEvidenceReader(name => tables[name] ?? []);
  const evidence = read(args.variant, args.model, args.motor, [], args);
  assert.equal(evidence.links.length, 1); assert.equal(evidence.identityAliases.length, 2); assert(evidence.reference);
  const changedMotor = read(args.variant, args.model, { ...args.motor, phase_count: 1 }, [], { manufacturer: args.manufacturer, series: args.series });
  assert.equal(changedMotor.links.length, 2); assert.equal(changedMotor.reference, undefined);
});

test('source changes invalidate the version and cannot certify the complete factory envelope', () => {
  const row = rows.find(r => r.series === 'EST'), reference = reviewedSpacingReference(row, 'motor');
  assert.match(reference.basis, /требует проверки/);
  assert.equal(reference.orientation, 'transverse_to_flow');
  assert.notEqual(reference.version, reviewedSpacingReference({ ...row, sources: [{ ...row.sources[0], sha256: 'changed' }] }, 'motor').version);
  assert.notEqual(reference.version, reviewedSpacingReference({ ...row, rightMm: row.rightMm + 50 }, 'motor').version);
});

test('reviewed manifest has unique identities, usable sources and positive finite measurements', () => {
  assert.equal(new Set(rows.map(r => r.variantId)).size, rows.length);
  for (const row of rows) {
    assert(row.sources.length > 0);
    assert(row.sources.every(s => /^[a-f0-9]{64}$/.test(s.sha256)));
    assert.deepEqual(reviewedSpacingBinding(input(row)), row);
    if (!row.identity) {
      assert(Number.isFinite(row.leftMm) && row.leftMm > 0);
      assert(Number.isFinite(row.rightMm) && row.rightMm > 0);
    }
  }
});

test('unresolved source conflicts remain visible without borrowing a nearby execution envelope', () => {
  for (const row of pending) {
    const args = input(row);
    assert.equal(reviewedSpacingBinding(args), undefined);
    assert.equal(spacingReference(args), undefined);
    assert.deepEqual(reviewedSpacingIssues(args), row.issues);
    assert.deepEqual(reviewedSpacingIssues({ ...args, motor: { ...args.motor, power_kw: args.motor.power_kw + 1 } }), []);
    assert(row.sources.every(s => /^[a-f0-9]{64}$/.test(s.sha256)));
  }
});

test('late factory drawings resolve exact LEO, CNP and EEZ models with reviewed widths', () => {
  const expected = new Map([
    ['XST40-250/92', 350], ['XST50-200/92', 350], ['XST65-160/92', 350],
    ['NIS80-65-160G/5.5SWH', 365], ['EEZ150-125-200/214-2NZ', 720],
    ['EEZ200-150-320/255-4NZ', 720], ['EEZ65-50-260/205-2NZ', 570],
  ]);
  for (const [name, width] of expected) {
    const row = rows.find(r => r.designation === name);
    assert(row, name);
    assert(!pending.some(r => r.variantId === row.variantId));
    const ref = spacingReference(input(row));
    assert.equal(ref.leftMm + ref.rightMm, width, name);
    assert(row.sources.some(s => s.url && /\.(png|jpg)$/.test(s.url)), name);
    if (row.series === 'XST') {
      assert.equal(row.motor.power_kw, 11);
      assert.match(ref.basis, /IP54.*IP55/);
      assert.equal(reviewedSpacingBinding({ ...input(row), motor: { ...row.motor, power_kw: 9.2 } }), undefined);
    }
    if (row.series === 'NIS') assert(!row.sources.some(s => s.path.endsWith('nis-182.pdf')));
  }
});

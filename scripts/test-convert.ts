import fs from 'fs';
import path from 'path';
import {
  bodogwuToGovCbr,
  govCbrToBodogwu,
  mergeThreeSegments,
} from '../lib/convert';
import { DEFAULT_AGENT_CONFIG } from '../lib/types';

const fixturesDir = path.join(__dirname, '..', 'fixtures');
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf-8'));

function section(title: string) {
  console.log('\n' + '='.repeat(70));
  console.log(title);
  console.log('='.repeat(70));
}

// ---------------------------------------------------------------------------
// Test 1: B'Odogwu single upload -> GovCBR
// ---------------------------------------------------------------------------
section('TEST 1: B\'Odogwu (single upload) -> GovCBR');
const boSingle = read('BO_20Bls_Sample.json');
const t1 = bodogwuToGovCbr(
  boSingle.manifestHdr,
  boSingle.blSegments,
  '2026NPAFLM009999',
  'I',
  '01313714-0001',
  DEFAULT_AGENT_CONFIG
);
console.log('Consignment count in output:', (t1.data.xmlString.match(/<Consignment>/g) || []).length);
console.log('Expected:', boSingle.blSegments.length);
console.log('senReferenceNumber:', t1.data.senReferenceNumber);
console.log('Warnings:');
t1.warnings.forEach((w) => console.log('  -', w));
fs.writeFileSync(path.join(fixturesDir, '_out_test1_govcbr.json'), JSON.stringify(t1.data, null, 2));

// ---------------------------------------------------------------------------
// Test 2: GovCBR -> B'Odogwu single upload
// ---------------------------------------------------------------------------
section('TEST 2: GovCBR -> B\'Odogwu (single upload)');
const govcbr = read('GovCBR_Sample.json');
const t2 = govCbrToBodogwu(govcbr, '2026-08-20', '14:30:00');
console.log('BL count in output:', t2.data.bodogwu.blSegments.length);
console.log('SEN extracted:', t2.data.senReferenceNumber);
console.log('Sample BL[0]:', JSON.stringify(t2.data.bodogwu.blSegments[0], null, 2).slice(0, 800));
console.log('Warnings:');
t2.warnings.forEach((w) => console.log('  -', w));
fs.writeFileSync(
  path.join(fixturesDir, '_out_test2_bodogwu.json'),
  JSON.stringify(t2.data.bodogwu, null, 2)
);
fs.writeFileSync(
  path.join(fixturesDir, '_out_test2_sen.json'),
  JSON.stringify({ senReferenceNumber: t2.data.senReferenceNumber, inbound_outbound_indicator: t2.data.inbound_outbound_indicator }, null, 2)
);

// ---------------------------------------------------------------------------
// Test 3: 3-segment B'Odogwu -> merged single upload -> GovCBR (with SEN field)
// ---------------------------------------------------------------------------
section('TEST 3: 3-segment B\'Odogwu -> GovCBR (with SEN)');
const header3 = read('GRIMALDI-MAN.json');
const bls1 = read('10BLs_1.json');
const bls2 = read('10BLs_2.json');
const register = read('Register.json');

const merged = mergeThreeSegments(header3, [bls1, bls2], register);
console.log('Merge warnings:');
merged.warnings.forEach((w) => console.log('  -', w));
console.log('Merged BL count:', merged.data.blSegments.length);

const t3 = bodogwuToGovCbr(
  merged.data.manifestHdr,
  merged.data.blSegments,
  '2026NPAFLM007777', // user-supplied SEN, since 3-seg B'Odogwu has none
  'I',
  '01313714-0001', // user-supplied TIN
  DEFAULT_AGENT_CONFIG
);
console.log('Consignment count in output:', (t3.data.xmlString.match(/<Consignment>/g) || []).length);
console.log('Warnings:');
t3.warnings.forEach((w) => console.log('  -', w));
fs.writeFileSync(path.join(fixturesDir, '_out_test3_govcbr.json'), JSON.stringify(t3.data, null, 2));

// ---------------------------------------------------------------------------
// Test 4: round-trip sanity (GovCBR -> BO -> GovCBR): consignment count stable
// ---------------------------------------------------------------------------
section('TEST 4: round-trip GovCBR -> B\'Odogwu -> GovCBR');
const roundTrip = bodogwuToGovCbr(
  t2.data.bodogwu.manifestHdr,
  t2.data.bodogwu.blSegments,
  t2.data.senReferenceNumber,
  t2.data.inbound_outbound_indicator as 'I' | 'O',
  '01313714-0001',
  DEFAULT_AGENT_CONFIG
);
const originalCount = (govcbr.xmlString.match(/<Consignment>/g) || []).length;
const roundTripCount = (roundTrip.data.xmlString.match(/<Consignment>/g) || []).length;
console.log('original consignments:', originalCount, '| round-trip consignments:', roundTripCount);
console.log(originalCount === roundTripCount ? 'PASS: counts match' : 'FAIL: counts differ');

section('DONE — output files written to fixtures/_out_*.json for inspection');

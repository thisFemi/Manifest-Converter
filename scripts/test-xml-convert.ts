import fs from 'fs';
import path from 'path';
import { parseHeaderXml, parseBlXml, parseRegisterXml } from '../lib/xml-bodogwu';
import { mergeThreeSegments, bodogwuToGovCbr } from '../lib/convert';
import { DEFAULT_AGENT_CONFIG } from '../lib/types';

const dir = path.join(__dirname, '..', 'fixtures', 'xml');
const read = (name: string) => fs.readFileSync(path.join(dir, name), 'utf-8');

function section(title: string) {
  console.log('\n' + '='.repeat(70));
  console.log(title);
  console.log('='.repeat(70));
}

for (const set of ['set1', 'set2', 'set3']) {
  section(`${set}: parse header + BL + register`);

  const header = parseHeaderXml(read(`${set}-header.xml`));
  console.log('header.registryNumber:', header.identificationSegment.registryNumber);
  console.log('header.destination:', header.generalSegment.destinationSegment.code);
  console.log('header.grossTonnage:', header.generalSegment.tonnageSegment.grossTonnage);

  const bl = parseBlXml(read(`${set}-bl1.xml`));
  console.log('bl.bolReference:', bl.identificationSegment.bolReference);
  console.log('bl.lineNumber:', bl.bolSpecificSegment.lineNumber);
  console.log('bl.exporter:', bl.bolSpecificSegment.exporterSegment.name);
  console.log('bl.consignee:', bl.bolSpecificSegment.consigneeSegment.name);
  console.log('bl.goodsDescription:', bl.bolSpecificSegment.goodsDescription);
  console.log('bl.containers:', JSON.stringify(bl.containers));

  const register = parseRegisterXml(read(`${set}-register.xml`));
  console.log('register.totalsSegment:', JSON.stringify(register.totalsSegment));

  const merged = mergeThreeSegments(header, [[bl]], register);
  console.log('merge warnings:', merged.warnings);

  const govcbr = bodogwuToGovCbr(
    merged.data.manifestHdr,
    merged.data.blSegments,
    '2026TESTSEN0001',
    'I',
    '01313714-0001',
    DEFAULT_AGENT_CONFIG
  );
  const consignmentCount = (govcbr.data.xmlString.match(/<Consignment>/g) || []).length;
  console.log('GovCBR consignment count:', consignmentCount, '(expected 1)');
  console.log('GovCBR warnings:', govcbr.warnings.length);
}

section('zip extraction sanity check (Node-side, mirrors client readXmlOrZipFiles logic)');
import('jszip').then(async ({ default: JSZip }) => {
  const zipBuf = fs.readFileSync(path.join(dir, 'set1-bls.zip'));
  const zip = await JSZip.loadAsync(zipBuf);
  const entries = Object.values(zip.files).filter((f: any) => !f.dir && f.name.endsWith('.xml'));
  console.log('xml entries found in zip:', entries.map((e: any) => e.name));
  for (const e of entries as any[]) {
    const text = await e.async('text');
    const bl = parseBlXml(text);
    console.log('parsed from zip -> bolReference:', bl.identificationSegment.bolReference);
  }
  section('DONE');
});

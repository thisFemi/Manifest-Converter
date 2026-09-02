import { BodogwuBl, BodogwuHeader, BodogwuRegister } from './types';
import { NamedJson } from './client-files';

export interface GroupedManifest {
  /** Display name for this manifest, used to label its output file. */
  name: string;
  manifestHdr: BodogwuHeader;
  blSegments: BodogwuBl[];
}

export interface SmartMergeResult {
  manifests: GroupedManifest[];
  warnings: string[];
}

function isObject(v: any): v is Record<string, any> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isManifest(o: any): boolean {
  return isObject(o) && isObject(o.manifestHdr) && Array.isArray(o.blSegments);
}

function isHeader(o: any): boolean {
  return (
    isObject(o) &&
    isObject(o.identificationSegment) &&
    typeof o.identificationSegment.registryNumber === 'string' &&
    isObject(o.generalSegment) &&
    o.bolSpecificSegment === undefined &&
    o.blSegments === undefined &&
    o.totalsSegment === undefined
  );
}

function isBl(o: any): boolean {
  return (
    isObject(o) &&
    isObject(o.bolSpecificSegment) &&
    isObject(o.identificationSegment) &&
    typeof o.identificationSegment.bolReference === 'string'
  );
}

function isRegister(o: any): boolean {
  return isObject(o) && isObject(o.totalsSegment);
}

// Lightweight re-implementation of convert.ts's register cross-check, kept
// here (rather than importing lib/convert.ts) so this client-side module
// doesn't drag fast-xml-parser into the browser bundle.
function crossCheckRegister(blSegments: BodogwuBl[], register: BodogwuRegister): string[] {
  const warnings: string[] = [];
  if (register.totalsSegment.totalNumberOfBols !== blSegments.length) {
    warnings.push(
      `Register.totalsSegment.totalNumberOfBols (${register.totalsSegment.totalNumberOfBols}) does not match the actual number of BLs supplied (${blSegments.length}).`
    );
  }
  const totalPackages = blSegments.reduce(
    (sum, bl) => sum + (bl.bolSpecificSegment.packagesSegment.numberOfPackages || 0),
    0
  );
  if (register.totalsSegment.totalNumberOfPackages !== totalPackages) {
    warnings.push(
      `Register.totalsSegment.totalNumberOfPackages (${register.totalsSegment.totalNumberOfPackages}) does not match the sum computed from the BL files (${totalPackages}).`
    );
  }
  return warnings;
}

// Accepts whatever came out of readJsonOrZipFiles — any mix of:
//  - a complete single-upload manifest ({ manifestHdr, blSegments })
//  - a manifest header alone (identificationSegment + generalSegment)
//  - a BL segment alone, or an array of them
//  - a register/totals file
// uploaded as one file, several files, or unpacked from a .zip — in any
// combination — and figures out how many manifests are actually present.
//
// - One header + any BL(s) (+ optional register) => merge into one manifest
//   (register totals are cross-checked, same as the old "3-segment" mode).
// - Several headers => each is paired with the BL(s) whose
//   identificationSegment.registryNumber matches that header's own
//   registryNumber. Register files aren't auto-applied in this case, since
//   there's no reliable key to know which manifest each belongs to.
// - Anything already a complete manifest passes through untouched.
export function smartMergeBodogwuUploads(items: NamedJson[]): SmartMergeResult {
  const warnings: string[] = [];
  const manifests: GroupedManifest[] = [];
  const headers: { name: string; data: BodogwuHeader }[] = [];
  const blGroups = new Map<string, BodogwuBl[]>();
  const registers: { name: string; data: BodogwuRegister }[] = [];
  const unrecognized: string[] = [];

  // Expand top-level arrays (e.g. a file that's just `[bl1, bl2, ...]`) into
  // individual candidates so each element gets classified on its own.
  const candidates: { name: string; data: any }[] = [];
  for (const item of items) {
    if (Array.isArray(item.data)) {
      item.data.forEach((el: any, i: number) =>
        candidates.push({ name: item.data.length > 1 ? `${item.name}_${i + 1}` : item.name, data: el })
      );
    } else {
      candidates.push(item);
    }
  }

  for (const c of candidates) {
    if (isManifest(c.data)) {
      manifests.push({ name: c.name, manifestHdr: c.data.manifestHdr, blSegments: c.data.blSegments });
    } else if (isHeader(c.data)) {
      headers.push({ name: c.name, data: c.data });
    } else if (isBl(c.data)) {
      const key = c.data.identificationSegment.registryNumber || '__unkeyed__';
      const arr = blGroups.get(key) || [];
      arr.push(c.data);
      blGroups.set(key, arr);
    } else if (isRegister(c.data)) {
      registers.push({ name: c.name, data: c.data });
    } else {
      unrecognized.push(c.name);
    }
  }

  if (unrecognized.length > 0) {
    warnings.push(
      `Couldn't recognize ${unrecognized.length} uploaded item(s) as a B'Odogwu manifest, header, BL, or register — skipped: ${unrecognized.join(', ')}.`
    );
  }

  if (headers.length === 1) {
    // Single-manifest case: every BL supplied belongs to this one header,
    // regardless of its own registryNumber (matches the old "3-segment"
    // mode's behavior). Any register file cross-checks totals.
    const header = headers[0];
    const allBls = Array.from(blGroups.values()).flat();
    if (allBls.length === 0) {
      warnings.push(`Header "${header.name}" was uploaded with no BL files — skipped.`);
    } else {
      if (registers.length > 1) {
        warnings.push(
          `${registers.length} register files were uploaded alongside a single header — using "${registers[0].name}" and ignoring the rest.`
        );
      }
      if (registers.length > 0) {
        warnings.push(...crossCheckRegister(allBls, registers[0].data));
      }
      manifests.push({ name: header.name, manifestHdr: header.data, blSegments: allBls });
    }
  } else if (headers.length > 1) {
    // Multi-manifest case: pair each header with BLs sharing its registryNumber.
    for (const header of headers) {
      const key = header.data.identificationSegment.registryNumber;
      const bls = blGroups.get(key) || [];
      blGroups.delete(key);
      if (bls.length === 0) {
        warnings.push(
          `Header "${header.name}" (registry number ${key}) has no BL files with a matching registryNumber — skipped.`
        );
        continue;
      }
      manifests.push({ name: header.name, manifestHdr: header.data, blSegments: bls });
    }
    for (const [key, bls] of blGroups) {
      warnings.push(
        `${bls.length} BL(s) with registry number "${key === '__unkeyed__' ? '(none)' : key}" didn't match any uploaded header — skipped.`
      );
    }
    if (registers.length > 0) {
      warnings.push(
        `${registers.length} register file(s) were uploaded alongside multiple headers — register cross-checking isn't applied when batching more than one manifest, since there's no reliable way to tell which manifest each register belongs to.`
      );
    }
  } else if (blGroups.size > 0) {
    // BLs with no header at all.
    const orphanCount = Array.from(blGroups.values()).flat().length;
    warnings.push(`${orphanCount} BL(s) were uploaded with no manifest header — skipped.`);
  }

  return { manifests, warnings };
}

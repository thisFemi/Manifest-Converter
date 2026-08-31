// B'Odogwu stores a party's address as a single free-text string.
// GovCBR stores it as a structured block: CityName / CountryCode / Line / PostcodeID.
// Neither sample source reliably breaks city/country out of B'Odogwu free text,
// so the safe, lossless approach is: keep the full text in `Line`, and leave
// CityName/CountryCode/PostcodeID as placeholders ("-" / "NA") the same way
// the GovCBR sample itself uses those placeholders for unknown values.

export interface GovCbrAddress {
  CityName: string;
  CountryCode: string;
  Line: string;
  PostcodeID: string;
}

export interface GovCbrParty {
  Name: string;
  Address: GovCbrAddress;
}

export interface GovCbrPartyWithId extends GovCbrParty {
  ID: string;
}

export function addressToGovCbr(freeTextAddress: string): GovCbrAddress {
  const line = (freeTextAddress || '').trim();
  return {
    CityName: '-',
    CountryCode: 'NA',
    Line: line.length > 0 ? line : 'NA',
    PostcodeID: 'NA',
  };
}

export function partyToGovCbr(name: string, address: string): GovCbrParty {
  return {
    Name: name || '',
    Address: addressToGovCbr(address),
  };
}

export function partyToGovCbrWithId(
  name: string,
  address: string,
  id: string
): GovCbrPartyWithId {
  return {
    Name: name || '',
    ID: id && id.trim().length > 0 ? id : 'NA',
    Address: addressToGovCbr(address),
  };
}

// Reverse: GovCBR structured address -> a single B'Odogwu free-text string.
// Placeholder values ("-", "NA") are dropped so we don't pollute the BO
// address with literal "NA" text; if everything is a placeholder we fall
// back to "-" (matching the BO sample's own convention for unknown values).
export function addressFromGovCbr(addr?: Partial<GovCbrAddress>): string {
  if (!addr) return '-';
  const parts = [addr.CityName, addr.Line, addr.PostcodeID].filter(
    (v) => v && v !== '-' && v.toUpperCase() !== 'NA'
  );
  return parts.length > 0 ? parts.join(', ') : '-';
}

export function nameFromGovCbr(party?: { Name?: string }): string {
  return party?.Name?.trim() || '';
}

export function idFromGovCbr(party?: { ID?: string }): string {
  const id = party?.ID?.trim();
  return id && id.toUpperCase() !== 'NA' ? id : '';
}

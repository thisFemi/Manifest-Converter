# NSW Manifest Conversion Desk

Converts shipping-line manifests between **GovCBR** (customs Declaration XML,
wrapped in JSON), **B'Odogwu** (NSW's native JSON manifest format), and
**raw B'Odogwu XML** (`TWM_Manifest` / `TWM_BOL` / `eRegistrationRequest`).

## Features

1. **GovCBR → B'Odogwu** (single upload) — also asks for an **Arrival Date/Time**
   (GovCBR has no arrival field at all, so this fills `arrivalSegment` in the
   output), and outputs a small `SEN.json` file since B'Odogwu has nowhere to
   store the `senReferenceNumber`.
2. **B'Odogwu → GovCBR** (single upload) — asks for a **SEN** and a **TIN**
   (`Submitter.ID`), plus an optional **NIMASA terminal agent code**
   (defaults to `AGENT-BP001100`).
3. **B'Odogwu (header file + one or more BL files, + optional Register.json)
   → GovCBR** — merges the segments first, optionally cross-checks totals
   against the Register file, then converts. Same SEN/TIN/NIMASA fields as above.
4. **Raw XML → B'Odogwu or GovCBR** — the featured section at the top of the
   page (most manifests arrive this way). For manifests received as raw
   B'Odogwu XML rather than JSON: `TWM_Manifest` (header), one or more
   `TWM_BOL` files (or a `.zip` folder of them), and an optional
   `eRegistrationRequest` (register/totals). Each piece — header, BLs,
   register — converts and downloads **independently**: convert just the
   header, or just the BLs (one output file per BL, individually downloadable
   or all zipped together), or just the register, without needing the other
   files. Or upload all of them and use the merge flow below to combine into
   one B'Odogwu manifest or straight to GovCBR (same SEN/TIN/NIMASA fields as
   mode 3).

Every conversion result shows inline in the page — expand any output file to
preview its JSON, download it individually, or use **Download all** (top of
the results) to get every output file zipped together when there's more than one.

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

For a production build:

```bash
npm run build
npm run start
```

## Testing against real sample data

Two scripts run the conversion paths against real sample files without
needing the web server:

```bash
npx tsx scripts/test-convert.ts       # JSON-based conversions (modes 1-3)
npx tsx scripts/test-xml-convert.ts   # raw-XML conversion (mode 4)
```

Output files land in `fixtures/_out_*.json` for inspection.

## Deploying

This is a plain Next.js app — no special config needed for either target:

- **Vercel**: `vercel deploy` (or connect the repo in the dashboard). Zero config.
- **Cloudflare**: use `@opennextjs/cloudflare` (`npx opennextjs-cloudflare build`
  then `wrangler deploy`). Not yet wired up in this scaffold — say the word
  and I'll add the Cloudflare adapter and `wrangler.toml` if you land on
  Cloudflare over Vercel.

## Field mapping — what's exact vs. best-effort

The two formats don't map 1:1. Fields fall into three buckets:

**Direct mapping** (high confidence — same concept, just renamed):
- `TransportContractDocument.ID` ↔ `bolReference`
- `GovernmentProcedure.CurrentCode` ↔ `bolNature`
- `LoadingLocation.ID` / `DeliveryDestination.ID` ↔ `placeOfLoadingSegment.code` / `placeOfUnloadingSegment.code`
- `DeclarationOffice.ID` ↔ `customsOfficeSegment.code`
- `FunctionalReferenceID` ↔ `registryNumber` (header)
- `Consignor` / `Consignee` / `NotifyParty` ↔ `exporterSegment` / `consigneeSegment` / `notifySegment`
- `GoodsMeasure.GrossMassMeasure` ↔ `totalGrossMassManifested`
- `GoodsMeasure.NetVolumeMeasure` ↔ `volumeInCubicMeters`
- `Packaging.MarksNumbersID` ↔ `shippingMarks`
- `TotalPackageQuantity` ↔ `packagesSegment.numberOfPackages`
- `AdditionalInformation[GOODSDESC]` / `Commodity.CargoDescription` ↔ `goodsDescription`
- `Freight.PaymentMethodCode` / `RateAmount` ↔ `freightSegment.indicatorSegment.code` / `.value`

**Derived / best-effort** (flagged as a "warning" in every conversion response,
also shown in the UI as *inspection notes*):
- Address fields — B'Odogwu stores address as one free-text string; GovCBR
  wants `CityName` / `CountryCode` / `Line` / `PostcodeID` structured. We keep
  the full text in `Line` and placeholder the rest (`-` / `NA`), same
  convention your own GovCBR sample uses for unknowns.
- `manifestHdr.destinationSegment` / `departureSegment` — GovCBR has these
  per-consignment, not per-manifest; we take the first consignment's value
  and warn if consignments disagree.
- `tonnageSegment.grossTonnage` / `netTonnage` — GovCBR has no manifest-level
  tonnage field (on GovCBR → B'Odogwu), so it's computed as the sum of all
  consignments' gross mass.
- Container vs. non-containerized (vehicle) BLs are told apart by whether
  `TransportEquipment.CharacteristicCode` is present.

**No source field — configurable constants** (editable in the UI under
"agent settings", defaulted from your sample files): `FunctionCode`,
`StatusCode`, `TypeCode`, rotation number, `ContainerCode`, `ActionCode`,
`PURPOSE`, and the HS code fallback (`Classification.ID`) when a real HS
code isn't available. `Submitter.ID` (TIN) and `NIMASATERMAGTCODE` are
dedicated required/optional fields on the B'Odogwu → GovCBR forms rather
than buried in advanced settings.

**Fixed defaults** (per your corrections):
- `modeOfTransportSegment.code` → always `"1"` (Sea Manifest) on GovCBR → B'Odogwu
- `bolTypeSegment.code` → defaults to `"Master"` when GovCBR's `TransportContractDocument.TypeCode`
  is empty or the sample's generic placeholder value `"Typ"`
- `lineNumber` → always assigned as a strict sequential count (1, 2, 3…) across
  the output BLs, not trusted from GovCBR's `SequenceNumeric` (which isn't
  guaranteed unique/sequential in source data)
- `BorderTransportMeans.JourneyID` → set to the same value as
  `FunctionalReferenceID` / `registryNumber` (B'Odogwu has no separate
  voyage/journey field), overridable via the Journey ID advanced field
- **Money fields** (`ValueAmount`, `RateAmount`) → always formatted to exactly
  2 decimal places and floor-clamped to a minimum of `0.01`. NSW's schema
  defines these as `AmountType` with `minInclusive="0.01"` — a literal `0`
  (which B'Odogwu has no source value for) fails XML Schema validation with
  `cvc-minInclusive-valid`. Since B'Odogwu doesn't carry a declared value for
  these, they default to the schema-minimum `0.01` rather than a fabricated
  number — flag if you have a real source for declared value / freight rate
  and I'll wire it in instead of the floor default.

## Raw B'Odogwu XML support

`TWM_Manifest`, `TWM_BOL`, and `eRegistrationRequest` XML use the exact same
schema as the B'Odogwu JSON format — just serialized with
`PascalCase_With_Underscores` tags instead of camelCase JSON keys, no
attributes. `lib/xml-bodogwu.ts` maps every tag onto the same types
`lib/convert.ts` already works with, so once parsed, everything downstream
(GovCBR conversion, the UI, warnings) is identical to the JSON path.

One field is a positional guess rather than a confirmed 1:1: a `<Container>`
element's `<Number>` tag is mapped to `numberOfPackages` (matching the JSON
schema's field at that same struct position) — it may actually represent a
container sequence number in some source systems rather than a package
count. Flag if your NSW submissions need that split out differently.

### Corrections from cross-checking another converter's output

A batch of 5 real BLs was run through this tool and through another
converter, and the outputs compared field-by-field. Three real fixes came
out of that and are now applied:

- **`bolTypeSegment.code`**: raw XML's generic `"BL"` code now maps to
  `"House"` (was previously passed through literally as `"BL"`). `"MBL"`/`"Master"`
  map to `"Master"`. This matched the reference converter on every one of the
  5 sample BLs.
- **`items[]` synthesis**: a BL with no `<Container>` and no explicit `<Item>`
  elements now gets one synthesized item from its own goods description and
  package count, instead of an empty `items: []`. Matches the reference
  converter's behavior for loose/non-containerized cargo.
- **`containers[].numberOfPackages`**: now parsed as a number (was a string),
  matching the reference converter and the field's type elsewhere in the schema.

Two more differences showed up that were **not** changed, because I don't
have enough information to know which behavior is actually correct:

- **`freightSegment`/`customsSegment`/`transportSegment`/`insuranceSegment`
  values**: this tool defaults empty/missing source fields to `0` and `""`;
  the reference converter used `null`. Both are defensible — `0` is what the
  rest of this codebase already assumes (including the GovCBR conversion
  path), but `null` is arguably more honest about "not provided" vs.
  "explicitly zero." If NSW's schema expects `null` here, say so and I'll
  change it (and the TypeScript types) throughout.
- **`volumeInCubicMeters`**: the reference converter returned `null` for
  every one of the 5 BLs, while this tool returned distinct, specific decimal
  values (40.68, 2.35, 38.51, 38, 38) for each. Since those numbers vary
  per-BL and match what you'd expect from real cargo data, this looks like a
  bug in the *other* converter (e.g. looking up the wrong XML tag) rather
  than something to fix here — but I haven't seen that converter's source to
  confirm.

Trailing whitespace in names/addresses/descriptions (present in the raw XML,
e.g. `"3T OIL GAS SERVICES LLC "`) is trimmed by this tool's parser. The
reference converter preserves it. This was left as-is — trimmed data is
the more correct behavior, not a bug.

**Please review this mapping against actual NSW/GovCBR validation rules**
before this goes anywhere near production — I built it from the sample files
you shared, not the official schema/XSD, so anything the samples didn't
exercise (e.g. multi-item consignments, non-"23" government procedure codes)
is untested.

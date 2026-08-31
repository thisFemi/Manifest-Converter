import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import {
  BodogwuHeader,
  BodogwuBl,
  BodogwuSingleUpload,
  BodogwuRegister,
  GovCbrFile,
  GovCbrAgentConfig,
  DEFAULT_AGENT_CONFIG,
} from './types';
import {
  partyToGovCbr,
  partyToGovCbrWithId,
  addressFromGovCbr,
  nameFromGovCbr,
  idFromGovCbr,
} from './address';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: true,
  trimValues: true,
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  suppressEmptyNode: false,
});

// The NSW GovCBR schema defines money fields (ValueAmount, RateAmount, etc.)
// as AmountType with minInclusive="0.01" — a literal 0 fails XML Schema
// validation ("cvc-minInclusive-valid"), and values need exactly 2 decimal
// places. This formats any monetary value to satisfy both, floor-clamping
// to 0.01 when the source value is missing/zero/negative.
function formatAmount(value: number | undefined | null, min = 0.01): string {
  const n = typeof value === 'number' && isFinite(value) && value > 0 ? value : min;
  return n.toFixed(2);
}

// A note attached to the conversion result so the shipping-line ops team can
// see which fields were best-effort / defaulted rather than a direct 1:1
// mapping from the source document. Nothing here blocks the conversion —
// these are informational, not errors.
export interface ConversionResult<T> {
  data: T;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// B'Odogwu -> GovCBR
// ---------------------------------------------------------------------------

export function bodogwuToGovCbr(
  header: BodogwuHeader,
  bls: BodogwuBl[],
  sen: string,
  indicator: 'I' | 'O',
  tin: string,
  config: GovCbrAgentConfig = DEFAULT_AGENT_CONFIG,
  journeyIdOverride?: string
): ConversionResult<GovCbrFile> {
  const warnings: string[] = [];

  if (!sen || sen.trim().length === 0) {
    warnings.push('SEN was empty — GovCBR output has a blank senReferenceNumber.');
  }
  if (!tin || tin.trim().length === 0) {
    warnings.push('TIN was empty — GovCBR output has a blank Submitter.ID.');
  }

  const acceptanceDate = header.identificationSegment.date || '';
  const journeyId = journeyIdOverride || header.identificationSegment.registryNumber || '';
  if (!journeyIdOverride) {
    warnings.push(
      `BorderTransportMeans.JourneyID has no direct B'Odogwu equivalent — defaulted to the same value as FunctionalReferenceID ("${journeyId}"). Override it if the NSW portal expects a distinct voyage code.`
    );
  }

  const consignments = bls.map((bl) => {
    const spec = bl.bolSpecificSegment;
    const container = bl.containers[0];
    const item = bl.items[0];

    // A BL is "containerized" if it has a container entry with a type code;
    // otherwise (e.g. vehicle/RoRo cargo) we fall back to the items[] entry.
    const isContainerized = Boolean(container?.type);
    const equipmentId = isContainerized
      ? container?.reference || ''
      : container?.reference || item?.itemDescription || '';

    const additionalInformation: Record<string, unknown>[] = [
      {
        StatementCode: 'PURPOSE',
        StatementDescription: config.purpose,
        StatementTypeCode: 'ACF',
        Pointer: { SequenceNumeric: 1 },
      },
      {
        StatementCode: 'GOODSDESC',
        StatementDescription: spec.goodsDescription || '',
      },
    ];

    return {
      ContainerCode: config.containerCode,
      SequenceNumeric: spec.lineNumber,
      ValueAmount: { '@_currencyID': 'USD', '#text': formatAmount(undefined) },
      TotalPackageQuantity: {
        '@_unitCode': 'PK',
        '#text': spec.packagesSegment.numberOfPackages,
      },
      ActionCode: config.actionCode,
      AdditionalInformation: additionalInformation,
      Carrier: partyToGovCbr(
        header.generalSegment.carrierSegment.name,
        header.generalSegment.carrierSegment.address
      ),
      Consignee: partyToGovCbr(spec.consigneeSegment.name, spec.consigneeSegment.address),
      ConsignmentItem: {
        SequenceNumeric: 1,
        Commodity: {
          SequenceNumeric: 1,
          CargoDescription: spec.goodsDescription || '',
          Classification: { ID: config.hsCode, IdentificationTypeCode: 'HS' },
        },
        Freight: {
          PaymentMethodCode: spec.freightSegment.indicatorSegment.code || 'Pay',
          RateAmount: { '@_currencyID': spec.freightSegment.currency || 'USD', '#text': formatAmount(spec.freightSegment.value) },
        },
        GoodsMeasure: {
          GrossMassMeasure: { '@_unitCode': 'KGM', '#text': spec.totalGrossMassManifested },
          NetVolumeMeasure: spec.volumeInCubicMeters,
        },
        Packaging: {
          MarksNumbersID: spec.shippingMarks || '',
          QuantityQuantity: {
            '@_unitCode': 'EA',
            '#text': spec.packagesSegment.numberOfPackages,
          },
        },
        TransportEquipment: { SequenceNumeric: 1, ID: equipmentId },
      },
      Consignor: partyToGovCbrWithId(
        spec.exporterSegment.name,
        spec.exporterSegment.address,
        spec.exporterSegment.code
      ),
      DeliveryDestination: { ID: spec.placeOfUnloadingSegment.code },
      GoodsReceiptPlace: { Name: '' },
      GovernmentProcedure: { CurrentCode: spec.bolNature },
      LoadingLocation: { ID: spec.placeOfLoadingSegment.code },
      NotifyParty: partyToGovCbr(spec.notifySegment.name, spec.notifySegment.address),
      TransportContractDocument: {
        ID: bl.identificationSegment.bolReference,
        TypeCode: spec.bolTypeSegment.code || config.transportContractTypeCode,
      },
      TransportEquipment: {
        SequenceNumeric: 1,
        CharacteristicCode: container?.type || '',
        FullnessCode: container?.emptyFull || '',
        ID: equipmentId,
        Seal: { ID: container?.seals || spec.sealsSegment.marksOfSeals || '' },
        TransportEquipmentMeasure: { TareWeightMeasure: { '@_unitCode': 'KGM', '#text': 0 } },
      },
      UnloadingLocation: { Name: '', ID: spec.placeOfUnloadingSegment.code },
    };
  });

  warnings.push(
    `ValueAmount has no source field in B'Odogwu — defaulted to ${formatAmount(undefined)} (the NSW schema rejects 0 for money fields; minimum is 0.01). TareWeightMeasure still defaults to 0 since it's a weight, not a currency amount — flag if that also needs a non-zero minimum.`
  );

  const declarationObj = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    Declaration: {
      '@_xmlns': 'http://globaletrade.services/Declaration',
      AcceptanceDateTime: {
        DateTimeString: { '@_xmlns': '', '@_formatCode': 'yyyy-MM-dd HH:mm:ss', '#text': `${acceptanceDate} 00:00:00` },
      },
      FunctionCode: config.functionCode,
      FunctionalReferenceID: header.identificationSegment.registryNumber,
      StatusCode: config.statusCode,
      TypeCode: config.typeCode,
      Submitter: { ID: tin },
      DeclarationOffice: { ID: header.identificationSegment.customsOfficeSegment.code },
      AdditionalInformation: [
        {
          StatementCode: 'ROTATIONNO',
          StatementDescription: config.rotationNo,
          StatementTypeCode: 'ACF',
        },
        {
          StatementCode: 'NIMASATERMAGTCODE',
          StatementDescription: config.nimasaTermAgtCode,
        },
      ],
      BorderTransportMeans: { JourneyID: journeyId },
      Consignment: consignments,
    },
  };

  let xmlString = xmlBuilder.build(declarationObj) as string;
  // fast-xml-parser renders the "?xml" pseudo-node as its own tag when built
  // this way in some versions; normalize to a clean XML prolog + single line
  // start so it matches the shape of the sample GovCBR files exactly.
  xmlString = xmlString
    .replace(/<\?xml[^>]*\?>/, '<?xml version="1.0" encoding="UTF-8"?>')
    .replace(/\n\s*/g, ' ')
    .trim();

  return {
    data: {
      senReferenceNumber: sen,
      inbound_outbound_indicator: indicator,
      xmlString,
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// GovCBR -> B'Odogwu
// ---------------------------------------------------------------------------

export function govCbrToBodogwu(
  govCbr: GovCbrFile,
  arrivalDate?: string,
  arrivalTime?: string
): ConversionResult<{ bodogwu: BodogwuSingleUpload; senReferenceNumber: string; inbound_outbound_indicator: string }> {
  const warnings: string[] = [];
  const parsed = xmlParser.parse(govCbr.xmlString);
  const declaration = parsed.Declaration;

  if (!declaration) {
    throw new Error('xmlString does not contain a <Declaration> root element.');
  }

  const consignmentsRaw = declaration.Consignment;
  const consignments = Array.isArray(consignmentsRaw) ? consignmentsRaw : [consignmentsRaw];

  const dateTimeString: string =
    declaration.AcceptanceDateTime?.DateTimeString?.['#text'] ||
    declaration.AcceptanceDateTime?.DateTimeString ||
    '';
  const acceptanceDate = dateTimeString.split(' ')[0] || '';

  const firstConsignment = consignments[0];
  const carrier = firstConsignment?.Carrier;

  if (!carrier) {
    warnings.push('No Carrier found on the first Consignment — manifestHdr.carrierSegment left blank.');
  }

  const destinations = new Set(consignments.map((c: any) => c?.DeliveryDestination?.ID).filter(Boolean));
  const departures = new Set(consignments.map((c: any) => c?.LoadingLocation?.ID).filter(Boolean));
  if (destinations.size > 1) {
    warnings.push(
      `Consignments have differing DeliveryDestination values (${[...destinations].join(', ')}) — manifestHdr.destinationSegment uses the first one.`
    );
  }
  if (departures.size > 1) {
    warnings.push(
      `Consignments have differing LoadingLocation values (${[...departures].join(', ')}) — manifestHdr.departureSegment uses the first one.`
    );
  }

  const totalGrossMass = consignments.reduce((sum: number, c: any) => {
    const g = c?.ConsignmentItem?.GoodsMeasure?.GrossMassMeasure;
    const val = typeof g === 'object' ? Number(g?.['#text'] ?? 0) : Number(g ?? 0);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const header: BodogwuHeader = {
    identificationSegment: {
      registryNumber: declaration.FunctionalReferenceID || '',
      date: acceptanceDate,
      customsOfficeSegment: { code: declaration.DeclarationOffice?.ID || '' },
    },
    generalSegment: {
      masterInformation: '',
      lastDischarge: '',
      arrivalSegment: { dateOfArrival: arrivalDate || '', timeOfArrival: arrivalTime || '' },
      departureSegment: { code: [...departures][0] || '' },
      destinationSegment: { code: [...destinations][0] || '' },
      carrierSegment: {
        name: nameFromGovCbr(carrier),
        address: addressFromGovCbr(carrier?.Address),
        code: '',
      },
      transportSegment: {
        nameOfTransporter: declaration.BorderTransportMeans?.JourneyID || '',
        placeOfTransporter: '',
        modeOfTransportSegment: { code: '1' },
        nationalityOfTransportSegment: { code: '' },
        transporterRegistrationSegment: { registrationNumber: '', registrationDate: '' },
      },
      tonnageSegment: { grossTonnage: totalGrossMass, netTonnage: totalGrossMass },
    },
  };
  if (!arrivalDate) {
    warnings.push(
      'GovCBR has no arrival date field — manifestHdr.arrivalSegment.dateOfArrival left blank. Supply an Arrival Date to fill it in.'
    );
  }
  warnings.push(
    'manifestHdr.transportSegment (nationality/registration) and masterInformation have no source in GovCBR — left blank/empty.'
  );

  const blSegments: BodogwuBl[] = consignments.map((c: any, idx: number) => {
    const item = c.ConsignmentItem;
    const equipment = c.TransportEquipment; // consignment-level (not ConsignmentItem's)
    const isContainerized = Boolean(equipment?.CharacteristicCode);

    const goodsDescStatement = Array.isArray(c.AdditionalInformation)
      ? c.AdditionalInformation.find((ai: any) => ai.StatementCode === 'GOODSDESC')
      : c.AdditionalInformation?.StatementCode === 'GOODSDESC'
      ? c.AdditionalInformation
      : undefined;
    const goodsDescription =
      goodsDescStatement?.StatementDescription || item?.Commodity?.CargoDescription || '';

    const grossMassRaw = item?.GoodsMeasure?.GrossMassMeasure;
    const grossMass = typeof grossMassRaw === 'object' ? Number(grossMassRaw?.['#text'] ?? 0) : Number(grossMassRaw ?? 0);

    const packageQtyRaw = c.TotalPackageQuantity;
    const packageQty = typeof packageQtyRaw === 'object' ? Number(packageQtyRaw?.['#text'] ?? 0) : Number(packageQtyRaw ?? 0);

    const freightRateRaw = item?.Freight?.RateAmount;
    const freightValue = typeof freightRateRaw === 'object' ? Number(freightRateRaw?.['#text'] ?? 0) : Number(freightRateRaw ?? 0);
    const freightCurrency = typeof freightRateRaw === 'object' ? freightRateRaw?.['@_currencyID'] || 'USD' : 'USD';

    const sealId = equipment?.Seal?.ID || '';

    const containers = isContainerized
      ? [
          {
            reference: equipment?.ID || '',
            numberOfPackages: String(packageQty),
            type: equipment?.CharacteristicCode || '',
            emptyFull: equipment?.FullnessCode || '',
            seals: sealId,
            marks1: '',
            marks2: '',
            sealingParty: '',
          },
        ]
      : [];

    const items = !isContainerized && equipment?.ID
      ? [
          {
            itemNumber: 1,
            itemDescription: equipment.ID,
            numberOfPackages: 1,
            packageTypeCode: 'VH',
          },
        ]
      : [];

    return {
      identificationSegment: {
        bolReference: c.TransportContractDocument?.ID || '',
        registryNumber: header.identificationSegment.registryNumber,
        date: header.identificationSegment.date,
        customsOfficeSegment: { code: header.identificationSegment.customsOfficeSegment.code },
      },
      bolSpecificSegment: {
        lineNumber: idx + 1,
        previousDocumentReference: '',
        bolNature: c.GovernmentProcedure?.CurrentCode || '',
        uniqueCarrierReference: '',
        totalNumberOfContainers: isContainerized ? 1 : 0,
        totalGrossMassManifested: grossMass,
        volumeInCubicMeters: Number(item?.GoodsMeasure?.NetVolumeMeasure ?? 0),
        numberOfSubBols: 0,
        bolTypeSegment: {
          code:
            c.TransportContractDocument?.TypeCode &&
            c.TransportContractDocument.TypeCode !== 'Typ'
              ? c.TransportContractDocument.TypeCode
              : 'Master',
        },
        exporterSegment: {
          name: nameFromGovCbr(c.Consignor),
          address: addressFromGovCbr(c.Consignor?.Address),
          code: idFromGovCbr(c.Consignor),
        },
        consigneeSegment: {
          name: nameFromGovCbr(c.Consignee),
          address: addressFromGovCbr(c.Consignee?.Address),
          code: '',
        },
        notifySegment: {
          name: nameFromGovCbr(c.NotifyParty),
          address: addressFromGovCbr(c.NotifyParty?.Address),
          code: '',
        },
        placeOfLoadingSegment: { code: c.LoadingLocation?.ID || '' },
        placeOfUnloadingSegment: { code: c.DeliveryDestination?.ID || '' },
        packagesSegment: { packageTypeCode: isContainerized ? 'CT' : 'VH', numberOfPackages: packageQty },
        shippingMarks: item?.Packaging?.MarksNumbersID || '',
        goodsDescription,
        freightSegment: {
          indicatorSegment: { code: item?.Freight?.PaymentMethodCode || '' },
          value: freightValue,
          currency: freightCurrency,
        },
        customsSegment: { value: 0, currency: 'USD' },
        transportSegment: { value: 0, currency: 'USD' },
        insuranceSegment: { value: 0, currency: 'USD' },
        sealsSegment: {
          numberOfSeals: sealId ? 1 : 0,
          marksOfSeals: sealId,
          sealingPartyCode: '',
        },
        informationPartA: '',
        operationsSegment: { locationSegment: { information: '', code: '' } },
      },
      containers,
      items,
    };
  });

  warnings.push(
    'customsSegment/transportSegment/insuranceSegment values, seal party codes and container marks have no source in GovCBR — defaulted to 0/empty.'
  );

  return {
    data: {
      bodogwu: { manifestHdr: header, blSegments },
      senReferenceNumber: govCbr.senReferenceNumber,
      inbound_outbound_indicator: govCbr.inbound_outbound_indicator,
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// 3-segment B'Odogwu (header file + BL array files + register) -> single upload
// ---------------------------------------------------------------------------

export function mergeThreeSegments(
  header: BodogwuHeader,
  blFiles: BodogwuBl[][],
  register?: BodogwuRegister
): ConversionResult<BodogwuSingleUpload> {
  const warnings: string[] = [];
  const blSegments = blFiles.flat();

  if (register) {
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
  }

  return { data: { manifestHdr: header, blSegments }, warnings };
}

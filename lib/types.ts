// ---------------------------------------------------------------------------
// B'Odogwu types
// ---------------------------------------------------------------------------

export interface BodogwuHeader {
  identificationSegment: {
    registryNumber: string;
    date: string;
    customsOfficeSegment: { code: string };
  };
  generalSegment: {
    masterInformation: string;
    lastDischarge: string;
    arrivalSegment: { dateOfArrival: string; timeOfArrival: string };
    departureSegment: { code: string };
    destinationSegment: { code: string };
    carrierSegment: { name: string; address: string; code: string };
    transportSegment: {
      nameOfTransporter: string;
      placeOfTransporter: string;
      modeOfTransportSegment: { code: string };
      nationalityOfTransportSegment: { code: string };
      transporterRegistrationSegment: {
        registrationNumber: string;
        registrationDate: string;
      };
    };
    tonnageSegment: { grossTonnage: number | string; netTonnage: number | string };
  };
}

export interface BodogwuContainer {
  reference: string;
  numberOfPackages: string | number;
  type: string;
  emptyFull: string;
  seals: string;
  marks1: string;
  marks2: string;
  sealingParty: string;
}

export interface BodogwuItem {
  itemNumber: number;
  itemDescription: string;
  numberOfPackages: number;
  packageTypeCode: string;
}

export interface BodogwuBl {
  identificationSegment: {
    bolReference: string;
    registryNumber: string;
    date: string;
    customsOfficeSegment: { code: string };
  };
  bolSpecificSegment: {
    lineNumber: number;
    previousDocumentReference: string;
    bolNature: string;
    uniqueCarrierReference: string;
    totalNumberOfContainers: number;
    totalGrossMassManifested: number;
    volumeInCubicMeters: number;
    numberOfSubBols: number;
    bolTypeSegment: { code: string };
    exporterSegment: { name: string; address: string; code: string };
    consigneeSegment: { name: string; address: string; code: string };
    notifySegment: { name: string; address: string; code: string };
    placeOfLoadingSegment: { code: string };
    placeOfUnloadingSegment: { code: string };
    packagesSegment: { packageTypeCode: string; numberOfPackages: number };
    shippingMarks: string;
    goodsDescription: string;
    freightSegment: {
      indicatorSegment: { code: string };
      value: number;
      currency: string;
    };
    customsSegment: { value: number; currency: string };
    transportSegment: { value: number; currency: string };
    insuranceSegment: { value: number; currency: string };
    sealsSegment: {
      numberOfSeals: number;
      marksOfSeals: string;
      sealingPartyCode: string;
    };
    informationPartA: string;
    operationsSegment: { locationSegment: { information: string; code: string } };
  };
  containers: BodogwuContainer[];
  items: BodogwuItem[];
}

export interface BodogwuRegister {
  totalsSegment: {
    totalNumberOfBols: number;
    totalNumberOfContainers: number;
    totalNumberOfPackages: number;
    totalNumberOfVehicles: number;
    totalGrossMass: number;
  };
}

export interface BodogwuSingleUpload {
  manifestHdr: BodogwuHeader;
  blSegments: BodogwuBl[];
}

// ---------------------------------------------------------------------------
// GovCBR types
// ---------------------------------------------------------------------------

export interface GovCbrFile {
  senReferenceNumber: string;
  inbound_outbound_indicator: 'I' | 'O';
  xmlString: string;
}

// Config values that exist on the GovCBR side but have no equivalent
// anywhere in the B'Odogwu data. These are not derived from BL/header data;
// they're carrier/agent-level settings that stay constant across a given
// shipping line's submissions. Editable in the UI, defaulted from the
// sample files you provided.
export interface GovCbrAgentConfig {
  submitterId: string; // Submitter/ID, e.g. "01313714-0001"
  functionCode: string; // FunctionCode, e.g. "9"
  statusCode: string; // StatusCode, e.g. "3"
  typeCode: string; // TypeCode, e.g. "M"
  rotationNo: string; // AdditionalInformation ROTATIONNO
  nimasaTermAgtCode: string; // AdditionalInformation NIMASATERMAGTCODE
  containerCode: string; // Consignment/ContainerCode, e.g. "68"
  actionCode: string; // Consignment/ActionCode, e.g. "1"
  purpose: string; // AdditionalInformation PURPOSE, e.g. "PERSONAL"
  hsCode: string; // Commodity/Classification/ID fallback when unknown
  transportContractTypeCode: string; // TransportContractDocument/TypeCode, e.g. "Typ"
}

export const DEFAULT_AGENT_CONFIG: GovCbrAgentConfig = {
  submitterId: '', // superseded by the required TIN field in the B'Odogwu → GovCBR forms
  functionCode: '9',
  statusCode: '3',
  typeCode: 'M',
  rotationNo: '1',
  nimasaTermAgtCode: 'AGENT-BP001100',
  containerCode: '68',
  actionCode: '1',
  purpose: 'PERSONAL',
  hsCode: '770000',
  transportContractTypeCode: 'Typ',
};

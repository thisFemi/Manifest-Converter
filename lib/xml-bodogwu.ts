import { XMLParser } from 'fast-xml-parser';
import {
  BodogwuHeader,
  BodogwuBl,
  BodogwuContainer,
  BodogwuItem,
  BodogwuRegister,
} from './types';

// Raw B'Odogwu XML (TWM_Manifest / TWM_BOL / eRegistrationRequest) is the
// same schema as the JSON single-upload format — just serialized with
// PascalCase_With_Underscores tags instead of camelCase JSON keys, and no
// attributes anywhere. This module maps tag-by-tag onto the same types
// lib/convert.ts already works with, so once parsed, everything downstream
// (GovCBR conversion, the UI, etc.) is identical either way.

const parser = new XMLParser({
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => name === 'Container' || name === 'Item',
});

function str(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return '';
  return String(v);
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? ''));
  return isNaN(n) ? 0 : n;
}

export function parseHeaderXml(xml: string): BodogwuHeader {
  const parsed = parser.parse(xml);
  const root = parsed.TWM_Manifest;
  if (!root) {
    throw new Error('XML does not contain a <TWM_Manifest> root element.');
  }
  const ident = root.Identification_segment || {};
  const gen = root.General_segment || {};
  const arrival = gen.Arrival_segment || {};
  const departure = gen.Departure_segment || {};
  const destination = gen.Destination_segment || {};
  const carrier = gen.Carrier_segment || {};
  const transport = gen.Transport_segment || {};
  const mode = transport.Mode_of_transport_segment || {};
  const nationality = transport.Nationality_of_transport_segment || {};
  const reg = transport.Transporter_registration_segment || {};
  const tonnage = gen.Tonnage_segment || {};

  return {
    identificationSegment: {
      registryNumber: str(ident.Registry_number),
      date: str(ident.Date),
      customsOfficeSegment: { code: str(ident.Customs_office_segment?.Code) },
    },
    generalSegment: {
      masterInformation: str(gen.Master_information),
      lastDischarge: str(gen.Last_discharge),
      arrivalSegment: {
        dateOfArrival: str(arrival.Date_of_arrival),
        timeOfArrival: str(arrival.Time_of_arrival),
      },
      departureSegment: { code: str(departure.Code) },
      destinationSegment: { code: str(destination.Code) },
      carrierSegment: {
        name: str(carrier.Name),
        address: str(carrier.Address),
        code: str(carrier.Code),
      },
      transportSegment: {
        nameOfTransporter: str(transport.Name_of_transporter),
        placeOfTransporter: str(transport.Place_of_transporter),
        modeOfTransportSegment: { code: str(mode.Code) },
        nationalityOfTransportSegment: { code: str(nationality.Code) },
        transporterRegistrationSegment: {
          registrationNumber: str(reg.Registration_number),
          registrationDate: str(reg.Registration_date),
        },
      },
      tonnageSegment: {
        grossTonnage: num(tonnage.Gross_tonnage),
        netTonnage: num(tonnage.Net_tonnage),
      },
    },
  };
}

function parseContainer(c: any): BodogwuContainer {
  return {
    reference: str(c.Reference),
    numberOfPackages: str(c.Number),
    type: str(c.Type),
    emptyFull: str(c.Empty_full),
    seals: str(c.Seals),
    marks1: str(c.Marks1),
    marks2: str(c.Marks2),
    sealingParty: str(c.Sealing_party),
  };
}

function parseItem(i: any, idx: number): BodogwuItem {
  return {
    itemNumber: i.Item_number !== undefined ? num(i.Item_number) : idx + 1,
    itemDescription: str(i.Item_description ?? i.Description),
    numberOfPackages: num(i.Number_of_packages),
    packageTypeCode: str(i.Package_type_code),
  };
}

export function parseBlXml(xml: string): BodogwuBl {
  const parsed = parser.parse(xml);
  const root = parsed.TWM_BOL;
  if (!root) {
    throw new Error('XML does not contain a <TWM_BOL> root element.');
  }
  const ident = root.Identification_segment || {};
  const spec = root.Bol_specific_segment || {};
  const exporter = spec.Exporter_segment || {};
  const consignee = spec.Consignee_segment || {};
  const notify = spec.Notify_segment || {};
  const packages = spec.Packages_segment || {};
  const freight = spec.Freight_segment || {};
  const customs = spec.Customs_segment || {};
  const transport = spec.Transport_segment || {};
  const insurance = spec.Insurance_segment || {};
  const seals = spec.Seals_segment || {};
  const ops = spec.Operations_segment?.Location_segment || {};

  const containers: BodogwuContainer[] = Array.isArray(root.Container)
    ? root.Container.map(parseContainer)
    : [];
  const items: BodogwuItem[] = Array.isArray(root.Item) ? root.Item.map(parseItem) : [];

  return {
    identificationSegment: {
      bolReference: str(ident.Bol_reference),
      registryNumber: str(ident.Registry_number),
      date: str(ident.Date),
      customsOfficeSegment: { code: str(ident.Customs_office_segment?.Code) },
    },
    bolSpecificSegment: {
      lineNumber: num(spec.Line_number),
      previousDocumentReference: str(spec.Previous_document_reference),
      bolNature: str(spec.Bol_Nature),
      uniqueCarrierReference: str(spec.Unique_carrier_reference),
      totalNumberOfContainers: num(spec.Total_number_of_containers),
      totalGrossMassManifested: num(spec.Total_gross_mass_manifested),
      volumeInCubicMeters: num(spec.Volume_in_cubic_meters),
      numberOfSubBols: num(spec.Number_of_sub_bols),
      bolTypeSegment: { code: str(spec.Bol_type_segment?.Code) },
      exporterSegment: {
        name: str(exporter.Name),
        address: str(exporter.Address),
        code: str(exporter.Code),
      },
      consigneeSegment: {
        name: str(consignee.Name),
        address: str(consignee.Address),
        code: str(consignee.Code),
      },
      notifySegment: {
        name: str(notify.Name),
        address: str(notify.Address),
        code: str(notify.Code),
      },
      placeOfLoadingSegment: { code: str(spec.Place_of_loading_segment?.Code) },
      placeOfUnloadingSegment: { code: str(spec.Place_of_unloading_segment?.Code) },
      packagesSegment: {
        packageTypeCode: str(packages.Package_type_code),
        numberOfPackages: num(packages.Number_of_packages),
      },
      shippingMarks: str(spec.Shipping_marks),
      goodsDescription: str(spec.Goods_description),
      freightSegment: {
        indicatorSegment: { code: str(freight.Indicator_segment?.Code) },
        value: num(freight.Value),
        currency: str(freight.Currency),
      },
      customsSegment: { value: num(customs.Value), currency: str(customs.Currency) },
      transportSegment: { value: num(transport.Value), currency: str(transport.Currency) },
      insuranceSegment: { value: num(insurance.Value), currency: str(insurance.Currency) },
      sealsSegment: {
        numberOfSeals: num(seals.Number_of_seals),
        marksOfSeals: str(seals.Marks_of_seals),
        sealingPartyCode: str(seals.Sealing_party_code),
      },
      informationPartA: str(spec.Information_part_a),
      operationsSegment: {
        locationSegment: { information: str(ops.Information), code: str(ops.Code) },
      },
    },
    containers,
    items,
  };
}

export function parseRegisterXml(xml: string): BodogwuRegister {
  const parsed = parser.parse(xml);
  const root = parsed.eRegistrationRequest;
  if (!root) {
    throw new Error('XML does not contain an <eRegistrationRequest> root element.');
  }
  const totals = root.Totals_segment || {};
  return {
    totalsSegment: {
      totalNumberOfBols: num(totals.Total_number_of_bols),
      totalNumberOfContainers: num(totals.Total_number_of_containers),
      totalNumberOfPackages: num(totals.Total_number_of_packages),
      totalNumberOfVehicles: num(totals.Total_number_of_vehicles),
      totalGrossMass: num(totals.Total_gross_mass),
    },
  };
}

import { NextRequest, NextResponse } from 'next/server';
import { parseHeaderXml, parseBlXml, parseRegisterXml } from '@/lib/xml-bodogwu';
import { mergeThreeSegments, bodogwuToGovCbr } from '@/lib/convert';
import { DEFAULT_AGENT_CONFIG, GovCbrAgentConfig } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      headerXml,
      blXmls,
      registerXml,
      target,
      sen,
      tin,
      indicator,
      journeyId,
      config,
    } = body as {
      headerXml: string;
      blXmls: string[];
      registerXml?: string;
      target: 'bodogwu' | 'govcbr';
      sen?: string;
      tin?: string;
      indicator?: 'I' | 'O';
      journeyId?: string;
      config?: Partial<GovCbrAgentConfig>;
    };

    if (!headerXml) {
      return NextResponse.json({ error: 'A manifest header XML file is required.' }, { status: 400 });
    }
    if (!Array.isArray(blXmls) || blXmls.length === 0) {
      return NextResponse.json({ error: 'At least one BL XML file is required.' }, { status: 400 });
    }

    const parseWarnings: string[] = [];
    let header;
    try {
      header = parseHeaderXml(headerXml);
    } catch (e: any) {
      return NextResponse.json({ error: `Manifest header: ${e.message}` }, { status: 400 });
    }

    const bls = [];
    for (let i = 0; i < blXmls.length; i++) {
      try {
        bls.push(parseBlXml(blXmls[i]));
      } catch (e: any) {
        return NextResponse.json({ error: `BL file #${i + 1}: ${e.message}` }, { status: 400 });
      }
    }

    let register;
    if (registerXml) {
      try {
        register = parseRegisterXml(registerXml);
      } catch (e: any) {
        parseWarnings.push(`Register file could not be parsed and was skipped: ${e.message}`);
      }
    }

    const merged = mergeThreeSegments(header, [bls], register);

    if (target === 'bodogwu') {
      return NextResponse.json({
        bodogwu: merged.data,
        warnings: [...parseWarnings, ...merged.warnings],
      });
    }

    // target === 'govcbr'
    if (!sen || sen.trim().length === 0) {
      return NextResponse.json({ error: 'SEN is required for XML → GovCBR.' }, { status: 400 });
    }
    if (!tin || tin.trim().length === 0) {
      return NextResponse.json({ error: 'TIN is required for XML → GovCBR.' }, { status: 400 });
    }

    const mergedConfig = { ...DEFAULT_AGENT_CONFIG, ...(config || {}) };
    const result = bodogwuToGovCbr(
      merged.data.manifestHdr,
      merged.data.blSegments,
      sen,
      indicator || 'I',
      tin,
      mergedConfig,
      journeyId
    );

    return NextResponse.json({
      ...result,
      warnings: [...parseWarnings, ...merged.warnings, ...result.warnings],
      mergedBlCount: merged.data.blSegments.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Conversion failed.' }, { status: 400 });
  }
}

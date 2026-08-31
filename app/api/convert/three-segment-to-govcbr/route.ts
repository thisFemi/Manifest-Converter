import { NextRequest, NextResponse } from 'next/server';
import { mergeThreeSegments, bodogwuToGovCbr } from '@/lib/convert';
import { DEFAULT_AGENT_CONFIG, GovCbrAgentConfig } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { header, blFiles, register, sen, tin, indicator, journeyId, config } = body as {
      header: any;
      blFiles: any[][];
      register?: any;
      sen: string;
      tin: string;
      indicator: 'I' | 'O';
      journeyId?: string;
      config?: Partial<GovCbrAgentConfig>;
    };

    if (!header || !Array.isArray(blFiles) || blFiles.length === 0) {
      return NextResponse.json(
        { error: 'Request must include a header file and at least one BL file.' },
        { status: 400 }
      );
    }
    if (!sen || sen.trim().length === 0) {
      return NextResponse.json({ error: 'SEN is required for B\'Odogwu → GovCBR.' }, { status: 400 });
    }
    if (!tin || tin.trim().length === 0) {
      return NextResponse.json({ error: 'TIN is required for B\'Odogwu → GovCBR.' }, { status: 400 });
    }

    const merged = mergeThreeSegments(header, blFiles, register);
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
      warnings: [...merged.warnings, ...result.warnings],
      mergedBlCount: merged.data.blSegments.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Conversion failed.' }, { status: 400 });
  }
}

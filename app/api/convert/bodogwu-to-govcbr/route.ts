import { NextRequest, NextResponse } from 'next/server';
import { bodogwuToGovCbr } from '@/lib/convert';
import { DEFAULT_AGENT_CONFIG, GovCbrAgentConfig } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bodogwu, sen, tin, indicator, journeyId, config } = body as {
      bodogwu: { manifestHdr: any; blSegments: any[] };
      sen: string;
      tin: string;
      indicator: 'I' | 'O';
      journeyId?: string;
      config?: Partial<GovCbrAgentConfig>;
    };

    if (!bodogwu?.manifestHdr || !Array.isArray(bodogwu?.blSegments)) {
      return NextResponse.json(
        { error: 'Uploaded file must contain manifestHdr and blSegments.' },
        { status: 400 }
      );
    }
    if (!sen || sen.trim().length === 0) {
      return NextResponse.json({ error: 'SEN is required for B\'Odogwu → GovCBR.' }, { status: 400 });
    }
    if (!tin || tin.trim().length === 0) {
      return NextResponse.json({ error: 'TIN is required for B\'Odogwu → GovCBR.' }, { status: 400 });
    }

    const mergedConfig = { ...DEFAULT_AGENT_CONFIG, ...(config || {}) };
    const result = bodogwuToGovCbr(
      bodogwu.manifestHdr,
      bodogwu.blSegments,
      sen,
      indicator || 'I',
      tin,
      mergedConfig,
      journeyId
    );

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Conversion failed.' }, { status: 400 });
  }
}

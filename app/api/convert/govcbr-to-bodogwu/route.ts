import { NextRequest, NextResponse } from 'next/server';
import { govCbrToBodogwu } from '@/lib/convert';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { govCbr, arrivalDate, arrivalTime } = body as {
      govCbr: { senReferenceNumber: string; inbound_outbound_indicator: string; xmlString: string };
      arrivalDate?: string;
      arrivalTime?: string;
    };

    if (!govCbr?.xmlString) {
      return NextResponse.json({ error: 'Uploaded file must contain an xmlString field.' }, { status: 400 });
    }

    const result = govCbrToBodogwu(govCbr as any, arrivalDate, arrivalTime);

    return NextResponse.json({
      bodogwu: result.data.bodogwu,
      sen: {
        senReferenceNumber: result.data.senReferenceNumber,
        inbound_outbound_indicator: result.data.inbound_outbound_indicator,
      },
      warnings: result.warnings,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Conversion failed.' }, { status: 400 });
  }
}

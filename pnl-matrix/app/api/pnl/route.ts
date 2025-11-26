import { buildPnl } from '@/lib/pnlLogic';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get('year')) || new Date().getFullYear();
  const tree = await buildPnl(year);
  return NextResponse.json(tree);
} 
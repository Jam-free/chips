import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    minimaxKey: process.env.MINIMAX_API_KEY || '',
    glmKey: process.env.GLM_API_KEY || ''
  });
}

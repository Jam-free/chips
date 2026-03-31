import { NextRequest, NextResponse } from 'next/server';
import { dataStore } from '@/lib/store';
import { callGLMVisionAPI, callMiniMaxVisionAPI } from '@/lib/server-vlm';
import { ChipResult } from '@/types';

// POST - 切换prompt
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { promptId } = body;

    if (!promptId) {
      return NextResponse.json({ success: false, error: '缺少promptId' }, { status: 400 });
    }

    dataStore.setCurrentPrompt(promptId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Switch prompt error:', error);
    return NextResponse.json({ success: false, error: '切换失败' }, { status: 500 });
  }
}

// PUT - 重新生成所有截图的chips（使用真实VLM）
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, provider } = body;

    const screenshots = dataStore.getAllScreenshots();
    const currentPrompt = dataStore.getCurrentPrompt();

    if (!currentPrompt?.content) {
      return NextResponse.json({ success: false, error: 'Prompt配置错误' }, { status: 500 });
    }

    const results: { screenshotId: string; cached: boolean; error?: string }[] = [];

    for (const screenshot of screenshots) {
      // 不使用缓存，强制重新生成
      try {
        if (apiKey) {
          const vlmResult = provider === 'minimax'
            ? await callMiniMaxVisionAPI(screenshot.imagePath, currentPrompt.content, apiKey)
            : await callGLMVisionAPI(screenshot.imagePath, currentPrompt.content, apiKey);

          const chipResult: ChipResult = {
            screenshotId: screenshot.id,
            promptVersion: currentPrompt.version,
            promptName: currentPrompt.name,
            generatedAt: new Date(),
            screenUnderstanding: vlmResult.screenUnderstanding,
            chips: vlmResult.chips
          };
          dataStore.addResult(chipResult);
          results.push({ screenshotId: screenshot.id, cached: false });
        } else {
          // 无API Key时用mock
          const chipResult: ChipResult = {
            screenshotId: screenshot.id,
            promptVersion: currentPrompt.version,
            promptName: currentPrompt.name,
            generatedAt: new Date(),
            screenUnderstanding: '未配置API Key，使用模拟数据',
            chips: ['这个功能入口在哪？', '和同类比差在哪？', '下一步该怎么选？']
          };
          dataStore.addResult(chipResult);
          results.push({ screenshotId: screenshot.id, cached: false });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[Regenerate] Failed for', screenshot.id, ':', errMsg);
        results.push({ screenshotId: screenshot.id, cached: false, error: errMsg });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Regenerate error:', error);
    return NextResponse.json({ success: false, error: '重新生成失败' }, { status: 500 });
  }
}

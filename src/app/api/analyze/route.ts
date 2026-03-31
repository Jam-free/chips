import { NextRequest, NextResponse } from 'next/server';
import { callMiniMaxVisionAPI, callGLMVisionAPI, callSiliconFlowVisionAPI } from '@/lib/server-vlm';
import { dataStore } from '@/lib/store';
import { ChipResult, Screenshot } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { screenshotId, apiKey, provider, force, testImage, imageData, filename } = body;

    console.log('[Analyze] Request:', {
      screenshotId,
      hasApiKey: !!apiKey,
      provider,
      force,
      hasTestImage: !!testImage,
      hasImageData: !!imageData
    });

    if (!screenshotId && !testImage) {
      return NextResponse.json({ success: false, error: '缺少screenshotId' }, { status: 400 });
    }

    // ── 测试模式 ──
    if (testImage && apiKey) {
      try {
        if (provider === 'minimax') {
          await callMiniMaxVisionAPI(testImage, '测试：请简单描述这张图片', apiKey);
        } else if (provider === 'siliconflow') {
          await callSiliconFlowVisionAPI(testImage, '测试：请简单描述这张图片', apiKey);
        } else {
          await callGLMVisionAPI(testImage, '测试：请简单描述这张图片', apiKey);
        }
        return NextResponse.json({ success: true, test: true });
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: error instanceof Error ? error.message : 'API调用失败'
        }, { status: 400 });
      }
    }

    // ── 获取截图（优先 store，兜底用前端传来的数据恢复） ──
    let screenshot = dataStore.getScreenshot(screenshotId);

    if (!screenshot && imageData) {
      console.log('[Analyze] Screenshot not in store, recovering from request imageData');
      screenshot = {
        id: screenshotId,
        filename: filename || 'recovered.jpg',
        uploadedAt: new Date(),
        imagePath: imageData,
      } satisfies Screenshot;
      dataStore.addScreenshot(screenshot);
    }

    if (!screenshot) {
      return NextResponse.json({
        success: false,
        error: '截图数据丢失，请重新上传'
      }, { status: 404 });
    }

    // ── 获取当前prompt ──
    const currentPrompt = dataStore.getCurrentPrompt();
    if (!currentPrompt?.content) {
      return NextResponse.json({ success: false, error: 'Prompt配置错误' }, { status: 500 });
    }

    // ── 缓存检查 ──
    if (!force) {
      const existingResults = dataStore.getResult(screenshotId);
      const existing = existingResults.find(r => r.promptVersion === currentPrompt.version);
      if (existing) {
        return NextResponse.json({
          success: true,
          data: { ...existing, generatedAt: existing.generatedAt.toISOString() },
          cached: true,
          metadata: { usedMockData: false, provider: 'cached', chipsCount: existing.chips.length }
        });
      }
    }

    // ── 调用VLM ──
    let screenUnderstanding: string;
    let chips: string[];
    let usedMockData = false;

    if (!apiKey) {
      await new Promise(resolve => setTimeout(resolve, 800));
      screenUnderstanding = '未配置API Key，使用模拟数据';
      chips = ['这个功能入口在哪？', '和同类比差在哪？', '下一步该怎么选？'];
      usedMockData = true;
    } else {
      console.log('[Analyze] Calling VLM:', provider);
      const callStart = Date.now();

      try {
        const result =
          provider === 'minimax'
            ? await callMiniMaxVisionAPI(screenshot.imagePath, currentPrompt.content, apiKey)
            : provider === 'siliconflow'
              ? await callSiliconFlowVisionAPI(screenshot.imagePath, currentPrompt.content, apiKey)
              : await callGLMVisionAPI(screenshot.imagePath, currentPrompt.content, apiKey);

        screenUnderstanding = result.screenUnderstanding;
        chips = result.chips;
        console.log('[Analyze] VLM success in', Date.now() - callStart, 'ms, chips:', chips);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[Analyze] VLM failed:', errMsg);
        return NextResponse.json({
          success: false,
          error: `VLM调用失败: ${errMsg}`
        }, { status: 502 });
      }
    }

    // ── 保存并返回结果 ──
    if (chips.length === 0) {
      screenUnderstanding = screenUnderstanding || '屏幕内容较简单，未生成问题';
    }

    const result: ChipResult = {
      screenshotId,
      promptVersion: currentPrompt.version,
      promptName: currentPrompt.name,
      generatedAt: new Date(),
      screenUnderstanding,
      chips
    };

    dataStore.addResult(result);

    return NextResponse.json({
      success: true,
      data: { ...result, generatedAt: result.generatedAt.toISOString() },
      metadata: { usedMockData, provider: usedMockData ? 'mock' : provider, chipsCount: chips.length }
    });
  } catch (error) {
    console.error('[Analyze] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '分析失败'
    }, { status: 500 });
  }
}

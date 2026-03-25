import { NextRequest, NextResponse } from 'next/server';
import { callMiniMaxVisionAPI, callGLMVisionAPI } from '@/lib/server-vlm';
import { dataStore } from '@/lib/store';
import { ChipResult } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { screenshotId, apiKey, provider, force, testImage } = body;

    console.log('[Analyze API] Request received:', {
      screenshotId,
      hasApiKey: !!apiKey,
      provider,
      force,
      hasTestImage: !!testImage
    });

    if (!screenshotId && !testImage) {
      return NextResponse.json({ success: false, error: '缺少screenshotId' }, { status: 400 });
    }

    // 测试模式
    if (testImage && apiKey) {
      console.log('[Analyze API] Test mode, provider:', provider);
      try {
        if (provider === 'minimax') {
          await callMiniMaxVisionAPI(testImage, '测试', apiKey);
        } else {
          await callGLMVisionAPI(testImage, '测试', apiKey);
        }
        return NextResponse.json({ success: true, test: true });
      } catch (error) {
        console.error('[Analyze API] Test failed:', error);
        return NextResponse.json({
          success: false,
          error: error instanceof Error ? error.message : 'API调用失败'
        }, { status: 400 });
      }
    }

    // 获取截图
    const screenshot = dataStore.getScreenshot(screenshotId);
    if (!screenshot) {
      console.error('[Analyze API] Screenshot not found:', screenshotId);
      return NextResponse.json({ success: false, error: '截图不存在' }, { status: 404 });
    }

    console.log('[Analyze API] Screenshot found:', screenshot.id);

    // 获取当前prompt
    const currentPrompt = dataStore.getCurrentPrompt();
    console.log('[Analyze API] Current prompt:', currentPrompt.name, currentPrompt.version);

    // 检查是否已经有该prompt的结果（除非强制重新生成）
    if (!force) {
      const existingResults = dataStore.getResult(screenshotId);
      const existing = existingResults.find(r => r.promptVersion === currentPrompt.version);

      if (existing) {
        console.log('[Analyze API] Returning cached result for', screenshotId);
        return NextResponse.json({
          success: true,
          data: {
            ...existing,
            generatedAt: existing.generatedAt.toISOString()
          },
          cached: true
        });
      }
    }

    // 调用VLM分析
    let screenUnderstanding: string, chips: string[];

    if (!apiKey) {
      // 没有API Key，使用模拟数据
      console.log('[Analyze API] Using mock data (no API key)');
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      screenUnderstanding = '用户正在浏览APP界面';
      chips = ['这个功能怎么用？', '这里可以设置吗？'];
    } else {
      // 使用真实API
      console.log('[Analyze API] Calling VLM API with provider:', provider);
      try {
        if (provider === 'minimax') {
          const result = await callMiniMaxVisionAPI(screenshot.imagePath, currentPrompt.content, apiKey);
          screenUnderstanding = result.screenUnderstanding;
          chips = result.chips;
        } else {
          const result = await callGLMVisionAPI(screenshot.imagePath, currentPrompt.content, apiKey);
          screenUnderstanding = result.screenUnderstanding;
          chips = result.chips;
        }
        console.log('[Analyze API] VLM API success. Chips:', chips);
      } catch (error) {
        console.error('[Analyze API] VLM API call failed:', error);
        // 失败时使用模拟数据
        screenUnderstanding = 'API调用失败，使用模拟数据';
        chips = ['这个功能怎么用？', '这里可以设置吗？'];
      }
    }

    console.log('[Analyze API] Final chips:', chips);
    console.log('[Analyze API] Screen understanding:', screenUnderstanding);

    // 创建结果
    const result: ChipResult = {
      screenshotId,
      promptVersion: currentPrompt.version,
      promptName: currentPrompt.name,
      generatedAt: new Date(),
      screenUnderstanding,
      chips
    };

    // 保存结果
    dataStore.addResult(result);

    // 返回时将Date转换为ISO字符串
    const responseData = {
      ...result,
      generatedAt: result.generatedAt.toISOString()
    };

    return NextResponse.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Analyze error:', error);
    return NextResponse.json({
      success: false,
      error: '分析失败'
    }, { status: 500 });
  }
}

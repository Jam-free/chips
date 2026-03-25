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
    console.log('[Analyze API] Prompt content length:', currentPrompt.content?.length);
    console.log('[Analyze API] Prompt preview:', currentPrompt.content?.substring(0, 300));

    if (!currentPrompt || !currentPrompt.content) {
      console.error('[Analyze API] No valid prompt found');
      return NextResponse.json({
        success: false,
        error: 'Prompt配置错误'
      }, { status: 500 });
    }

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
    let usedMockData = false;

    if (!apiKey) {
      // 没有API Key，使用模拟数据
      console.log('[Analyze API] ❌ No API key provided, using mock data');
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      screenUnderstanding = '用户正在浏览APP界面';
      chips = ['这个功能怎么用？', '这里可以设置吗？'];
      usedMockData = true;
    } else {
      // 使用真实API
      console.log('[Analyze API] ✅ API key provided, calling real VLM API');
      console.log('[Analyze API] Provider:', provider);
      console.log('[Analyze API] Screenshot image type:', screenshot.imagePath.startsWith('data:') ? 'base64' : 'url');
      console.log('[Analyze API] Image size:', screenshot.imagePath.length);

      try {
        const callStartTime = Date.now();

        if (provider === 'minimax') {
          console.log('[Analyze API] Calling MiniMax API...');
          const result = await callMiniMaxVisionAPI(screenshot.imagePath, currentPrompt.content, apiKey);
          screenUnderstanding = result.screenUnderstanding;
          chips = result.chips;
        } else {
          console.log('[Analyze API] Calling GLM-4V API...');
          const result = await callGLMVisionAPI(screenshot.imagePath, currentPrompt.content, apiKey);
          screenUnderstanding = result.screenUnderstanding;
          chips = result.chips;
        }

        const callDuration = Date.now() - callStartTime;
        console.log('[Analyze API] ✅ VLM API call successful in', callDuration, 'ms');
        console.log('[Analyze API] Generated chips:', chips);
        console.log('[Analyze API] Chips count:', chips?.length);
      } catch (error) {
        console.error('[Analyze API] ❌ VLM API call failed:', error);
        console.error('[Analyze API] Error details:', {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined
        });
        // 失败时使用模拟数据
        screenUnderstanding = 'API调用失败，使用模拟数据';
        chips = ['这个功能怎么用？', '这里可以设置吗？'];
        usedMockData = true;
      }
    }

    console.log('[Analyze API] Final result:', {
      usedMockData,
      chipsCount: chips?.length,
      chips: chips,
      screenUnderstanding
    });

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

    // 添加标记，告诉前端是否使用了模拟数据
    console.log('[Analyze API] Response - usedMockData:', usedMockData);

    return NextResponse.json({
      success: true,
      data: responseData,
      metadata: {
        usedMockData,
        provider: usedMockData ? 'mock' : provider,
        chipsCount: chips.length
      }
    });
  } catch (error) {
    console.error('Analyze error:', error);
    return NextResponse.json({
      success: false,
      error: '分析失败'
    }, { status: 500 });
  }
}

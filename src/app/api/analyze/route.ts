import { NextRequest, NextResponse } from 'next/server';
import { callMiniMaxVisionAPI, callGLMVisionAPI } from '@/lib/server-vlm';
import { dataStore } from '@/lib/store';
import { ChipResult } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { screenshotId, apiKey, provider, force } = body;

    if (!screenshotId) {
      return NextResponse.json({ success: false, error: '缺少screenshotId' }, { status: 400 });
    }

    // 获取截图
    const screenshot = dataStore.getScreenshot(screenshotId);
    if (!screenshot) {
      return NextResponse.json({ success: false, error: '截图不存在' }, { status: 404 });
    }

    // 获取当前prompt
    const currentPrompt = dataStore.getCurrentPrompt();

    // 检查是否已经有该prompt的结果（除非强制重新生成）
    if (!force) {
      const existingResults = dataStore.getResult(screenshotId);
      const existing = existingResults.find(r => r.promptVersion === currentPrompt.version);

      if (existing) {
        return NextResponse.json({
          success: true,
          data: existing,
          cached: true
        });
      }
    }

    // 调用VLM分析
    let screenUnderstanding: string, chips: string[];

    if (!apiKey) {
      // 没有API Key，使用模拟数据
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      screenUnderstanding = '用户正在浏览APP界面';
      chips = ['这个功能怎么用？', '这里可以设置吗？'];
    } else {
      // 使用真实API
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
      } catch (error) {
        console.error('VLM API调用失败:', error);
        // 失败时使用模拟数据
        screenUnderstanding = 'API调用失败，使用模拟数据';
        chips = ['这个功能怎么用？', '这里可以设置吗？'];
      }
    }

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

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Analyze error:', error);
    return NextResponse.json({
      success: false,
      error: '分析失败'
    }, { status: 500 });
  }
}

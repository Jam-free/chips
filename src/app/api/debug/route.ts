import { NextRequest, NextResponse } from 'next/server';
import { callGLMVisionAPI, callMiniMaxVisionAPI } from '@/lib/server-vlm';
import { dataStore } from '@/lib/store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { screenshotId, apiKey, provider } = body;

    console.log('[DEBUG API] ========== Debug Request Start ==========');
    console.log('[DEBUG API] Screenshot ID:', screenshotId);
    console.log('[DEBUG API] Provider:', provider);
    console.log('[DEBUG API] API Key length:', apiKey?.length);
    console.log('[DEBUG API] Has API Key:', !!apiKey);

    // 获取截图
    const screenshot = dataStore.getScreenshot(screenshotId);
    if (!screenshot) {
      return NextResponse.json({ success: false, error: '截图不存在' });
    }

    console.log('[DEBUG API] Screenshot found:', screenshot.id);
    console.log('[DEBUG API] Image path length:', screenshot.imagePath?.length);
    console.log('[DEBUG API] Image path starts with data:', screenshot.imagePath?.startsWith('data:'));

    // 获取prompt
    const currentPrompt = dataStore.getCurrentPrompt();
    console.log('[DEBUG API] Prompt name:', currentPrompt?.name);
    console.log('[DEBUG API] Prompt version:', currentPrompt?.version);
    console.log('[DEBUG API] Prompt content length:', currentPrompt?.content?.length);
    console.log('[DEBUG API] Prompt preview (first 500 chars):', currentPrompt?.content?.substring(0, 500));

    if (!apiKey) {
      return NextResponse.json({
        success: true,
        debug: {
          message: '❌ 未配置API Key，无法测试真实API',
          suggestion: '请在设置中配置API Key后再测试'
        }
      });
    }

    // 调用API并记录详细信息
    console.log('[DEBUG API] ========== Calling Real VLM API ==========');
    const startTime = Date.now();

    let apiResponse: { screenUnderstanding: string; chips: string[] } | null = null;
    let error = null;

    try {
      if (provider === 'minimax') {
        const result = await callMiniMaxVisionAPI(screenshot.imagePath, currentPrompt.content, apiKey);
        apiResponse = result;
      } else {
        const result = await callGLMVisionAPI(screenshot.imagePath, currentPrompt.content, apiKey);
        apiResponse = result;
      }

      const duration = Date.now() - startTime;
      console.log('[DEBUG API] ✅ API call successful');
      console.log('[DEBUG API] Duration:', duration, 'ms');
      console.log('[DEBUG API] Screen understanding:', apiResponse.screenUnderstanding);
      console.log('[DEBUG API] Chips:', apiResponse.chips);
      console.log('[DEBUG API] Chips count:', apiResponse.chips?.length);

      return NextResponse.json({
        success: true,
        debug: {
          provider,
          duration: `${duration}ms`,
          screenUnderstanding: apiResponse.screenUnderstanding,
          chips: apiResponse.chips,
          chipsCount: apiResponse.chips?.length,
          message: '✅ API调用成功',
          promptLength: currentPrompt.content?.length,
          imageSize: screenshot.imagePath?.length
        }
      });

    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      const duration = Date.now() - startTime;
      console.error('[DEBUG API] ❌ API call failed');
      console.error('[DEBUG API] Duration:', duration, 'ms');
      console.error('[DEBUG API] Error:', error);

      return NextResponse.json({
        success: true,
        debug: {
          provider,
          duration: `${duration}ms`,
          error,
          message: '❌ API调用失败',
          errorDetails: error
        }
      });
    }

  } catch (error) {
    console.error('[DEBUG API] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '调试失败'
    }, { status: 500 });
  }
}

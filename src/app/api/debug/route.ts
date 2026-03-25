import { NextRequest, NextResponse } from 'next/server';
import { callGLMVisionAPI, callMiniMaxVisionAPI } from '@/lib/server-vlm';
import { dataStore } from '@/lib/store';

export async function POST(request: NextRequest) {
  const debugStartTime = Date.now();

  try {
    const body = await request.json();
    const { screenshotId, apiKey, provider } = body;

    console.log('[DEBUG API] ========== Debug Request Start ==========');
    console.log('[DEBUG API] Time:', new Date().toISOString());
    console.log('[DEBUG API] Screenshot ID:', screenshotId);
    console.log('[DEBUG API] Provider:', provider);
    console.log('[DEBUG API] API Key length:', apiKey?.length);
    console.log('[DEBUG API] Has API Key:', !!apiKey);

    // 获取截图
    const screenshot = dataStore.getScreenshot(screenshotId);
    if (!screenshot) {
      console.error('[DEBUG API] Screenshot not found');
      return NextResponse.json({
        success: false,
        error: '截图不存在'
      });
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
      console.log('[DEBUG API] No API key - returning mock info');
      return NextResponse.json({
        success: true,
        debug: {
          message: '❌ 未配置API Key，无法测试真实API',
          suggestion: '请在设置中配置API Key后再测试',
          provider: 'none',
          duration: '0ms',
          hasApiKey: false
        }
      });
    }

    // 设置更长的超时时间用于调试
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000); // 55秒超时（留5秒余量）

    console.log('[DEBUG API] ========== Calling Real VLM API (55s timeout) ==========');
    const apiStartTime = Date.now();

    let apiResponse: { screenUnderstanding: string; chips: string[] } | null = null;
    let error = null;

    try {
      if (provider === 'minimax') {
        console.log('[DEBUG API] Calling MiniMax API...');
        apiResponse = await Promise.race([
          callMiniMaxVisionAPI(screenshot.imagePath, currentPrompt.content, apiKey),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('API调用超时（55秒）')), 55000)
          )
        ]) as { screenUnderstanding: string; chips: string[] };
      } else {
        console.log('[DEBUG API] Calling GLM-4V API...');
        apiResponse = await Promise.race([
          callGLMVisionAPI(screenshot.imagePath, currentPrompt.content, apiKey),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('API调用超时（55秒）')), 55000)
          )
        ]) as { screenUnderstanding: string; chips: string[] };
      }

      clearTimeout(timeoutId);

      const apiDuration = Date.now() - apiStartTime;
      console.log('[DEBUG API] ✅ API call successful in', apiDuration, 'ms');
      console.log('[DEBUG API] Screen understanding:', apiResponse.screenUnderstanding);
      console.log('[DEBUG API] Chips:', apiResponse.chips);
      console.log('[DEBUG API] Chips count:', apiResponse.chips?.length);
      console.log('[DEBUG API] Total debug time:', Date.now() - debugStartTime, 'ms');

      return NextResponse.json({
        success: true,
        debug: {
          provider,
          duration: `${apiDuration}ms`,
          screenUnderstanding: apiResponse.screenUnderstanding,
          chips: apiResponse.chips,
          chipsCount: apiResponse.chips?.length,
          message: '✅ API调用成功',
          promptLength: currentPrompt.content?.length,
          imageSize: screenshot.imagePath?.length,
          hasApiKey: true
        }
      });

    } catch (err) {
      clearTimeout(timeoutId);
      error = err instanceof Error ? err.message : String(err);
      const apiDuration = Date.now() - apiStartTime;
      console.error('[DEBUG API] ❌ API call failed after', apiDuration, 'ms');
      console.error('[DEBUG API] Error:', error);
      console.error('[DEBUG API] Total debug time:', Date.now() - debugStartTime, 'ms');

      return NextResponse.json({
        success: true,
        debug: {
          provider,
          duration: `${apiDuration}ms`,
          error,
          message: `❌ API调用失败: ${error}`,
          errorDetails: error,
          promptLength: currentPrompt.content?.length,
          imageSize: screenshot.imagePath?.length,
          hasApiKey: true,
          timedOut: error.includes('超时')
        }
      });
    }

  } catch (error) {
    console.error('[DEBUG API] Fatal error:', error);
    console.error('[DEBUG API] Total debug time:', Date.now() - debugStartTime, 'ms');
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '调试失败'
    }, { status: 500 });
  }
}

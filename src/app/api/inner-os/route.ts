import { NextRequest } from 'next/server';
import { dataStore } from '@/lib/store';
import { callMiniMaxVisionAPIForOS, callGLMVisionAPIForOS } from '@/lib/server-vlm';
import { InnerOSResult, Screenshot, ChipResult } from '@/types';

export async function POST(request: NextRequest) {
  console.log('[Inner OS API] Request received');

  try {
    const { screenshotId, promptId, apiKey, provider } = await request.json();

    // 参数验证
    if (!screenshotId) {
      return Response.json({ success: false, error: '缺少screenshotId' }, { status: 400 });
    }

    // 获取截图信息
    const screenshot: Screenshot | undefined = dataStore.getScreenshot(screenshotId);
    if (!screenshot) {
      return Response.json({ success: false, error: '截图不存在' }, { status: 404 });
    }

    // 获取Prompt（如果未指定，使用默认OS Prompt）
    let promptContent = '';
    let promptVersion = 'v1.0';
    let promptName = '内心OS';

    if (promptId) {
      const prompt = dataStore.getPrompt(promptId);
      if (prompt) {
        promptContent = prompt.content;
        promptVersion = prompt.version;
        promptName = prompt.name;
      }
    }

    // 如果没有找到指定Prompt，使用默认OS Prompt
    if (!promptContent) {
      const osPrompts = dataStore.getPrompts().filter(p => p.type === 'inner-os');
      if (osPrompts.length > 0) {
        promptContent = osPrompts[0].content;
        promptVersion = osPrompts[0].version;
        promptName = osPrompts[0].name;
      }
    }

    if (!promptContent) {
      return Response.json({ success: false, error: '未找到内心OS Prompt模板' }, { status: 400 });
    }

    // 检查是否已存在OS结果（缓存）
    const existingResults = dataStore.getResult(screenshotId);
    const existingOS = existingResults.find(r => 'innerOS' in r);
    if (existingOS && 'innerOS' in existingOS && (existingOS as Record<string, unknown>).innerOS) {
      console.log('[Inner OS API] Returning cached OS');
      return Response.json({
        success: true,
        data: existingOS as unknown as InnerOSResult
      });
    }

    let innerOS = '';

    // 如果没有API Key，返回模拟数据
    if (!apiKey) {
      await new Promise(resolve => setTimeout(resolve, 500));
      innerOS = '这界面有点意思~';
      console.log('[Inner OS API] No API key, using mock data');
    } else {
      // 调用VLM生成内心OS
      console.log('[Inner OS API] Calling VLM for OS:', provider);
      const osResult = provider === 'minimax'
        ? await callMiniMaxVisionAPIForOS(screenshot.imagePath, promptContent, apiKey)
        : await callGLMVisionAPIForOS(screenshot.imagePath, promptContent, apiKey);

      innerOS = osResult.innerOS;
      console.log('[Inner OS API] VLM returned OS:', innerOS);
    }

    // 创建OS结果对象
    const osResult: InnerOSResult = {
      screenshotId,
      promptVersion,
      promptName,
      generatedAt: new Date(),
      innerOS
    };

    // 存储到DataStore（复用ChipResult的结构，通过innerOS字段区分）
    dataStore.addResult(osResult as unknown as ChipResult);

    console.log('[Inner OS API] Success:', osResult);
    return Response.json({
      success: true,
      data: osResult
    });

  } catch (error) {
    console.error('[Inner OS API] Error:', error);
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : '生成内心OS失败'
    }, { status: 500 });
  }
}

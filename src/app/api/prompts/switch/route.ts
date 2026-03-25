import { NextRequest, NextResponse } from 'next/server';
import { dataStore } from '@/lib/store';

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

// POST - 重新生成所有截图
export async function PUT() {
  try {
    const screenshots = dataStore.getAllScreenshots();
    const currentPrompt = dataStore.getCurrentPrompt();

    const results = [];

    for (const screenshot of screenshots) {
      // 检查是否已存在该prompt的结果
      const existingResults = dataStore.getResult(screenshot.id);
      const existing = existingResults.find(r => r.promptVersion === currentPrompt.version);

      if (existing) {
        results.push({ screenshotId: screenshot.id, cached: true });
        continue;
      }

      // 重新生成 - 使用模拟数据（批量操作不消耗API调用）
      await new Promise(resolve => setTimeout(resolve, 500));

      const result = {
        screenshotId: screenshot.id,
        promptVersion: currentPrompt.version,
        promptName: currentPrompt.name,
        generatedAt: new Date(),
        screenUnderstanding: '已重新生成',
        chips: ['这个功能怎么用？', '这里可以设置吗？']
      };

      dataStore.addResult(result);
      results.push({ screenshotId: screenshot.id, cached: false });
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Regenerate error:', error);
    return NextResponse.json({ success: false, error: '重新生成失败' }, { status: 500 });
  }
}

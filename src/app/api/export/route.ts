import { NextRequest, NextResponse } from 'next/server';
import { dataStore } from '@/lib/store';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const promptVersion = searchParams.get('promptVersion');

    const screenshots = dataStore.getAllScreenshots();
    const allResults = dataStore.getAllResults();

    // 筛选结果
    let filteredResults = allResults;
    if (promptVersion) {
      filteredResults = allResults.filter(r => r.promptVersion === promptVersion);
    }

    // 准备导出数据
    const exportData = screenshots.map(screenshot => {
      const result = filteredResults.find(r => r.screenshotId === screenshot.id);

      return {
        '截图ID': screenshot.id,
        '文件名': screenshot.filename,
        '上传时间': screenshot.uploadedAt.toLocaleString('zh-CN'),
        '图片路径': screenshot.imagePath,
        '使用的Prompt': result?.promptName || '',
        'Prompt版本': result?.promptVersion || '',
        '生成时间': result?.generatedAt.toLocaleString('zh-CN') || '',
        '屏幕理解': result?.screenUnderstanding || '',
        '话题Chip 1': result?.chips[0] || '',
        '话题Chip 2': result?.chips[1] || '',
        '话题Chip 3': result?.chips[2] || ''
      };
    });

    // 创建工作簿
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '测试数据');

    // 生成Excel文件
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // 返回文件
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="chips-export-${Date.now()}.xlsx"`
      }
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ success: false, error: '导出失败' }, { status: 500 });
  }
}

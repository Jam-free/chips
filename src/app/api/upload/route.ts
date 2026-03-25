import { NextRequest, NextResponse } from 'next/server';
import { fileToBase64 } from '@/lib/server-utils';
import { generateId } from '@/lib/utils';
import { Screenshot } from '@/types';
import { dataStore } from '@/lib/store';

export async function POST(request: NextRequest) {
  console.log('[Upload API] Starting upload...');

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      console.error('[Upload API] No file provided');
      return NextResponse.json({ success: false, error: '没有上传文件' }, { status: 400 });
    }

    console.log('[Upload API] File received:', {
      name: file.name,
      size: file.size,
      type: file.type
    });

    // 检查文件大小（3.5MB）
    const MAX_SIZE = 3.5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      console.error('[Upload API] File too large:', file.size);
      return NextResponse.json({
        success: false,
        error: `文件过大（${(file.size / 1024 / 1024).toFixed(2)}MB），请压缩后上传`
      }, { status: 400 });
    }

    // 转换为base64（适用于Serverless环境）
    console.log('[Upload API] Converting file to base64...');
    const { filename, base64 } = await fileToBase64(file);
    console.log('[Upload API] File converted to base64, length:', base64.length);

    // 创建截图记录（使用base64作为imagePath）
    const screenshot: Screenshot = {
      id: generateId(),
      filename,
      uploadedAt: new Date(),
      imagePath: base64 // 直接存储base64数据
    };

    dataStore.addScreenshot(screenshot);
    console.log('[Upload API] Screenshot added to store:', screenshot.id);

    return NextResponse.json({
      success: true,
      screenshot
    });
  } catch (error) {
    console.error('[Upload API] Error:', error);

    // 提供更详细的错误信息
    let errorMessage = '上传失败';

    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}

export async function GET() {
  const screenshots = dataStore.getAllScreenshots();
  console.log('GET /api/upload - returning screenshots:', screenshots.length);
  return NextResponse.json({ success: true, screenshots });
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少id参数' }, { status: 400 });
    }

    dataStore.deleteScreenshot(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 });
  }
}

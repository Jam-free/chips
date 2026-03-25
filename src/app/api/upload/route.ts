import { NextRequest, NextResponse } from 'next/server';
import { saveUploadedFile } from '@/lib/server-utils';
import { generateId } from '@/lib/utils';
import { Screenshot } from '@/types';
import { dataStore } from '@/lib/store';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ success: false, error: '没有上传文件' }, { status: 400 });
    }

    // 保存文件
    const { filename, imagePath } = await saveUploadedFile(file);

    // 创建截图记录
    const screenshot: Screenshot = {
      id: generateId(),
      filename,
      uploadedAt: new Date(),
      imagePath
    };

    dataStore.addScreenshot(screenshot);

    console.log('Upload success:', screenshot);

    return NextResponse.json({
      success: true,
      screenshot
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({
      success: false,
      error: '上传失败'
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

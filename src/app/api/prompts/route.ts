import { NextRequest, NextResponse } from 'next/server';
import { dataStore } from '@/lib/store';
import { generateId } from '@/lib/utils';
import { PromptTemplate } from '@/types';

// GET - 获取所有prompts
export async function GET() {
  const prompts = dataStore.getPrompts();
  const currentPrompt = dataStore.getCurrentPrompt();

  return NextResponse.json({
    success: true,
    prompts,
    currentPromptId: currentPrompt.id
  });
}

// POST - 新增prompt
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, content } = body;

    if (!name || !content) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 });
    }

    const newPrompt: PromptTemplate = {
      id: generateId(),
      name,
      version: `v${Date.now()}`,
      content,
      createdAt: new Date(),
      isDefault: false
    };

    dataStore.addPrompt(newPrompt);

    return NextResponse.json({
      success: true,
      prompt: newPrompt
    });
  } catch (error) {
    console.error('Create prompt error:', error);
    return NextResponse.json({ success: false, error: '创建失败' }, { status: 500 });
  }
}

// PUT - 更新prompt
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, content } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少id' }, { status: 400 });
    }

    dataStore.updatePrompt(id, { name, content });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update prompt error:', error);
    return NextResponse.json({ success: false, error: '更新失败' }, { status: 500 });
  }
}

// DELETE - 删除prompt
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少id' }, { status: 400 });
    }

    dataStore.deletePrompt(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete prompt error:', error);
    return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 });
  }
}

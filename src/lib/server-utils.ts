import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// 服务器端工具函数（只能在API路由中使用）

// 保存上传的文件到临时目录（Vercel只允许写入/tmp）
export async function saveUploadedFile(
  file: File,
  uploadsDir: string = '/tmp/uploads'
): Promise<{ filename: string; imagePath: string }> {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // 确保上传目录存在
  await mkdir(uploadsDir, { recursive: true });

  // 生成唯一文件名
  const ext = file.name.split('.').pop() || 'png';
  const filename = `${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
  const imagePath = join(uploadsDir, filename);

  // 保存文件
  await writeFile(imagePath, buffer);

  return {
    filename,
    imagePath: `/uploads/${filename}` // 返回相对路径
  };
}

// 将文件转换为base64（用于Vercel等Serverless环境）
export async function fileToBase64(file: File): Promise<{ filename: string; base64: string }> {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const base64 = `data:${file.type};base64,${buffer.toString('base64')}`;

  return {
    filename: file.name,
    base64
  };
}

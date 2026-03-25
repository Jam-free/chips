import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// 服务器端工具函数（只能在API路由中使用）

// 保存上传的文件
export async function saveUploadedFile(
  file: File,
  uploadsDir: string = 'public/uploads'
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
    imagePath: `/${uploadsDir}/${filename}`.replace('public/', '')
  };
}

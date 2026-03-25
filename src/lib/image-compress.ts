// 图片压缩工具函数

export async function compressImage(file: File, maxSizeMB: number = 1): Promise<File> {
  // 如果文件已经很小，直接返回
  if (file.size <= maxSizeMB * 1024 * 1024) {
    return file;
  }

  // 动态导入browser-image-compression
  const imageCompression = (await import('browser-image-compression')).default;

  const options = {
    maxSizeMB: maxSizeMB,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    fileType: file.type,
    quality: 0.8
  };

  try {
    console.log(`[Compress] Original size: ${(file.size / 1024).toFixed(2)} KB`);
    const compressedFile = await imageCompression(file, options);
    console.log(`[Compress] Compressed size: ${(compressedFile.size / 1024).toFixed(2)} KB`);
    console.log(`[Compress] Reduced by: ${((1 - compressedFile.size / file.size) * 100).toFixed(1)}%`);
    return compressedFile;
  } catch (error) {
    console.error('[Compress] Error:', error);
    // 压缩失败返回原文件
    return file;
  }
}

// 批量压缩图片（并发）
export async function compressImages(files: FileList | File[], maxSizeMB: number = 1): Promise<File[]> {
  const fileArray = Array.from(files);
  const compressedFiles = await Promise.all(
    fileArray.map(file => compressImage(file, maxSizeMB))
  );
  return compressedFiles;
}

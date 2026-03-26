// 图片压缩工具函数

// 手机专用压缩配置（更激进的压缩以适应手机网络和性能）
const MOBILE_CONFIG = {
  maxSizeMB: 0.5,           // 降低到500KB（原来是1MB）
  maxWidthOrHeight: 1024,   // 降低到1024px（原来是1280px）
  quality: 0.6,             // 降低质量到0.6（原来是0.7）
  useWebWorker: true,
};

// 桌面端压缩配置
const DESKTOP_CONFIG = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1280,
  quality: 0.7,
  useWebWorker: true,
};

// 检测是否为移动设备
function isMobile(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = navigator.userAgent.toLowerCase();
  const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  const isSmallScreen = window.innerWidth <= 768;

  return isMobileDevice || isSmallScreen;
}

export async function compressImage(file: File, maxSizeMB?: number): Promise<File> {
  // 如果文件已经很小，直接返回
  const targetSizeMB = maxSizeMB || (isMobile() ? MOBILE_CONFIG.maxSizeMB : DESKTOP_CONFIG.maxSizeMB);

  if (file.size <= targetSizeMB * 1024 * 1024) {
    console.log(`[Compress] File already small enough: ${(file.size / 1024).toFixed(2)} KB`);
    return file;
  }

  // 动态导入browser-image-compression
  const imageCompression = (await import('browser-image-compression')).default;

  // 根据设备类型选择配置
  const config = isMobile() ? MOBILE_CONFIG : DESKTOP_CONFIG;

  const options = {
    maxSizeMB: maxSizeMB || config.maxSizeMB,
    maxWidthOrHeight: config.maxWidthOrHeight,
    useWebWorker: config.useWebWorker,
    fileType: file.type,
    quality: config.quality,
    alwaysKeepResolution: false,
    // 移除EXIF信息以进一步减小文件大小（手机通常有很多无用EXIF）
    exifOrientation: -1,
  };

  try {
    console.log(`[Compress] Device: ${isMobile() ? 'Mobile' : 'Desktop'}`);
    console.log(`[Compress] Original: ${(file.size / 1024).toFixed(2)} KB, Target: ${targetSizeMB} MB`);

    const compressedFile = await imageCompression(file, options);

    const reduction = ((1 - compressedFile.size / file.size) * 100).toFixed(1);
    console.log(`[Compress] Result: ${(compressedFile.size / 1024).toFixed(2)} KB (reduced ${reduction}%)`);

    // 如果压缩后还是太大，再进行一次压缩（递归）
    if (compressedFile.size > targetSizeMB * 1024 * 1024 && maxSizeMB !== 0.3) {
      console.log('[Compress] Still too large, compressing again...');
      return compressImage(compressedFile, 0.3);  // 最低300KB
    }

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

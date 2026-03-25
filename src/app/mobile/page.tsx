'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function MobileUploadPage() {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setError('');
    setUploaded(0);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();

        if (data.success) {
          setUploaded(i + 1);
        } else {
          throw new Error(data.error || '上传失败');
        }
      }

      // 上传完成
      setTimeout(() => {
        alert(`成功上传 ${uploaded} 张截图！`);
        setUploading(false);
        setUploaded(0);
      }, 500);

    } catch (err: any) {
      setError(err.message || '上传失败');
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* 头部 */}
        <div className="text-center py-8">
          <h1 className="text-2xl font-bold mb-2">📱 上传屏幕截图</h1>
          <p className="text-sm text-muted-foreground">
            选择手机中的截图，上传到PC端
          </p>
        </div>

        {/* 上传区域 */}
        <Card>
          <CardHeader>
            <CardTitle>选择图片</CardTitle>
            <CardDescription>
              支持批量选择，一次最多上传20张
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* 上传按钮 */}
              <div className="border-2 border-dashed rounded-lg p-12 text-center">
                {uploading ? (
                  <div className="space-y-4">
                    <div className="w-16 h-16 mx-auto border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-medium">
                      上传中... ({uploaded}/20)
                    </p>
                  </div>
                ) : (
                  <>
                    <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-sm font-medium mb-4">
                      点击选择相册中的截图
                    </p>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e.target.files)}
                      className="hidden"
                      id="mobile-file-upload"
                      disabled={uploading}
                    />
                    <label htmlFor="mobile-file-upload">
                      <Button className="w-full" disabled={uploading}>
                        选择图片
                      </Button>
                    </label>
                  </>
                )}
              </div>

              {/* 错误提示 */}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
                  <AlertCircle className="h-4 w-4" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {/* 成功提示 */}
              {uploaded > 0 && !uploading && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 text-green-600 rounded-lg">
                  <CheckCircle className="h-4 w-4" />
                  <p className="text-sm">成功上传 {uploaded} 张截图！</p>
                </div>
              )}

              {/* 说明 */}
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• 支持 PNG、JPG、JPEG 格式</p>
                <p>• 单张图片不超过 5MB</p>
                <p>• 上传后可在PC端查看生成结果</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 使用说明 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">使用说明</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>1. 从手机相册选择屏幕截图</p>
            <p>2. 点击"选择图片"批量上传</p>
            <p>3. 上传完成后，返回PC端查看</p>
            <p>4. PC端会自动生成话题chips</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

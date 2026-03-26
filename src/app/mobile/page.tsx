'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, CheckCircle, AlertCircle, Image as ImageIcon } from 'lucide-react';

export default function MobileUploadPage() {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [error, setError] = useState('');

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // 限制最多 20 张，避免移动端一次性处理太多导致崩溃
    const fileArray = Array.from(files).slice(0, 20);

    setUploading(true);
    setError('');
    setUploaded(0);

    try {
      let successCount = 0;
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const formData = new FormData();
        formData.append('file', file);

        // 移动端使用 lite 模式：不返回 base64，避免大 JSON 导致浏览器崩溃/刷新
        const res = await fetch('/api/upload?lite=1', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();

        if (data.success) {
          successCount = i + 1;
          setUploaded(successCount);
        } else {
          throw new Error(data.error || '上传失败');
        }
      }

      // 上传完成
      setTimeout(() => {
        alert(`成功上传 ${successCount} 张截图！`);
        setUploading(false);
        setUploaded(0);
      }, 500);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '上传失败');
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-4 pb-10">
      <div className="max-w-md mx-auto space-y-5">
        {/* 头部 */}
        <div className="text-center pt-6">
          <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow">
            <ImageIcon className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">上传屏幕截图</h1>
          <p className="text-sm text-slate-600 mt-1">
            选择截图后自动上传到电脑端
          </p>
        </div>

        {/* 上传区域 */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">选择图片</CardTitle>
            <CardDescription>
              支持多选，最多 20 张（建议先在相册里勾选）
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* 上传按钮 */}
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-white">
                {uploading ? (
                  <div className="space-y-4">
                    <div className="w-14 h-14 mx-auto border-4 border-slate-900/20 border-t-slate-900 rounded-full animate-spin" />
                    <p className="text-sm font-medium text-slate-900">
                      上传中（{uploaded}/20）
                    </p>
                    <p className="text-xs text-slate-500">请不要切后台或刷新页面</p>
                  </div>
                ) : (
                  <>
                    <Upload className="h-10 w-10 mx-auto mb-3 text-slate-500" />
                    <p className="text-sm font-medium text-slate-900 mb-1">从相册选择截图</p>
                    <p className="text-xs text-slate-500 mb-4">上传完成后回到电脑端查看结果</p>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e.target.files)}
                      className="hidden"
                      id="mobile-file-upload"
                      disabled={uploading}
                    />
                    <Button
                      className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white"
                      disabled={uploading}
                      onClick={() => document.getElementById('mobile-file-upload')?.click()}
                    >
                      选择图片
                    </Button>
                  </>
                )}
              </div>

              {/* 错误提示 */}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 text-red-700 rounded-xl border border-red-200">
                  <AlertCircle className="h-4 w-4" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {/* 成功提示 */}
              {uploaded > 0 && !uploading && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
                  <CheckCircle className="h-4 w-4" />
                  <p className="text-sm">成功上传 {uploaded} 张截图！</p>
                </div>
              )}

              {/* 说明 */}
              <div className="text-xs text-slate-500 space-y-1">
                <p>• 支持 PNG/JPG/JPEG</p>
                <p>• 单张建议 ≤ 5MB（更稳定）</p>
                <p>• 如果提示失败，先换网络或减少张数再试</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 使用说明 */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">使用说明</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>1. 在相册里多选你想测试的截图</p>
            <p>2. 回到本页点击“选择图片”并上传</p>
            <p>3. 上传完成后在电脑端点击生成话题 chips</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { QrCode } from 'lucide-react';

interface QRCodeButtonProps {
  mobileUrl?: string;
}

export function QRCodeButton({ mobileUrl = '/mobile' }: QRCodeButtonProps) {
  const [currentUrl, setCurrentUrl] = useState('');

  useEffect(() => {
    // 获取当前页面的完整URL
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const mobilePageUrl = `${url.origin}${mobileUrl}`;
      setCurrentUrl(mobilePageUrl);
    }
  }, [mobileUrl]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <QrCode className="h-4 w-4 mr-2" />
          手机扫码上传
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>手机扫码上传</DialogTitle>
          <DialogDescription>
            使用手机扫描二维码，访问移动端上传页面
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center space-y-4 py-4">
          {currentUrl && (
            <div className="bg-white p-4 rounded-lg">
              <QRCodeSVG
                value={currentUrl}
                size={200}
                level="M"
                includeMargin={true}
              />
            </div>
          )}

          <div className="text-center space-y-2">
            <p className="text-sm font-medium">{currentUrl}</p>

            {currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1') ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <p className="font-semibold mb-2">⚠️ 需要公网访问</p>
                <p className="mb-2">当前是localhost地址，手机无法直接访问。</p>
                <p className="font-medium">解决方案：</p>
                <ol className="list-decimal list-inside mt-1 space-y-1 text-left">
                  <li>使用 ngrok：<code className="bg-amber-100 px-1 rounded">ngrok http 3003</code></li>
                  <li>或部署到 Vercel/云服务器</li>
                </ol>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                1. 打开手机相机或微信扫一扫<br />
                2. 扫描上方二维码<br />
                3. 在手机上选择截图上传
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Upload, Download, RefreshCw, Settings, Plus, X, ChevronLeft, ChevronRight, AlertCircle, Loader2, FileText } from 'lucide-react';
import { Screenshot, ChipResult, PromptTemplate, InnerOSResult } from '@/types';
import { QRCodeButton } from '@/components/qrcode-button';
import { compressImage } from '@/lib/image-compress';

interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'pending' | 'compressing' | 'uploading' | 'success' | 'error';
  error?: string;
}

interface AnalyzeMetadata {
  usedMockData: boolean;
  provider: string;
  chipsCount: number;
}

export default function Home() {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [results, setResults] = useState<Record<string, ChipResult>>({});
  const [innerOSResults, setInnerOSResults] = useState<Record<string, InnerOSResult>>({});
  const [analyzeMetadata, setAnalyzeMetadata] = useState<Record<string, AnalyzeMetadata>>({});
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [currentPromptId, setCurrentPromptId] = useState<string>('');
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [analyzing, setAnalyzing] = useState<Record<string, boolean>>({});
  const [generatingOS, setGeneratingOS] = useState<Record<string, boolean>>({});
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<'glm' | 'minimax' | 'siliconflow'>('glm');
  const [testingApi, setTestingApi] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 上传状态
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // 全局错误处理
  React.useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('[Global Error Handler]', event.error);
      setErrorMessage(event.message || '未知错误');
      setHasError(true);
      event.preventDefault();
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[Unhandled Rejection]', event.reason);
      setErrorMessage(event.reason?.message || '异步操作失败');
      setHasError(true);
      event.preventDefault();
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // 上传单个文件（带重试）
  const uploadFileWithRetry = async (
    file: File,
    maxRetries: number = 2
  ): Promise<{ success: boolean; screenshot?: Screenshot; error?: string }> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const formData = new FormData();
        formData.append('file', file);

        console.log(`[Upload] Attempt ${attempt + 1}/${maxRetries + 1} for ${file.name}`);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();

        if (data.success && data.screenshot) {
          const screenshot: Screenshot = {
            id: data.screenshot.id,
            filename: data.screenshot.filename,
            imagePath: data.screenshot.imagePath,
            uploadedAt: new Date(data.screenshot.uploadedAt),
            imageHash: data.screenshot.imageHash
          };
          return { success: true, screenshot };
        } else {
          throw new Error(data.error || '上传失败');
        }
      } catch (error: unknown) {
        const isLastAttempt = attempt === maxRetries;
        const errorMessage = error instanceof Error ? error.message : '未知错误';

        if (error instanceof Error && error.name === 'AbortError') {
          console.error(`[Upload] Timeout on attempt ${attempt + 1} for ${file.name}`);
          if (!isLastAttempt) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            continue;
          }
          return { success: false, error: '上传超时，请检查网络或压缩图片后重试' };
        }

        if (isLastAttempt) {
          return { success: false, error: errorMessage };
        }

        console.warn(`[Upload] Attempt ${attempt + 1} failed for ${file.name}:`, errorMessage);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    return { success: false, error: '上传失败，已达最大重试次数' };
  };

  // Prompt编辑状态
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);
  const [viewingPrompt, setViewingPrompt] = useState<PromptTemplate | null>(null);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [promptName, setPromptName] = useState('');
  const [promptContent, setPromptContent] = useState('');

  // 当打开对话框时，不默认加载到编辑区（只显示列表）
  const handleOpenPromptDialog = () => {
    const current = prompts.find(p => p.id === currentPromptId) || null;
    setViewingPrompt(current);
    setEditingPrompt(null);
    setIsEditingPrompt(false);
    setPromptName('');
    setPromptContent(current?.content || '');
    setPromptDialogOpen(true);
  };

  // 初始化加载数据
  useEffect(() => {
    loadConfig();
    loadScreenshots();
    loadPrompts();
  }, []);

  // 当截图数量变化时，更新选中的索引
  useEffect(() => {
    if (screenshots.length > 0 && selectedIndexes.length === 0) {
      setSelectedIndexes([0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenshots]);

  const loadConfig = async () => {
    try {
      // 先从localStorage加载
      const savedKey = localStorage.getItem('chip-api-key');
      const savedProvider = localStorage.getItem('chip-provider') as 'glm' | 'minimax' | null;

      if (savedKey) {
        setApiKey(savedKey);
      }
      if (savedProvider) {
        setProvider(savedProvider);
      }

      // 再从服务器加载（如果有配置）
      const res = await fetch('/api/config');
      if (!res.ok) {
        console.warn('Failed to load config from server:', res.status);
        return;
      }
      const data = await res.json();

      // 如果localStorage没有配置，但服务器有，则使用服务器的
      if (!savedKey && (data.glmKey || data.minimaxKey || data.siliconflowKey)) {
        if (data.glmKey) {
          setApiKey(data.glmKey);
          setProvider('glm');
        } else if (data.minimaxKey) {
          setApiKey(data.minimaxKey);
          setProvider('minimax');
        } else if (data.siliconflowKey) {
          setApiKey(data.siliconflowKey);
          setProvider('siliconflow');
        }
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      // 不阻塞应用，只是记录错误
    }
  };

  const loadScreenshots = async () => {
    try {
      const res = await fetch('/api/upload');
      const data = await res.json();
      if (data.success && data.screenshots) {
        // 过滤掉无效的截图数据（兼容性处理）
        // 并将ISO字符串日期转换回Date对象
        const validScreenshots = data.screenshots
          .filter((s: Screenshot) =>
            s && s.id && s.imagePath && (s.imagePath.startsWith('data:') || s.imagePath.startsWith('/'))
          )
          .map((s: Screenshot) => ({
            ...s,
            uploadedAt: new Date(s.uploadedAt)
          }));

        setScreenshots(validScreenshots);
        if (validScreenshots.length > 0) {
          setSelectedIndexes([0]);
        }
      }
    } catch (error) {
      console.error('Failed to load screenshots:', error);
    }
  };

  const loadPrompts = async () => {
    try {
      const res = await fetch('/api/prompts');
      if (!res.ok) {
        console.warn('Failed to load prompts:', res.status);
        return;
      }
      const data = await res.json();
      if (data.success && data.prompts) {
        setPrompts(data.prompts);
        setCurrentPromptId(data.currentPromptId || data.prompts[0]?.id || '');
      }
    } catch (error) {
      console.error('Failed to load prompts:', error);
      // 不阻塞应用，只是记录错误
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    console.log('[handleFileUpload] Starting upload, files:', files.length);

    // 检查文件大小（检查原始文件）
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB（压缩前）
    const oversizedFiles: string[] = [];

    for (let i = 0; i < files.length; i++) {
      if (files[i].size > MAX_FILE_SIZE) {
        oversizedFiles.push(`${files[i].name} (${(files[i].size / 1024 / 1024).toFixed(2)}MB)`);
      }
    }

    if (oversizedFiles.length > 0) {
      alert(`⚠️ 以下文件超过10MB限制，无法上传：\n${oversizedFiles.join('\n')}\n\n建议：先压缩图片或选择较小的文件`);
      return;
    }

    setIsUploading(true);
    const newScreenshots: Screenshot[] = [];
    const currentScreenshotCount = screenshots.length;

    // 初始化进度
    const initialProgress: UploadProgress[] = Array.from(files).map(file => ({
      fileName: file.name,
      progress: 0,
      status: 'pending' as const
    }));
    setUploadProgress(initialProgress);

    try {
      // 步骤1: 压缩所有图片
      console.log('[handleFileUpload] Step 1: Compressing images...');
      const compressedFiles: File[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // 更新状态为压缩中
        setUploadProgress(prev => prev.map((p, idx) =>
          idx === i ? { ...p, status: 'compressing' } : p
        ));

        try {
          // 检测是否为移动设备，使用不同的压缩目标
          const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent) ||
                           window.innerWidth <= 768;
          const targetSizeMB = isMobile ? 0.5 : 1;  // 手机500KB，桌面1MB

          const compressed = await compressImage(file, targetSizeMB);
          compressedFiles.push(compressed);
          console.log(`[handleFileUpload] Compressed ${file.name}: ${(file.size / 1024).toFixed(2)}KB → ${(compressed.size / 1024).toFixed(2)}KB`);
        } catch (error) {
          console.error(`[handleFileUpload] Compression failed for ${file.name}:`, error);
          compressedFiles.push(file); // 压缩失败使用原文件
        }
      }

      // 步骤2: 并发上传（2个并发）
      console.log('[handleFileUpload] Step 2: Uploading with concurrency...');
      const CONCURRENCY = 2;
      const uploadPromises: Promise<{ success: boolean; screenshot?: Screenshot; error?: string; index: number }>[] = [];

      for (let i = 0; i < compressedFiles.length; i++) {
        const file = compressedFiles[i];

        // 更新状态为上传中
        setUploadProgress(prev => prev.map((p, idx) =>
          idx === i ? { ...p, status: 'uploading' } : p
        ));

        const uploadPromise = uploadFileWithRetry(file, 2).then(result => ({
          ...result,
          index: i
        }));

        uploadPromises.push(uploadPromise);

        // 达到并发数时，等待一批完成
        if (uploadPromises.length >= CONCURRENCY || i === compressedFiles.length - 1) {
          const results = await Promise.all(uploadPromises);

          // 处理结果
          for (const result of results) {
            if (result.success && result.screenshot) {
              console.log('[handleFileUpload] Upload success:', result.screenshot.filename);
              newScreenshots.push(result.screenshot);

              // 更新为成功
              setUploadProgress(prev => prev.map((p, idx) =>
                idx === result.index ? { ...p, status: 'success' } : p
              ));
            } else {
              console.error('[handleFileUpload] Upload failed:', result.error);

              // 更新为失败
              setUploadProgress(prev => prev.map((p, idx) =>
                idx === result.index ? { ...p, status: 'error', error: result.error } : p
              ));
            }
          }

          // 清空已完成的promises
          uploadPromises.length = 0;
        }
      }

      // 批量更新状态
      if (newScreenshots.length > 0) {
        console.log('[handleFileUpload] Adding screenshots:', newScreenshots.length);
        setScreenshots(prev => {
          const updated = [...prev, ...newScreenshots];
          console.log('[handleFileUpload] Total screenshots after update:', updated.length);
          return updated;
        });

        // 自动选中第一个新上传的截图
        setSelectedIndexes([currentScreenshotCount]);
      }

      // 静默完成上传，不显示弹窗
      const successCount = newScreenshots.length;
      const failCount = files.length - successCount;

      console.log(`[handleFileUpload] Upload completed: ${successCount} success, ${failCount} failed`);

      // 如果有失败的上传，延迟1秒后清理状态
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress([]);
      }, failCount > 0 ? 1000 : 500);

    } catch (error) {
      console.error('[handleFileUpload] Fatal error:', error);
      alert('上传失败，请重试');
      setIsUploading(false);
      setUploadProgress([]);
    }
  };

  const handleAnalyze = async (screenshotId: string) => {
    if (!apiKey) {
      const willUseMock = confirm('未配置API Key，将使用模拟数据。\n\n点击"取消"前往设置配置API Key。');
      if (!willUseMock) {
        setSettingsDialogOpen(true);
        return;
      }
    }

    setAnalyzing(prev => ({ ...prev, [screenshotId]: true }));
    setGeneratingOS(prev => ({ ...prev, [screenshotId]: true }));

    const screenshot = screenshots.find(s => s.id === screenshotId);

    try {
      // 并行调用chips和OS生成
      const [chipsResponse, osResponse] = await Promise.allSettled([
        fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            screenshotId,
            apiKey,
            provider,
            imageData: screenshot?.imagePath,
            filename: screenshot?.filename,
          }),
        }),
        fetch('/api/inner-os', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            screenshotId,
            apiKey,
            provider,
          }),
        })
      ]);

      // 处理chips结果
      if (chipsResponse.status === 'fulfilled') {
        const data = await chipsResponse.value.json();

        if (!chipsResponse.value.ok || !data.success) {
          alert(`生成话题失败: ${data.error || `HTTP ${chipsResponse.value.status}`}`);
        } else if (!data.data?.chips || !Array.isArray(data.data.chips)) {
          alert('生成失败：返回数据格式错误');
        } else {
          setResults(prev => ({ ...prev, [screenshotId]: data.data }));

          if (data.metadata) {
            setAnalyzeMetadata(prev => ({ ...prev, [screenshotId]: data.metadata }));
          }
        }
      } else {
        console.error('[handleAnalyze] Chips request failed:', chipsResponse.reason);
        alert('生成话题失败，请检查网络连接');
      }

      // 处理OS结果（失败不影响整体）
      if (osResponse.status === 'fulfilled') {
        const data = await osResponse.value.json();

        if (osResponse.value.ok && data.success && data.data?.innerOS) {
          setInnerOSResults(prev => ({ ...prev, [screenshotId]: data.data }));
          console.log('[handleAnalyze] OS generated:', data.data.innerOS);
        } else {
          console.log('[handleAnalyze] OS generation returned non-success or empty:', data);
        }
      } else {
        console.log('[handleAnalyze] OS request failed (non-fatal):', osResponse.reason);
      }

    } catch (error) {
      console.error('[handleAnalyze] Request failed:', error);
      alert('生成失败，请检查网络连接');
    } finally {
      setAnalyzing(prev => ({ ...prev, [screenshotId]: false }));
      setGeneratingOS(prev => ({ ...prev, [screenshotId]: false }));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/upload?id=${id}`, { method: 'DELETE' });
      setScreenshots(prev => prev.filter(s => s.id !== id));
      setResults(prev => {
        const newResults = { ...prev };
        delete newResults[id];
        return newResults;
      });
      setInnerOSResults(prev => {
        const newOSResults = { ...prev };
        delete newOSResults[id];
        return newOSResults;
      });
      setSelectedIndexes([]);
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const handleSwitchPrompt = async (promptId: string) => {
    const targetPrompt = prompts.find(p => p.id === promptId);
    if (!targetPrompt) {
      alert('Prompt不存在');
      return;
    }

    // 验证prompt内容
    const validation = validatePrompt(targetPrompt.content);
    if (!validation.isValid) {
      alert(`⚠️ 无法切换到此Prompt：\n\n${validation.error}\n\n请选择其他有效的Prompt`);
      return;
    }

    try {
      await fetch('/api/prompts/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId }),
      });

      setCurrentPromptId(promptId);
      setResults({});

      // 关闭对话框
      setPromptDialogOpen(false);

      // 如果有截图，提示用户是否重新生成
      if (screenshots.length > 0) {
        setTimeout(() => {
          const confirmed = confirm(`✅ 已切换到「${targetPrompt.name}」\n\n是否重新生成所有截图的话题？`);
          if (confirmed) {
            // 逐个生成，避免并发过多
            regenerateAllScreenshots();
          }
        }, 300);
      }
    } catch (error) {
      console.error('Switch prompt error:', error);
      alert('切换失败');
    }
  };

  // 逐个重新生成所有截图
  const regenerateAllScreenshots = async () => {
    let success = 0;
    let failed = 0;

    for (let i = 0; i < screenshots.length; i++) {
      const screenshot = screenshots[i];
      try {
        await handleAnalyze(screenshot.id);
        success++;
      } catch (error) {
        console.error(`Regenerate failed for ${screenshot.id}:`, error);
        failed++;
      }
    }

    alert(`✅ 重新生成完成\n\n成功: ${success}张\n失败: ${failed}张`);
  };

  // 验证prompt内容是否有效
  const validatePrompt = (content: string): { isValid: boolean; error: string } => {
    if (!content || content.trim().length < 30) {
      return { isValid: false, error: 'Prompt内容不能少于30字' };
    }
    if (content.length > 10000) {
      return { isValid: false, error: 'Prompt内容不能超过10000字' };
    }
    return { isValid: true, error: '' };
  };

  const handleSavePrompt = async () => {
    // 验证prompt内容
    const validation = validatePrompt(promptContent);
    if (!validation.isValid) {
      alert(`⚠️ ${validation.error}`);
      return;
    }

    try {
      if (editingPrompt) {
        const res = await fetch('/api/prompts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingPrompt.id,
            name: promptName,
            content: promptContent,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        // 保存后回到“查看态”
        setViewingPrompt({ ...editingPrompt, name: promptName || editingPrompt.name, content: promptContent });
      } else {
        const res = await fetch('/api/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: promptName, content: promptContent }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data?.success && data?.prompt) {
          setViewingPrompt(data.prompt as PromptTemplate);
        }
      }

      // 重新加载prompts
      await loadPrompts();

      // 退出编辑态
      setIsEditingPrompt(false);
      setEditingPrompt(null);
      setPromptName('');
      setPromptContent(promptContent);

      alert('✅ Prompt保存成功！');
    } catch (error) {
      console.error('Save prompt error:', error);
      alert('保存失败');
    }
  };

  const handleExport = async () => {
    try {
      const currentPrompt = prompts.find(p => p.id === currentPromptId);
      const url = `/api/export?promptVersion=${currentPrompt?.version || ''}`;
      window.open(url, '_blank');
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  const handleTestApi = async () => {
    if (!apiKey.trim()) {
      alert('请先输入API密钥');
      return;
    }

    setTestingApi(true);

    try {
      // 创建一个简单的测试图片（1x1像素的PNG）
      const testImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screenshotId: 'test',
          apiKey,
          provider,
          testImage: testImageBase64
        }),
      });

      const data = await res.json();

      if (data.success) {
        alert(`✅ API测试成功！\n\n提供商: ${provider === 'glm' ? 'GLM-4V' : 'MiniMax VL'}\n状态: 正常工作`);
      } else {
        alert(`❌ API测试失败\n\n错误: ${data.error || '未知错误'}\n\n请检查API密钥是否正确`);
      }
    } catch (error) {
      console.error('Test API error:', error);
      alert('❌ API测试失败\n\n请检查网络连接');
    } finally {
      setTestingApi(false);
    }
  };

  const selectScreenshot = (index: number) => {
    setSelectedIndexes([index]);
  };

  const currentPrompt = prompts.find(p => p.id === currentPromptId);
  const displayScreenshots = selectedIndexes.length > 0
    ? selectedIndexes.map(i => screenshots[i]).filter(Boolean)
    : screenshots.slice(0, 3);

  const providerLabel = (p?: string) => {
    if (!p) return '未知';
    if (p === 'glm') return 'GLM-4V';
    if (p === 'minimax') return 'MiniMax';
    if (p === 'siliconflow') return '硅基流动(Qwen3-VL)';
    if (p === 'mock') return '模拟数据';
    if (p === 'cached') return '缓存结果';
    return p;
  };

  // 显示错误界面
  if (hasError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <Card className="p-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">出错了</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {errorMessage || '应用遇到了一个错误'}
              </p>
              <Button
                onClick={() => {
                  setHasError(false);
                  setErrorMessage('');
                  window.location.reload();
                }}
                className="w-full"
              >
                刷新页面
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 上传进度对话框 */}
      {isUploading && uploadProgress.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 animate-spin" />
              <h3 className="text-base sm:text-lg font-semibold text-slate-900">
                {uploadProgress.some(p => p.status === 'compressing') ? '压缩图片...' : '上传中...'}
              </h3>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto">
              {uploadProgress.map((progress, idx) => (
                <div key={`${progress.fileName}-${idx}`} className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700 truncate flex-1" title={progress.fileName}>
                      {progress.fileName}
                    </span>
                    <span className="text-xs text-slate-500 ml-2 flex-shrink-0">
                      {progress.status === 'compressing' && '🗜️ 压缩中'}
                      {progress.status === 'pending' && '⏳ 等待'}
                      {progress.status === 'uploading' && '📤 上传中'}
                      {progress.status === 'success' && '✅ 成功'}
                      {progress.status === 'error' && '❌ 失败'}
                    </span>
                  </div>

                  {/* 错误提示 */}
                  {progress.status === 'error' && progress.error && (
                    <div className="flex items-start gap-2 mt-2 text-red-600 text-xs">
                      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <span className="break-words">{progress.error}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200">
              <p className="text-xs text-slate-500 text-center">
                {uploadProgress.some(p => p.status === 'compressing')
                  ? '正在压缩图片，请稍候...（压缩后上传更快）'
                  : '正在上传图片到服务器...'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 顶部导航栏 - 简洁版 */}
      <header className="h-14 sm:h-16 border-b bg-card fixed top-0 w-full z-50">
        <div className="container mx-auto px-2 sm:px-4 h-full">
          <div className="flex items-center justify-between h-full gap-2">
            <div className="flex items-center gap-1 sm:gap-3 min-w-0">
              <h1 className="text-base sm:text-lg font-bold truncate">🎯 话题生成器</h1>
              <span className="text-xs text-muted-foreground hidden sm:inline">v1.0</span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Prompt管理按钮 - 使用FileText图标 */}
              <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 sm:h-8 px-2 sm:px-3" onClick={handleOpenPromptDialog}>
                    <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-1" />
                    <span className="hidden xs:inline">Prompt</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto !bg-white !text-slate-900">
                  <DialogHeader>
                    <DialogTitle className="!text-slate-900">话题生成Prompt管理</DialogTitle>
                    <DialogDescription className="!text-slate-600">
                      查看、修改或新增不同版本的Prompt模板
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    {/* 当前Prompt说明 */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="text-sm">
                        <span className="font-semibold text-blue-900">当前使用：</span>
                        <span className="text-blue-800 ml-1">{currentPrompt?.name} ({currentPrompt?.version})</span>
                      </div>
                    </div>

                    {/* Prompt列表 */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-900 block">已有Prompt版本</label>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {prompts.map((prompt) => (
                          <div
                            key={prompt.id}
                            className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                              prompt.id === currentPromptId
                                ? 'bg-blue-50 border-blue-300'
                                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <div className="flex-1">
                              <div className="font-medium text-slate-900">{prompt.name}</div>
                              <div className="text-xs text-slate-600">{prompt.version}</div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setViewingPrompt(prompt);
                                  setEditingPrompt(null);
                                  setIsEditingPrompt(false);
                                  setPromptName('');
                                  setPromptContent(prompt.content);
                                }}
                                className="h-8"
                              >
                                查看
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setViewingPrompt(prompt);
                                  setEditingPrompt(prompt);
                                  setIsEditingPrompt(true);
                                  setPromptName(prompt.name);
                                  setPromptContent(prompt.content);
                                }}
                                className="h-8"
                              >
                                编辑
                              </Button>
                              {prompt.id !== currentPromptId && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    handleSwitchPrompt(prompt.id);
                                    setPromptDialogOpen(false);
                                  }}
                                  className="h-8"
                                >
                                  切换
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 预览/编辑区 */}
                    <div className="space-y-3 pt-3 border-t border-slate-200">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900">
                          {isEditingPrompt
                            ? (editingPrompt ? `编辑：${editingPrompt.name}` : '新增Prompt')
                            : `查看：${viewingPrompt?.name || '（未选择）'}`}
                        </div>
                        <div className="flex gap-2">
                          {!isEditingPrompt && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setViewingPrompt(null);
                                setEditingPrompt(null);
                                setIsEditingPrompt(true);
                                setPromptName('');
                                setPromptContent('');
                              }}
                              className="h-8"
                            >
                              新增
                            </Button>
                          )}
                          {isEditingPrompt && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setIsEditingPrompt(false);
                                setEditingPrompt(null);
                                setPromptName('');
                                setPromptContent(viewingPrompt?.content || '');
                              }}
                              className="h-8 text-slate-600"
                            >
                              取消
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* 新增Prompt需要名称 */}
                      {isEditingPrompt && !editingPrompt && (
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-slate-700">Prompt名称</label>
                          <Input
                            value={promptName}
                            onChange={(e) => setPromptName(e.target.value)}
                            placeholder="例如：优化版 v2.1"
                            className="bg-slate-50 border-slate-300"
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-700">
                          Prompt内容
                        </label>
                        <Textarea
                          value={promptContent}
                          onChange={(e) => setPromptContent(e.target.value)}
                          placeholder="输入完整的Prompt..."
                          rows={12}
                          readOnly={!isEditingPrompt}
                          className={`font-mono text-xs border-slate-300 ${
                            isEditingPrompt ? 'bg-slate-50' : 'bg-slate-100'
                          }`}
                        />
                      </div>

                      {isEditingPrompt && (
                        <Button
                          onClick={() => {
                            if (!editingPrompt && !promptName.trim()) {
                              alert('请填写名称');
                              return;
                            }
                            if (!promptContent.trim()) {
                              alert('请填写内容');
                              return;
                            }
                            handleSavePrompt();
                            setIsEditingPrompt(false);
                            setEditingPrompt(null);
                            // 让用户保存后回到查看态（查看当前选择的prompt）
                            setPromptName('');
                          }}
                          className="w-full bg-slate-900 hover:bg-slate-800 text-white"
                        >
                          保存
                        </Button>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* 设置按钮 */}
              <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 sm:h-8 px-2 sm:px-3">
                    <Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-1" />
                    <span className="hidden xs:inline">设置</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md !bg-white !text-slate-900 border-slate-200">
                  <DialogHeader>
                    <DialogTitle className="!text-slate-900">设置</DialogTitle>
                    <DialogDescription className="!text-slate-600">
                      配置API密钥和导出数据
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-6 py-4">
                    <div className="space-y-3">
                      <label className="text-sm font-semibold text-slate-900 block">
                        API密钥
                        <span className="font-normal text-slate-500 ml-1">（推荐配置）</span>
                      </label>
                      <Input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="输入GLM或MiniMax的API Key"
                        className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400"
                      />
                      <div className="text-xs text-slate-600 leading-relaxed space-y-1">
                        <p>• 留空将使用模拟数据（固定问题）</p>
                        <p>• 配置后可使用真实AI生成个性化问题</p>
                        <p className="text-amber-600">• API Key仅保存在浏览器本地</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-sm font-semibold text-slate-900 block">
                        VLM提供商
                      </label>
                      <Select value={provider} onValueChange={(v: 'glm' | 'minimax' | 'siliconflow') => setProvider(v)}>
                        <SelectTrigger className="bg-slate-50 border-slate-300 text-slate-900">
                          <SelectValue placeholder="选择提供商" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-slate-200">
                          <SelectItem value="glm" className="text-slate-900 focus:bg-slate-100">
                            GLM-4V（智谱AI）
                          </SelectItem>
                          <SelectItem value="minimax" className="text-slate-900 focus:bg-slate-100">
                            MiniMax VL
                          </SelectItem>
                          <SelectItem value="siliconflow" className="text-slate-900 focus:bg-slate-100">
                            硅基流动（Qwen3-VL-8B）
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="pt-2 border-t border-slate-200 space-y-2">
                      <Button
                        onClick={() => {
                          // 保存配置
                          if (apiKey.trim()) {
                            localStorage.setItem('chip-api-key', apiKey);
                            localStorage.setItem('chip-provider', provider);
                            alert('✅ API配置已保存');
                          } else {
                            localStorage.removeItem('chip-api-key');
                            localStorage.removeItem('chip-provider');
                            alert('✅ 已清除API配置，将使用模拟数据');
                          }
                        }}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white"
                      >
                        💾 保存配置
                      </Button>
                      {apiKey.trim() && (
                        <Button
                          onClick={handleTestApi}
                          disabled={testingApi}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {testingApi ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              测试中...
                            </>
                          ) : (
                            <>
                              🧪 测试API连接
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        onClick={handleExport}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-white"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        导出Excel
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </header>

      {/* 主内容区 - 截图预览 */}
      <main
        className="container mx-auto px-2 sm:px-4 pb-28 sm:pb-24"
        style={{ marginTop: '4.5rem' }}
      >
        {screenshots.length === 0 ? (
          // 空状态
          <div className="min-h-[50vh] sm:min-h-[60vh] flex items-center justify-center">
            <Card className="p-6 sm:p-12 text-center max-w-md">
              <Upload className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-3 sm:mb-4 text-muted-foreground" />
              <h2 className="text-lg sm:text-xl font-semibold mb-2">开始使用</h2>
              <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6">
                上传手机截图，AI将自动生成用户可能问的问题
              </p>
              <div className="flex flex-col gap-3">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="hidden"
                  id="empty-file-upload"
                />
                <label htmlFor="empty-file-upload">
                  <Button className="w-full" asChild>
                    <span>
                      <Plus className="h-4 w-4 mr-2" />
                      选择图片
                    </span>
                  </Button>
                </label>
                <QRCodeButton />
              </div>
            </Card>
          </div>
        ) : (
          // 截图展示区：移动端上图下文（chips 全宽可读）；桌面端左图右栏（chips 足够宽度）
          <div className="flex w-full max-w-[min(100%,520px)] sm:max-w-none mx-auto flex-col items-stretch justify-center gap-4 sm:gap-6 sm:flex-row sm:items-start sm:justify-center pb-4 px-1">
            {displayScreenshots.map((screenshot) => {
              const result = results[screenshot.id];
              const isAnalyzing = analyzing[screenshot.id];

              return (
                <div
                  key={screenshot.id}
                  className="relative group w-full sm:w-auto sm:max-w-5xl"
                >
                  <div className="flex flex-col sm:flex-row shadow-xl rounded-2xl border border-slate-200/80 bg-white overflow-visible">
                    {/* 主体图片 */}
                    <div className="relative w-full sm:w-[min(260px,42vw)] sm:max-w-[280px] shrink-0 aspect-[9/16] max-h-[min(72vh,520px)] sm:max-h-[min(85vh,560px)] bg-slate-100 flex items-center justify-center rounded-t-2xl sm:rounded-l-2xl sm:rounded-tr-none">
                      <img
                        src={screenshot.imagePath}
                        alt={screenshot.filename}
                        className="h-full w-full object-contain"
                      />

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(screenshot.id);
                        }}
                        className="absolute top-2 sm:top-3 right-2 sm:right-3 h-8 w-8 bg-black/60 hover:bg-red-600 rounded-full flex items-center justify-center text-white sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                        aria-label="删除"
                      >
                        <X className="h-4 w-4" />
                      </button>

                      {result && (
                        <div className="absolute top-2 sm:top-3 left-2 sm:left-3 h-8 w-8 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-md">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* 话题区：全宽可读，不裁切文字 */}
                    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col bg-gradient-to-b from-slate-50 to-slate-100 p-4 sm:min-w-[280px] sm:max-w-[min(100%,380px)] sm:rounded-r-2xl rounded-b-2xl sm:rounded-bl-none">
                      {result && result.chips && result.chips.length > 0 && analyzeMetadata[screenshot.id] && (
                        <div
                          className={`mb-3 shrink-0 rounded-lg px-2.5 py-1.5 text-center text-xs ${
                            analyzeMetadata[screenshot.id].usedMockData
                              ? 'border border-amber-300 bg-amber-100 text-amber-800'
                              : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                          }`}
                        >
                          {analyzeMetadata[screenshot.id].usedMockData
                            ? '模拟数据'
                            : `${providerLabel(analyzeMetadata[screenshot.id].provider)} 生成`}
                        </div>
                      )}

                      {/* AI内心OS区域 */}
                      {innerOSResults[screenshot.id]?.innerOS && (
                        <div className="mb-3 shrink-0 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
                          <div className="flex items-start gap-2">
                            <span className="text-violet-500 text-sm">🤔</span>
                            <p className="flex-1 text-sm text-violet-900 leading-relaxed">
                              {innerOSResults[screenshot.id].innerOS}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* 正在生成OS时的加载状态 */}
                      {generatingOS[screenshot.id] && !innerOSResults[screenshot.id]?.innerOS && (
                        <div className="mb-3 shrink-0 rounded-xl border border-violet-200 bg-violet-50/50 px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />
                            <p className="text-xs text-violet-600">AI正在思考...</p>
                          </div>
                        </div>
                      )}

                      <div className="space-y-3 sm:min-h-0 sm:flex-1 sm:max-h-[min(70vh,520px)] sm:overflow-y-auto">
                        {result && result.chips && result.chips.length > 0 ? (
                          result.chips.map((chip, chipIdx) => (
                            <div
                              key={chipIdx}
                              className="break-words rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left text-sm font-medium leading-relaxed text-slate-900 shadow-sm"
                            >
                              {chip}
                            </div>
                          ))
                        ) : result ? (
                          <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400 text-sm">
                            <AlertCircle className="mb-2 h-8 w-8 opacity-30" />
                            未生成问题，请重新生成
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400 text-sm">
                            <RefreshCw className="mb-2 h-8 w-8 opacity-30" />
                            点击下方按钮生成话题
                          </div>
                        )}
                      </div>

                      <div className="mt-4 shrink-0 pt-1">
                        {!apiKey && !result && (
                          <div className="mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 text-center">
                            💡 未配置API Key，将使用模拟数据
                          </div>
                        )}
                        {isAnalyzing ? (
                          <div className="space-y-2">
                            <Button
                              disabled
                              className="w-full h-14 rounded-2xl bg-blue-600 text-white"
                            >
                              <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                              {apiKey ? '分析中...' : '生成中...'}
                            </Button>
                            <p className="text-xs text-slate-500 text-center">
                              {apiKey
                                ? `正在调用${providerLabel(provider)}分析图片（约10-20秒）`
                                : '正在生成模拟数据（约1-3秒）'}
                            </p>
                          </div>
                        ) : (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAnalyze(screenshot.id);
                            }}
                            disabled={isAnalyzing}
                            className={`w-full h-14 rounded-2xl font-semibold shadow-md transition-all ${
                              result
                                ? 'bg-white hover:bg-slate-50 text-slate-800 border-2 border-slate-200'
                                : 'bg-slate-900 hover:bg-slate-800 text-white shadow-lg hover:shadow-xl'
                            }`}
                          >
                            {result ? '重新生成' : '生成话题'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 底部图片轴 - 类似相册 */}
      {screenshots.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="container mx-auto px-2 py-2 sm:px-4">
              <div className="flex items-center gap-2">
                {/* 左箭头 */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

              {/* 图片轴 */}
              <div
                className="flex-1 flex gap-2 overflow-x-auto scrollbar-hide scroll-smooth"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {screenshots.map((screenshot, index) => {
                  const isSelected = selectedIndexes.includes(index);
                  const hasResult = !!results[screenshot.id];

                  return (
                    <div
                      key={screenshot.id}
                      className={`flex-shrink-0 cursor-pointer transition-all ${
                        isSelected ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-primary/50'
                      }`}
                      onClick={() => selectScreenshot(index)}
                    >
                      <div className="relative w-14 h-24">
                        <img
                          src={screenshot.imagePath}
                          alt={screenshot.filename}
                          className="w-full h-full object-cover rounded"
                        />
                        {hasResult && (
                          <div className="absolute top-0.5 right-0.5 h-3 w-3 bg-green-500 rounded-full" />
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* 添加图片按钮 */}
                {screenshots.length < 9 && (
                  <div
                    className="flex-shrink-0 cursor-pointer"
                    onClick={() => document.getElementById('filmstrip-upload')?.click()}
                  >
                    <div className="w-14 h-24 border-2 border-dashed rounded flex items-center justify-center hover:border-primary transition-colors">
                      <Plus className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>

              {/* 右箭头 */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <input
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => handleFileUpload(e.target.files)}
        className="hidden"
        id="filmstrip-upload"
      />

      {/* CSS: 隐藏滚动条 */}
      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}

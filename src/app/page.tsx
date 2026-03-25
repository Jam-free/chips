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
import { Upload, Download, RefreshCw, Settings, Plus, X, ChevronLeft, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import { Screenshot, ChipResult, PromptTemplate } from '@/types';
import { QRCodeButton } from '@/components/qrcode-button';
import { compressImage } from '@/lib/image-compress';

interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'pending' | 'compressing' | 'uploading' | 'success' | 'error';
  error?: string;
}

export default function Home() {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [results, setResults] = useState<Record<string, ChipResult>>({});
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [currentPromptId, setCurrentPromptId] = useState<string>('');
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [analyzing, setAnalyzing] = useState<Record<string, boolean>>({});
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<'glm' | 'minimax'>('glm');
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
  const [promptName, setPromptName] = useState('');
  const [promptContent, setPromptContent] = useState('');

  // 当打开对话框时，默认加载当前prompt
  const handleOpenPromptDialog = () => {
    const current = prompts.find(p => p.id === currentPromptId);
    if (current && !editingPrompt) {
      setEditingPrompt(current);
      setPromptName(current.name);
      setPromptContent(current.content);
    }
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
      if (!savedKey && (data.glmKey || data.minimaxKey)) {
        if (data.glmKey) {
          setApiKey(data.glmKey);
          setProvider('glm');
        } else if (data.minimaxKey) {
          setApiKey(data.minimaxKey);
          setProvider('minimax');
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
          const compressed = await compressImage(file, 1); // 压缩到1MB以下
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

      // 显示总结
      const successCount = newScreenshots.length;
      const failCount = files.length - successCount;

      setTimeout(() => {
        if (failCount === 0) {
          alert(`✅ 成功上传 ${successCount} 张截图！`);
        } else {
          alert(`⚠️ 上传完成：成功 ${successCount} 张，失败 ${failCount} 张`);
        }
        setIsUploading(false);
        setUploadProgress([]);
      }, 1000);

    } catch (error) {
      console.error('[handleFileUpload] Fatal error:', error);
      alert('上传失败，请重试');
      setIsUploading(false);
      setUploadProgress([]);
    }
  };

  const handleAnalyze = async (screenshotId: string) => {
    setAnalyzing(prev => ({ ...prev, [screenshotId]: true }));

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screenshotId, apiKey, provider }),
      });

      const data = await res.json();

      if (data.success) {
        setResults(prev => ({ ...prev, [screenshotId]: data.data }));

        // 如果使用的是模拟数据，提示用户
        if (!apiKey) {
          console.warn('[Analyze] 使用模拟数据（未配置API Key）');
        }
      } else {
        // 显示错误消息
        alert(`生成失败：${data.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('[Analyze] Error:', error);
      alert('生成失败，请检查网络连接或重试');
    } finally {
      setAnalyzing(prev => ({ ...prev, [screenshotId]: false }));
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
      setSelectedIndexes([]);
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const handleSwitchPrompt = async (promptId: string) => {
    try {
      await fetch('/api/prompts/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId }),
      });

      setCurrentPromptId(promptId);
      setResults({});
    } catch (error) {
      console.error('Switch prompt error:', error);
    }
  };

  const handleSavePrompt = async () => {
    try {
      if (editingPrompt) {
        await fetch('/api/prompts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingPrompt.id,
            name: promptName,
            content: promptContent,
          }),
        });
      } else {
        await fetch('/api/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: promptName, content: promptContent }),
        });
      }

      // 重新加载prompts
      await loadPrompts();

      // 清空编辑状态
      setEditingPrompt(null);
      setPromptName('');
      setPromptContent('');
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
              <h3 className="text-lg font-semibold text-slate-900">
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
      <header className="h-16 border-b bg-card fixed top-0 w-full z-50">
        <div className="container mx-auto px-4 h-full">
          <div className="flex items-center justify-between h-full">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold sm:text-xl">🎯 屏幕话题生成器</h1>
              <span className="text-xs text-muted-foreground hidden sm:inline">v1.0</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Prompt管理按钮 */}
              <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8" onClick={handleOpenPromptDialog}>
                    <Settings className="h-4 w-4 mr-1" />
                    Prompt
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
                                  setEditingPrompt(prompt);
                                  setPromptName(prompt.name);
                                  setPromptContent(prompt.content);
                                }}
                                className="h-8"
                              >
                                {prompt.id === currentPromptId ? '查看/编辑' : '编辑'}
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

                    {/* 当前使用Prompt的完整内容预览 */}
                    {editingPrompt && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <div className="text-sm mb-2">
                          <span className="font-semibold text-amber-900">正在编辑：</span>
                          <span className="text-amber-800 ml-1">{editingPrompt.name} ({editingPrompt.version})</span>
                        </div>
                      </div>
                    )}

                    {/* 新增/编辑Prompt */}
                    <div className="space-y-3 pt-3 border-t border-slate-200">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-900">
                          {editingPrompt ? `编辑Prompt - ${editingPrompt.name}` : '新增Prompt'}
                        </label>
                        {editingPrompt && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingPrompt(null);
                              setPromptName('');
                              setPromptContent('');
                            }}
                            className="text-slate-600"
                          >
                            <X className="h-3 w-3 mr-1" />
                            取消编辑
                          </Button>
                        )}
                      </div>

                      {!editingPrompt && (
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-slate-700">Prompt名称</label>
                          <Input
                            value={promptName}
                            onChange={(e) => setPromptName(e.target.value)}
                            placeholder="例如：优化版 v2.0"
                            className="bg-slate-50 border-slate-300"
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-700">
                          Prompt内容 {editingPrompt && '(当前正在使用)'}
                        </label>
                        <Textarea
                          value={promptContent}
                          onChange={(e) => setPromptContent(e.target.value)}
                          placeholder="输入完整的Prompt..."
                          rows={12}
                          className="font-mono text-xs bg-slate-50 border-slate-300"
                        />
                      </div>

                      <Button
                        onClick={() => {
                          if (!promptName.trim() && !editingPrompt) {
                            alert('请填写名称');
                            return;
                          }
                          if (!promptContent.trim()) {
                            alert('请填写内容');
                            return;
                          }
                          handleSavePrompt();
                          setEditingPrompt(null);
                          setPromptName('');
                          setPromptContent('');
                        }}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white"
                      >
                        {editingPrompt ? '保存修改' : '新增Prompt'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* 设置按钮 */}
              <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <Settings className="h-4 w-4 mr-1" />
                    设置
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
                      <Select value={provider} onValueChange={(v: 'glm' | 'minimax') => setProvider(v)}>
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
      <main className="container mx-auto px-4" style={{ marginTop: '5rem', marginBottom: '6rem' }}>
        {screenshots.length === 0 ? (
          // 空状态
          <div className="min-h-[60vh] flex items-center justify-center">
            <Card className="p-12 text-center max-w-md">
              <Upload className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold mb-2">开始使用</h2>
              <p className="text-muted-foreground mb-6">
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
          // 截图展示区 - 图片+信息区域并排
          <div className="flex items-center justify-center gap-6 overflow-x-auto pb-4">
            {displayScreenshots.map((screenshot) => {
              const result = results[screenshot.id];
              const isAnalyzing = analyzing[screenshot.id];

              return (
                <div
                  key={screenshot.id}
                  className="flex-shrink-0 relative group"
                >
                  {/* 图片+信息区域 容器 */}
                  <div className="flex shadow-xl rounded-2xl overflow-hidden">
                    {/* 主体图片 */}
                    <div className="relative w-[260px] h-[462px] bg-muted">
                      <img
                        src={screenshot.imagePath}
                        alt={screenshot.filename}
                        className="w-full h-full object-cover"
                      />

                      {/* 删除按钮 - 悬浮显示 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(screenshot.id);
                        }}
                        className="absolute top-3 right-3 h-8 w-8 bg-black/70 hover:bg-red-600 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X className="h-4 w-4" />
                      </button>

                      {/* 完成标记 */}
                      {result && (
                        <div className="absolute top-3 left-3 h-8 w-8 bg-green-500 rounded-full flex items-center justify-center text-white shadow-lg">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* 右侧矩形区域 */}
                    <div className="w-[130px] h-[462px] bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col p-4">
                      {/* 上方：chips展示区（占据大部分空间） */}
                      <div className="flex-1 flex flex-col justify-end space-y-2 mb-4">
                        {result ? (
                          result.chips.map((chip, chipIdx) => (
                            <div
                              key={chipIdx}
                              className="bg-white rounded-xl px-3 py-3 shadow-sm text-sm font-medium text-slate-800 leading-snug text-left"
                            >
                              {chip}
                            </div>
                          ))
                        ) : (
                          <div className="h-full flex items-center justify-center">
                            <div className="text-center text-slate-400 text-sm">
                              <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-30" />
                              点击生成<br/>分析图片
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 下方：生成按钮 */}
                      <div>
                        {!apiKey && !result && (
                          <div className="mb-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 text-center">
                            💡 未配置API Key，将使用模拟数据
                          </div>
                        )}
                        {isAnalyzing ? (
                          <Button
                            disabled
                            className="w-full h-12 rounded-xl bg-slate-300 text-slate-600"
                          >
                            <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                            分析中
                          </Button>
                        ) : (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAnalyze(screenshot.id);
                            }}
                            disabled={isAnalyzing}
                            className={`w-full h-12 rounded-xl font-semibold shadow-md transition-all ${
                              result
                                ? 'bg-white hover:bg-slate-50 text-slate-700 border-2 border-slate-200'
                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
                            }`}
                          >
                            {result ? '重新生成' : '生成'}
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
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t z-40">
          <div className="container mx-auto px-4 py-2">
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

import { Screenshot, ChipResult, PromptTemplate } from '@/types';
import { defaultPrompts } from './prompts';

// 内存存储（Demo阶段）
class DataStore {
  private screenshots: Map<string, Screenshot> = new Map();
  private results: Map<string, ChipResult[]> = new Map();
  private prompts: PromptTemplate[] = [...defaultPrompts];
  private currentPromptId: string = 'default';

  // 截图管理
  addScreenshot(screenshot: Screenshot): void {
    console.log('[DataStore] addScreenshot called, current size:', this.screenshots.size);
    this.screenshots.set(screenshot.id, screenshot);
    console.log('[DataStore] addScreenshot done, new size:', this.screenshots.size);
  }

  getScreenshot(id: string): Screenshot | undefined {
    return this.screenshots.get(id);
  }

  getAllScreenshots(): Screenshot[] {
    console.log('[DataStore] getAllScreenshots called, returning:', this.screenshots.size);
    return Array.from(this.screenshots.values());
  }

  deleteScreenshot(id: string): void {
    this.screenshots.delete(id);
    this.results.delete(id);
  }

  // 结果管理
  addResult(result: ChipResult): void {
    const screenshotId = result.screenshotId;
    if (!this.results.has(screenshotId)) {
      this.results.set(screenshotId, []);
    }
    // 移除同一prompt的旧结果
    const results = this.results.get(screenshotId)!;
    const filtered = results.filter(r => r.promptVersion !== result.promptVersion);
    filtered.push(result);
    this.results.set(screenshotId, filtered);
  }

  getResult(screenshotId: string): ChipResult[] {
    return this.results.get(screenshotId) || [];
  }

  getLatestResult(screenshotId: string): ChipResult | undefined {
    const results = this.results.get(screenshotId);
    if (!results || results.length === 0) return undefined;
    return results[results.length - 1];
  }

  getAllResults(): ChipResult[] {
    const all: ChipResult[] = [];
    this.results.forEach((results) => {
      all.push(...results);
    });
    return all;
  }

  // Prompt管理
  getPrompts(): PromptTemplate[] {
    return [...this.prompts];
  }

  getPrompt(id: string): PromptTemplate | undefined {
    return this.prompts.find(p => p.id === id);
  }

  getCurrentPrompt(): PromptTemplate {
    return this.prompts.find(p => p.id === this.currentPromptId) || this.prompts[0];
  }

  setCurrentPrompt(id: string): void {
    if (this.prompts.find(p => p.id === id)) {
      this.currentPromptId = id;
    }
  }

  addPrompt(prompt: PromptTemplate): void {
    this.prompts.push(prompt);
  }

  updatePrompt(id: string, updates: Partial<PromptTemplate>): void {
    const index = this.prompts.findIndex(p => p.id === id);
    if (index !== -1) {
      this.prompts[index] = { ...this.prompts[index], ...updates };
    }
  }

  deletePrompt(id: string): void {
    const index = this.prompts.findIndex(p => p.id === id);
    if (index !== -1 && !this.prompts[index].isDefault) {
      this.prompts.splice(index, 1);
      if (this.currentPromptId === id) {
        this.currentPromptId = this.prompts[0].id;
      }
    }
  }

  // 清空所有数据
  clear(): void {
    this.screenshots.clear();
    this.results.clear();
  }
}

// 内存存储（Demo阶段）
let globalDataStore: DataStore | undefined;

// 导出单例
export function getDataStore(): DataStore {
  if (!globalDataStore) {
    globalDataStore = new DataStore();
  }
  return globalDataStore;
}

// 默认导出（向后兼容）
export const dataStore = getDataStore();

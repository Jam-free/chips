import { Screenshot, ChipResult, PromptTemplate } from '@/types';
import { defaultPrompts } from './prompts';

class DataStore {
  private screenshots: Map<string, Screenshot> = new Map();
  private results: Map<string, ChipResult[]> = new Map();
  private prompts: PromptTemplate[] = [...defaultPrompts];
  private currentPromptId: string = 'default';

  addScreenshot(screenshot: Screenshot): void {
    this.screenshots.set(screenshot.id, screenshot);
  }

  getScreenshot(id: string): Screenshot | undefined {
    return this.screenshots.get(id);
  }

  getAllScreenshots(): Screenshot[] {
    return Array.from(this.screenshots.values());
  }

  deleteScreenshot(id: string): void {
    this.screenshots.delete(id);
    this.results.delete(id);
  }

  addResult(result: ChipResult): void {
    const sid = result.screenshotId;
    if (!this.results.has(sid)) {
      this.results.set(sid, []);
    }
    const arr = this.results.get(sid)!;
    const filtered = arr.filter(r => r.promptVersion !== result.promptVersion);
    filtered.push(result);
    this.results.set(sid, filtered);
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
    this.results.forEach(r => all.push(...r));
    return all;
  }

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

  clear(): void {
    this.screenshots.clear();
    this.results.clear();
  }
}

// 挂到 globalThis 上，使 Next.js 热更新时不丢失数据
const g = globalThis as unknown as { __chipDataStore?: DataStore };
if (!g.__chipDataStore) {
  g.__chipDataStore = new DataStore();
}
export const dataStore: DataStore = g.__chipDataStore;

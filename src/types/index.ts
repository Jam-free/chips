// 截图数据
export interface Screenshot {
  id: string;
  filename: string;
  uploadedAt: Date;
  imagePath: string;
  imageHash?: string;
}

// 话题生成结果
export interface ChipResult {
  screenshotId: string;
  promptVersion: string;
  promptName: string;
  generatedAt: Date;
  screenUnderstanding: string;
  chips: string[];
}

// Prompt模板
export interface PromptTemplate {
  id: string;
  name: string;
  version: string;
  content: string;
  createdAt: Date;
  isDefault: boolean;
  type?: 'chips' | 'inner-os'; // Prompt类型
}

// 内心OS结果
export interface InnerOSResult {
  screenshotId: string;
  promptVersion: string;
  promptName: string;
  generatedAt: Date;
  innerOS: string;
}

// 导出数据
export interface ExportData {
  screenshots: Screenshot[];
  results: ChipResult[];
  exportTime: Date;
}

// API响应类型
export interface AnalyzeResponse {
  success: boolean;
  data?: ChipResult;
  error?: string;
}

export interface InnerOSResponse {
  success: boolean;
  data?: InnerOSResult;
  error?: string;
}

export interface UploadResponse {
  success: boolean;
  screenshot?: Screenshot;
  error?: string;
}

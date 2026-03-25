# 🎯 屏幕话题Chips生成器 - Web Demo

## 项目简介

这是一个用于验证产品想法的Demo应用：**基于手机屏幕截图，生成用户可能想问AI的问题chips**。

### 核心功能

- ✅ **扫码上传**：手机扫码批量上传截图
- ✅ **左右布局**：左侧截图列表，右侧生成结果
- ✅ **Prompt管理**：编辑/新增/切换Prompt模板
- ✅ **批量生成**：一键生成所有截图的话题
- ✅ **数据导出**：导出Excel用于测试统计

### 技术栈

- **Frontend**: Next.js 14 + React 18 + TypeScript
- **UI**: Tailwind CSS + shadcn/ui
- **API**: Next.js API Routes
- **VLM**: GLM-4V / MiniMax VL（可选）
- **部署**: Vercel

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量（可选）

复制 `.env.local.example` 为 `.env.local`：

```bash
cp .env.local.example .env.local
```

编辑 `.env.local`，添加你的API密钥：

```env
GLM_API_KEY=your_glm_api_key
MINIMAX_API_KEY=your_minimax_api_key
```

> **注意**：如果不配置API密钥，系统将使用模拟数据。

### 3. 运行开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看应用。

---

## 使用指南

### 上传截图

1. **方式一**：点击上传区域，选择本地图片
2. **方式二**：拖拽图片到上传区域（待实现）
3. **批量上传**：一次可选择多张图片

### 生成话题

1. 从左侧列表选择一张截图
2. 点击右侧"生成话题"按钮
3. 等待VLM分析（约2-5秒）
4. 查看生成的话题chips

### Prompt管理

1. 点击右上角"Prompt管理"按钮
2. 编辑现有Prompt或创建新Prompt
3. 保存后，使用Prompt切换器切换
4. 切换Prompt后，可重新生成所有截图

### 导出数据

1. 点击右上角"导出Excel"按钮
2. 选择导出范围（全部/当前Prompt）
3. 自动下载Excel文件

---

## 项目结构

```
chips/
├── src/
│   ├── app/
│   │   ├── api/              # API路由
│   │   │   ├── upload/       # 文件上传
│   │   │   ├── analyze/      # VLM分析
│   │   │   ├── prompts/      # Prompt管理
│   │   │   └── export/       # 数据导出
│   │   ├── layout.tsx        # 根布局
│   │   ├── page.tsx          # 主页面
│   │   └── globals.css       # 全局样式
│   ├── components/
│   │   └── ui/               # shadcn/ui组件
│   ├── lib/
│   │   ├── store.ts          # 数据存储
│   │   ├── prompts.ts        # Prompt模板
│   │   └── utils.ts          # 工具函数
│   └── types/
│       └── index.ts          # 类型定义
├── public/
│   └── uploads/              # 上传的图片
└── package.json
```

---

## API文档

### POST /api/upload

上传截图文件

**请求**：
- Method: POST
- Body: FormData (file: File)

**响应**：
```json
{
  "success": true,
  "screenshot": {
    "id": "uuid",
    "filename": "screenshot.png",
    "uploadedAt": "2026-03-24T10:00:00Z",
    "imagePath": "/uploads/xxx.png"
  }
}
```

### POST /api/analyze

分析屏幕并生成话题

**请求**：
- Method: POST
- Body: JSON
```json
{
  "screenshotId": "uuid",
  "apiKey": "optional_api_key",
  "provider": "glm|minimax"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "screenshotId": "uuid",
    "promptVersion": "v1.0",
    "promptName": "通用版",
    "generatedAt": "2026-03-24T10:01:00Z",
    "screenUnderstanding": "用户正在浏览APP界面",
    "chips": ["问题1", "问题2"]
  }
}
```

### GET /api/prompts

获取所有Prompt模板

**响应**：
```json
{
  "success": true,
  "prompts": [...],
  "currentPromptId": "default"
}
```

### GET /api/export

导出Excel数据

**参数**：
- `promptVersion` (可选): 只导出指定Prompt版本的结果

**响应**：Excel文件下载

---

## 部署到Vercel

1. 推送代码到GitHub
2. 在Vercel导入项目
3. 配置环境变量（在Vercel Dashboard）
4. 部署完成

---

## 开发计划

### ✅ 已完成（P0）

- [x] 单图上传
- [x] 左右布局展示
- [x] 话题生成（模拟数据）
- [x] Prompt管理（查看/编辑）
- [x] 数据导出Excel

### 🚧 进行中（P1）

- [ ] 二维码上传（手机扫码）
- [ ] Prompt切换后重新生成
- [ ] 批量上传优化
- [ ] 实时API调用（GLM-4V/MiniMax）

### 📋 计划中（P2）

- [ ] 视频截图去重
- [ ] 用户评分功能
- [ ] 历史记录持久化
- [ ] 性能优化

---

## 常见问题

### Q: 上传的图片存储在哪里？

A: Demo阶段存储在 `public/uploads/` 目录，刷新后会保留。生产环境建议使用云存储（OSS/S3）。

### Q: 如何使用真实的VLM API？

A: 在 `.env.local` 中配置API密钥，选择provider（GLM或MiniMax）即可。

### Q: 可以切换Prompt后重新生成吗？

A: 可以。切换Prompt后，系统会清空已有结果，点击"生成话题"会使用新Prompt重新分析。

---

## 联系方式

- 项目地址：[GitHub]
- 问题反馈：[Issues]

---

## License

MIT

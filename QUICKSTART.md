# 快速启动指南

## 1. 安装依赖

```bash
cd chips
npm install
```

## 2. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

## 3. 核心功能测试

### 上传截图
- 点击"手机扫码上传"查看二维码
- 或直接"点击选择文件"上传本地图片

### 生成话题
1. 从左侧列表选择一张截图
2. 点击右侧"生成话题"按钮
3. 等待分析完成（约2-5秒）
4. 查看生成的话题chips

### Prompt管理
1. 点击"Prompt管理"按钮
2. 编辑或新增Prompt
3. 切换Prompt后重新生成

### 导出数据
- 点击"导出Excel"下载测试数据

## 4. API配置（可选）

配置真实VLM API：

创建 `.env.local` 文件：
```env
GLM_API_KEY=your_key_here
```

或MiniMax：
```env
MINIMAX_API_KEY=your_key_here
```

## 5. 移动端上传

访问 http://localhost:3000/mobile 使用手机端上传页面

## 常见问题

**Q: 上传失败？**
A: 检查图片格式（支持PNG/JPG/JPEG），大小不超过5MB

**Q: 生成速度慢？**
A: Demo阶段使用模拟数据，约2-5秒。配置真实API后会更快。

**Q: 如何切换Prompt？**
A: 使用顶部的Prompt切换器，切换后需重新生成。

## 下一步

- 邀请朋友测试，收集反馈
- 导出数据分析话题质量
- 根据反馈优化Prompt
- 准备部署到Vercel

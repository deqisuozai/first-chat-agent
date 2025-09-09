# 🤖 聊天代理启动套件

![agents-header](https://github.com/user-attachments/assets/f6d99eeb-1803-4495-9c5e-3cf07a37b402)

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/agents-starter"><img src="https://deploy.workers.cloudflare.com/button" alt="部署到 Cloudflare"/></a>

这是一个使用 Cloudflare Agents 平台构建 AI 驱动的聊天代理的启动模板，基于 [`agents`](https://www.npmjs.com/package/agents) 包。该项目为创建与 AI 的交互式聊天体验提供了基础，包含现代化的 UI 和工具集成功能。

## 功能特性

- 💬 与 AI 的交互式聊天界面
- 🛠️ 内置工具系统，支持人机交互确认
- 📅 高级任务调度（一次性、延迟和通过 cron 的重复任务）
- 🌓 深色/浅色主题支持
- ⚡️ 实时流式响应
- 🔄 状态管理和聊天历史
- 🎨 现代化、响应式 UI

## 前置要求

- Cloudflare 账户
- DeepSeek API 密钥（通过 AI Gateway）

## 快速开始

1. 创建新项目：

```bash
npx create-cloudflare@latest --template cloudflare/agents-starter
```

2. 安装依赖：

```bash
npm install
```

3. 设置环境变量：

创建 `.dev.vars` 文件：

```env
DEEPSEEK_TOKEN=your_deepseek_token
AI_GATEWAY_ACCOUNT_ID=your_account_id
AI_GATEWAY_ID=your_gateway_id
```

4. 本地运行：

```bash
npm start
```

5. 部署：

```bash
npm run deploy
```

## 项目结构

```
├── src/
│   ├── app.tsx        # 聊天 UI 实现
│   ├── server.ts      # 聊天代理逻辑
│   ├── tools.ts       # 工具定义
│   ├── utils.ts       # 辅助函数
│   ├── shared.ts      # 共享常量
│   ├── client.tsx     # 客户端入口
│   └── styles.css     # UI 样式
```

## 自定义指南

### 添加新工具

在 `tools.ts` 中使用工具构建器添加新工具：

```ts
// 需要确认的工具示例
const searchDatabase = tool({
  description: "在数据库中搜索用户记录",
  parameters: z.object({
    query: z.string(),
    limit: z.number().optional()
  })
  // 没有 execute 函数 = 需要确认
});

// 自动执行工具示例
const getCurrentTime = tool({
  description: "获取当前服务器时间",
  parameters: z.object({}),
  execute: async () => new Date().toISOString()
});

// 任务调度工具实现
const scheduleTask = tool({
  description:
    "安排任务在稍后执行。'when' 可以是日期、延迟秒数或 cron 模式。",
  parameters: z.object({
    type: z.enum(["scheduled", "delayed", "cron"]),
    when: z.union([z.number(), z.string()]),
    payload: z.string()
  }),
  execute: async ({ type, when, payload }) => {
    // ... 查看 tools.ts 中的实现
  }
});
```

要处理工具确认，请在 `executions` 对象中添加执行函数：

```typescript
export const executions = {
  searchDatabase: async ({
    query,
    limit
  }: {
    query: string;
    limit?: number;
  }) => {
    // 工具确认时的实现
    const results = await db.search(query, limit);
    return results;
  }
  // 为其他需要确认的工具添加更多执行处理器
};
```

工具可以通过两种方式配置：

1. 带有 `execute` 函数用于自动执行
2. 没有 `execute` 函数，需要确认并使用 `executions` 对象处理确认的操作。注意：`executions` 中的键应与 `app.tsx` 中的 `toolsRequiringConfirmation` 匹配。

### 使用不同的 AI 模型提供商

初始的 [`server.ts`](https://github.com/cloudflare/agents-starter/blob/main/src/server.ts) 实现使用 [`ai-sdk`](https://sdk.vercel.ai/docs/introduction) 和 [OpenAI 提供商](https://sdk.vercel.ai/providers/ai-sdk-providers/openai)，但您可以通过以下方式使用任何 AI 模型提供商：

1. 为 `ai-sdk` 安装替代 AI 提供商，如 [`workers-ai-provider`](https://sdk.vercel.ai/providers/community-providers/cloudflare-workers-ai) 或 [`anthropic`](https://sdk.vercel.ai/providers/ai-sdk-providers/anthropic) 提供商：
2. 用 [OpenAI SDK](https://github.com/openai/openai-node) 替换 AI SDK
3. 直接使用 Cloudflare [Workers AI + AI Gateway](https://developers.cloudflare.com/ai-gateway/providers/workersai/#workers-binding) 绑定 API

例如，要使用 [`workers-ai-provider`](https://sdk.vercel.ai/providers/community-providers/cloudflare-workers-ai)，请安装包：

```sh
npm install workers-ai-provider
```

在 `wrangler.jsonc` 中添加 `ai` 绑定：

```jsonc
// 文件其余部分
  "ai": {
    "binding": "AI"
  }
// 文件其余部分
```

将 `@ai-sdk/openai` 导入和使用替换为 `workers-ai-provider`：

```diff
// server.ts
// 更改导入
- import { openai } from "@ai-sdk/openai";
+ import { createWorkersAI } from 'workers-ai-provider';

// 创建 Workers AI 实例
+ const workersai = createWorkersAI({ binding: env.AI });

// 在调用 streamText 方法（或其他方法）时使用它
// 来自 ai-sdk
- const model = openai("gpt-4o-2024-11-20");
+ const model = workersai("@cf/deepseek-ai/deepseek-r1-distill-qwen-32b")
```

提交您的更改，然后按照此 README 的其余部分运行 `agents-starter`。

### 修改 UI

聊天界面使用 React 构建，可以在 `app.tsx` 中自定义：

- 在 `styles.css` 中修改主题颜色
- 在聊天容器中添加新的 UI 组件
- 自定义消息渲染和工具确认对话框
- 在标题中添加新控件

### 示例用例

1. **客户支持代理**
   - 添加工具用于：
     - 工单创建/查找
     - 订单状态检查
     - 产品推荐
     - FAQ 数据库搜索

2. **开发助手**
   - 集成工具用于：
     - 代码检查
     - Git 操作
     - 文档搜索
     - 依赖检查

3. **数据分析助手**
   - 构建工具用于：
     - 数据库查询
     - 数据可视化
     - 统计分析
     - 报告生成

4. **个人生产力助手**
   - 实现工具用于：
     - 具有灵活时间选项的任务调度
     - 一次性、延迟和重复任务管理
     - 带提醒的任务跟踪
     - 邮件起草
     - 笔记记录

5. **调度助手**
   - 构建工具用于：
     - 使用特定日期的一次性事件调度
     - 延迟任务执行（例如，"30 分钟后提醒我"）
     - 使用 cron 模式的重复任务
     - 任务负载管理
     - 灵活的调度模式

每个用例可以通过以下方式实现：

1. 在 `tools.ts` 中添加相关工具
2. 为特定交互自定义 UI
3. 在 `server.ts` 中扩展代理功能
4. 添加任何必要的外部 API 集成

## 技术架构

### 核心组件

- **Cloudflare Workers**: 无服务器运行时环境
- **Cloudflare Agents**: AI 代理框架
- **AI Gateway**: 通过 Cloudflare 管理 AI 模型访问
- **DeepSeek**: AI 模型提供商
- **React**: 前端 UI 框架
- **TypeScript**: 类型安全的开发体验

### 数据流

1. 用户在前端输入消息
2. 消息通过 WebSocket 发送到 Cloudflare Worker
3. Worker 调用 AI Gateway 中的 DeepSeek 模型
4. AI 响应通过数据流实时传输回前端
5. 前端渲染 AI 回复和工具调用结果

### 工具系统

项目支持两种类型的工具：

1. **自动执行工具**: 直接执行，无需用户确认
2. **需要确认的工具**: 执行前需要用户手动确认

## 了解更多

- [`agents`](https://github.com/cloudflare/agents/blob/main/packages/agents/README.md)
- [Cloudflare Agents 文档](https://developers.cloudflare.com/agents/)
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [AI Gateway 文档](https://developers.cloudflare.com/ai-gateway/)

## 许可证

MIT

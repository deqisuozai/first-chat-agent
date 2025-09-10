# AI 聊天功能迁移指南

## 📋 迁移概述

本指南详细说明如何将当前 AI 聊天项目的核心功能迁移到已有 Room 管理系统的 Cloudflare 项目中。

## 🎯 迁移目标

- 将 AI 聊天功能集成到现有 Room 系统
- 每个 Room 拥有独立的 AI 聊天实例
- 保持现有 Room 管理功能不变
- 实现流式 AI 对话体验

## 📦 第一步：迁移文件清单

### 核心文件
```

需要迁移的文件：
src/
├── server.ts          # AI 聊天代理核心逻辑 ⭐
├── tools.ts           # 工具定义 ⭐
├── utils.ts           # 工具处理函数 ⭐
├── shared.ts          # 共享常量 ⭐
├── app.tsx            # 前端聊天界面 ⭐
└── client.tsx         # 客户端入口

配置文件：
├── package.json       # 依赖包配置
├── wrangler.jsonc     # Cloudflare 配置（部分）
├── .dev.vars          # 环境变量（部分）
└── worker-configuration.d.ts  # 类型定义（部分）
```

### 关键依赖包
```json
{
  "dependencies": {
    "@ai-sdk/openai": "^1.3.23",
    "@ai-sdk/react": "^1.2.12", 
    "@ai-sdk/ui-utils": "^1.2.11",
    "agents": "^0.0.113",
    "ai": "^4.3.19",
    "openai": "^5.15.0",
    "@phosphor-icons/react": "^2.1.10",
    "@radix-ui/react-avatar": "^1.1.10",
    "@radix-ui/react-dropdown-menu": "^2.1.15",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-switch": "^1.2.5",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "marked": "^16.1.2",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "tailwind-merge": "^3.3.1",
    "zod": "^3.25.76"
  }
}
```

## 🔧 第二步：文件迁移操作

### 方案A：完整迁移（推荐）
```bash
# 1. 备份目标项目
cp -r /target-project /target-project-backup

# 2. 创建聊天功能目录
mkdir -p /target-project/src/chat
mkdir -p /target-project/src/components/chat

# 3. 复制核心文件
cp src/server.ts /target-project/src/chat/
cp src/tools.ts /target-project/src/chat/
cp src/utils.ts /target-project/src/chat/
cp src/shared.ts /target-project/src/chat/

# 4. 复制前端组件
cp src/app.tsx /target-project/src/components/chat/
cp src/client.tsx /target-project/src/components/chat/

# 5. 复制样式和配置
cp src/styles.css /target-project/src/components/chat/
cp worker-configuration.d.ts /target-project/ # 需要合并
```

### 方案B：选择性迁移
```bash
# 只迁移服务器端核心功能
cp src/server.ts /target-project/src/chat/chat-agent.ts
cp src/tools.ts /target-project/src/chat/
cp src/utils.ts /target-project/src/chat/
cp src/shared.ts /target-project/src/chat/
```

## 🏗️ 第三步：代码适配

### 1. 创建 Room 聊天代理

创建 `/target-project/src/chat/room-chat-agent.ts`：

```typescript
/**
 * Room 聊天代理 - 集成到 Room 系统的 AI 聊天功能
 */
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  createDataStreamResponse,
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { formatDataStreamPart } from "@ai-sdk/ui-utils";
import { unstable_getSchedulePrompt } from "agents/schedule";

import { processToolCalls } from "./utils";
import { tools, executions } from "./tools";

export class RoomChatAgent extends AIChatAgent<Env> {
  private roomId: string;
  private openaiClient: any = null;

  /**
   * 从请求中提取 Room ID
   */
  private extractRoomId(): string {
    // 从 DO 实例名称中提取 room ID
    // 格式: "room-chat-{roomId}"
    const name = this.ctx.id.name;
    return name?.replace('room-chat-', '') || 'default';
  }

  /**
   * 初始化 AI SDK OpenAI 客户端
   */
  private async initOpenAIClient() {
    if (!this.openaiClient) {
      const env = this.env as any;
      
      this.openaiClient = createOpenAI({
        apiKey: env.DEEPSEEK_TOKEN,
        baseURL: `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/deepseek`
      });
    }
    return this.openaiClient;
  }

  /**
   * 获取 Room 上下文信息
   */
  private async getRoomContext() {
    this.roomId = this.extractRoomId();
    
    // 这里可以调用现有的 Room API 获取房间信息
    // const roomInfo = await this.getRoomInfo(this.roomId);
    
    return {
      roomId: this.roomId,
      // members: roomInfo?.members || [],
      // roomName: roomInfo?.name || 'Unknown Room',
      // roomSettings: roomInfo?.settings || {}
    };
  }

  /**
   * 处理聊天消息 - 添加 Room 上下文
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    const allTools = {
      ...tools,
      ...this.mcp.unstable_getAITools()
    };

    const dataStreamResponse = createDataStreamResponse({
      execute: async (dataStream) => {
        // 处理工具调用
        const processedMessages = await processToolCalls({
          messages: this.messages,
          dataStream,
          tools: allTools,
          executions
        });

        // 获取 Room 上下文
        const roomContext = await this.getRoomContext();

        // 初始化 AI 客户端
        const openai = await this.initOpenAIClient();

        // 构建包含 Room 信息的系统提示
        const systemPrompt = `You are a helpful AI assistant in Room ${roomContext.roomId}. 

${unstable_getSchedulePrompt({ date: new Date() })}

Room Context:
- Room ID: ${roomContext.roomId}
- You are assisting users in this specific room
- If users ask to schedule tasks, use the schedule tool

Provide helpful, contextual responses based on the room setting.`;

        // 使用 AI SDK 的 streamText 方法
        const stream = streamText({
          model: openai("deepseek-chat"),
          system: systemPrompt,
          messages: processedMessages.map(msg => ({
            role: msg.role as "user" | "assistant" | "system",
            content: msg.content
          })),
          tools: allTools,
          maxSteps: 5,
          onFinish: (result) => {
            console.log("Room chat stream completed:", result);
            onFinish(result as any);
          },
        });

        // 流式传输结果
        for await (const chunk of stream.textStream) {
          dataStream.write(
            formatDataStreamPart("text", chunk)
          );
        }
      }
    });

    return dataStreamResponse;
  }

  /**
   * 执行定时任务
   */
  async executeTask(description: string, _task: any) {
    const roomContext = await this.getRoomContext();
    
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        content: `[Room ${roomContext.roomId}] Running scheduled task: ${description}`,
        createdAt: new Date()
      }
    ]);
  }
}
```

### 2. 路由集成

修改 `/target-project/src/index.ts` 或主路由文件：

```typescript
import { RoomChatAgent } from './chat/room-chat-agent';

export { RoomChatAgent };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    
    // Room 聊天 API 路由
    if (url.pathname.startsWith('/api/rooms/') && url.pathname.includes('/chat')) {
      const pathParts = url.pathname.split('/');
      const roomId = pathParts[3]; // /api/rooms/{roomId}/chat
      
      if (!roomId) {
        return new Response('Room ID required', { status: 400 });
      }

      // 验证 Room 访问权限（使用现有的验证逻辑）
      // const hasAccess = await validateRoomAccess(roomId, request, env);
      // if (!hasAccess) {
      //   return new Response('Unauthorized', { status: 401 });
      // }

      // 创建或获取该 Room 的聊天实例
      const durableObjectId = env.ROOM_CHAT.idFromName(`room-chat-${roomId}`);
      const chatAgent = env.ROOM_CHAT.get(durableObjectId);
      
      return chatAgent.fetch(request);
    }

    // 现有的其他路由...
    return routeAgentRequest(request, env) || 
           new Response('Not found', { status: 404 });
  }
} satisfies ExportedHandler<Env>;
```

## ⚙️ 第四步：配置文件合并

### 1. wrangler.jsonc 配置合并

```jsonc
{
  "name": "your-target-project-name",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-27",
  "compatibility_flags": ["nodejs_compat"],
  
  // 合并 Durable Objects 配置
  "durable_objects": {
    "bindings": [
      // 现有的 Room 管理 DO
      {
        "name": "ROOM",
        "class_name": "Room",
        "script_name": "your-target-project-name"
      },
      // 新增的 Room 聊天 DO
      {
        "name": "ROOM_CHAT", 
        "class_name": "RoomChatAgent",
        "script_name": "your-target-project-name"
      }
    ]
  },
  
  // 合并环境变量
  "vars": {
    "AI_GATEWAY_ACCOUNT_ID": "your_account_id",
    "AI_GATEWAY_ID": "your_gateway_id"
  },
  
  // 合并数据库迁移配置
  "migrations": [
    // 现有迁移...
    {
      "tag": "v1", 
      "new_sqlite_classes": ["Room"]
    },
    // 新增聊天功能迁移
    {
      "tag": "v2",
      "new_sqlite_classes": ["RoomChatAgent"]
    }
  ],

  "observability": {
    "enabled": true
  }
}
```

### 2. 环境变量配置

`.dev.vars` 文件合并：
```env
# 现有环境变量...
ROOM_SECRET=your_existing_secret

# 新增 AI 聊天相关环境变量
DEEPSEEK_TOKEN=your_deepseek_token
AI_GATEWAY_ACCOUNT_ID=your_account_id
AI_GATEWAY_ID=your_gateway_id
```

### 3. TypeScript 类型定义

更新 `worker-configuration.d.ts`：

```typescript
interface Env {
  // 现有绑定...
  ROOM: DurableObjectNamespace;
  
  // 新增聊天绑定
  ROOM_CHAT: DurableObjectNamespace;
  
  // 现有环境变量...
  ROOM_SECRET: string;
  
  // 新增 AI 相关环境变量
  DEEPSEEK_TOKEN: string;
  AI_GATEWAY_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;
}
```

## 📱 第五步：前端组件集成

### 1. 创建 Room 聊天组件

创建 `/target-project/src/components/RoomChat.tsx`：

```typescript
import React from 'react';
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";

interface RoomChatProps {
  roomId: string;
  className?: string;
}

export function RoomChat({ roomId, className }: RoomChatProps) {
  // 使用 Room 特定的 Agent
  const agent = useAgent({
    agent: "room-chat", // 对应 RoomChatAgent
    // 可以传递 Room 相关的初始化参数
    initialState: { roomId }
  });

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    clearHistory
  } = useAgentChat({
    agent,
    maxSteps: 5,
    // Room 特定的 API 端点
    api: `/api/rooms/${roomId}/chat`
  });

  return (
    <div className={`room-chat-container ${className || ''}`}>
      <div className="chat-header">
        <h3>Room {roomId} - AI Assistant</h3>
        <button onClick={clearHistory} className="clear-btn">
          Clear History
        </button>
      </div>
      
      <div className="chat-messages">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="message-content">
              {message.content}
            </div>
            <div className="message-time">
              {new Date(message.createdAt).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="chat-input-form">
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          placeholder={`Send a message to Room ${roomId}...`}
          disabled={isLoading}
          className="chat-input"
        />
        <button 
          type="submit" 
          disabled={isLoading || !input.trim()}
          className="send-button"
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
        {isLoading && (
          <button type="button" onClick={stop} className="stop-button">
            Stop
          </button>
        )}
      </form>
    </div>
  );
}
```

### 2. 在现有 Room 页面中集成

```typescript
// 在现有的 Room 组件中添加聊天功能
import { RoomChat } from '../components/RoomChat';

export function RoomPage({ roomId }: { roomId: string }) {
  return (
    <div className="room-page">
      {/* 现有的 Room 管理功能 */}
      <div className="room-info">
        {/* Room 信息、成员列表等 */}
      </div>
      
      {/* 新增的 AI 聊天功能 */}
      <div className="room-chat-section">
        <RoomChat roomId={roomId} className="room-chat" />
      </div>
    </div>
  );
}
```

## 🔧 第六步：依赖安装和配置

```bash
# 1. 进入目标项目目录
cd /target-project

# 2. 安装新的依赖包
npm install @ai-sdk/openai @ai-sdk/react @ai-sdk/ui-utils agents ai openai

# 3. 安装 UI 相关依赖（如果需要）
npm install @phosphor-icons/react @radix-ui/react-avatar @radix-ui/react-dropdown-menu @radix-ui/react-slot @radix-ui/react-switch class-variance-authority clsx marked react-markdown remark-gfm tailwind-merge zod

# 4. 更新 TypeScript 类型
npm run types

# 5. 检查代码格式和类型
npm run check

# 6. 本地测试
npm start
```

## 🧪 第七步：测试和验证

### 1. 本地测试清单

- [ ] Room 列表页面正常显示
- [ ] Room 详情页面正常显示
- [ ] Room 聊天组件正常渲染
- [ ] AI 聊天功能正常工作
- [ ] 流式响应正常显示
- [ ] 工具调用功能正常
- [ ] Room 权限验证正常

### 2. API 测试

```bash
# 测试 Room 聊天 API
curl -X POST "http://localhost:8787/api/rooms/test-room/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello AI!"}'

# 测试健康检查
curl "http://localhost:8787/check-open-ai-key"
```

### 3. WebSocket 测试

```javascript
// 浏览器控制台测试
const ws = new WebSocket('ws://localhost:8787/api/rooms/test-room/chat/ws');
ws.onopen = () => console.log('Connected');
ws.onmessage = (event) => console.log('Message:', event.data);
ws.send(JSON.stringify({ message: 'Hello from WebSocket!' }));
```

## 🚀 第八步：部署

```bash
# 1. 设置生产环境变量
wrangler secret put DEEPSEEK_TOKEN
wrangler secret put AI_GATEWAY_ACCOUNT_ID  
wrangler secret put AI_GATEWAY_ID

# 2. 部署到 Cloudflare
npm run deploy

# 3. 验证部署
curl "https://your-project.your-subdomain.workers.dev/check-open-ai-key"
```

## 📊 第九步：监控和优化

### 1. 监控设置

- 在 Cloudflare Dashboard 中监控 Durable Objects 使用情况
- 设置告警规则监控 API 错误率
- 监控 AI Gateway 的请求量和延迟

### 2. 性能优化

```typescript
// 添加缓存机制
class RoomChatAgent extends AIChatAgent<Env> {
  private roomInfoCache: Map<string, any> = new Map();
  private cacheExpiry: number = 5 * 60 * 1000; // 5分钟

  private async getCachedRoomInfo(roomId: string) {
    const cached = this.roomInfoCache.get(roomId);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }
    
    // 获取新数据并缓存
    const roomInfo = await this.fetchRoomInfo(roomId);
    this.roomInfoCache.set(roomId, {
      data: roomInfo,
      timestamp: Date.now()
    });
    
    return roomInfo;
  }
}
```

## ⚠️ 注意事项和最佳实践

### 安全考虑
- 确保 Room 访问权限验证正常工作
- 验证用户只能访问有权限的 Room 聊天
- 保护 AI Gateway 密钥不被泄露

### 性能考虑
- 监控 Durable Objects 的内存使用
- 考虑实现聊天历史的定期清理
- 优化大量并发 Room 的性能

### 用户体验
- 提供清晰的加载状态指示
- 实现消息发送失败的重试机制
- 考虑添加消息历史的分页功能

### 维护性
- 保持代码结构清晰，便于后续维护
- 添加充分的日志记录
- 实现适当的错误处理和恢复机制

## 🎉 迁移完成

完成以上步骤后，您的 Room 管理系统将成功集成 AI 聊天功能：

- ✅ 每个 Room 拥有独立的 AI 聊天实例
- ✅ 支持流式 AI 对话体验
- ✅ 集成工具调用和任务调度功能
- ✅ 保持现有 Room 管理功能不变
- ✅ 提供完整的类型安全支持

现在用户可以在任何 Room 中与 AI 助手进行实时对话，AI 会根据 Room 上下文提供相关的帮助和服务！

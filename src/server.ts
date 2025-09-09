/**
 * Cloudflare Workers 服务器端代码
 * 这是整个 AI 聊天代理的核心后端逻辑
 */

// 导入 Cloudflare Agents 框架的核心功能
import { routeAgentRequest, type Schedule } from "agents";

// 导入任务调度相关的功能
import { unstable_getSchedulePrompt } from "agents/schedule";

// 导入 AI 聊天代理基类和相关类型
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  createDataStreamResponse,
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet
} from "ai";

// AI SDK 的 OpenAI 提供商已在下面导入

// 导入项目内部工具和工具函数
import { processToolCalls } from "./utils";
import { tools, executions } from "./tools";
import { createOpenAI } from "@ai-sdk/openai";
import { formatDataStreamPart } from "@ai-sdk/ui-utils";
// import { env } from "cloudflare:workers";

// 注释掉的全局模型变量，现在直接在 Chat 类中初始化
// let model: any;
// const openai = createOpenAI({
//   apiKey: env.OPENAI_API_KEY,
//   baseURL: env.GATEWAY_BASE_URL,
// });

/**
 * Chat 类 - AI 聊天代理的核心实现
 * 
 * 这个类继承自 AIChatAgent，负责处理实时的 AI 聊天交互
 * 主要功能包括：
 * 1. 接收用户消息
 * 2. 调用 AI 模型生成回复
 * 3. 处理工具调用
 * 4. 管理对话状态
 */
export class Chat extends AIChatAgent<Env> {
  // 私有属性：存储 AI SDK OpenAI 客户端实例
  private openaiClient: any = null;

  /**
   * 初始化 AI SDK OpenAI 客户端
   * 
   * 这个方法负责创建和配置 AI SDK 的 OpenAI 客户端，连接到 Cloudflare AI Gateway
   * 使用 DeepSeek 模型作为 AI 提供商
   * 
   * @returns 配置好的 AI SDK OpenAI 客户端实例
   */
  private async initOpenAIClient() {
    if (!this.openaiClient) {
      // 从环境变量获取配置信息
      const env = this.env as any;
      
      // 创建 AI SDK 的 OpenAI 客户端实例，配置 AI Gateway 作为基础 URL
      this.openaiClient = createOpenAI({
        apiKey: env.DEEPSEEK_TOKEN,  // DeepSeek API 密钥
        baseURL: `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/deepseek`
      });
    }
    return this.openaiClient;
  }

  /**
   * 处理聊天消息的核心方法
   * 
   * 这是整个聊天系统的核心，负责：
   * 1. 接收用户发送的消息
   * 2. 处理工具调用（如果需要）
   * 3. 调用 AI 模型生成回复
   * 4. 将回复流式传输给前端
   * 
   * @param onFinish - 流式传输完成时的回调函数
   * @param _options - 可选的配置选项，如中断信号
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // 注释掉的 MCP 连接代码
    // MCP (Model Context Protocol) 是一个用于连接外部服务的协议
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // 收集所有可用的工具
    // 包括项目中定义的工具和 MCP 工具
    const allTools = {
      ...tools,  // 从 tools.ts 导入的工具
      ...this.mcp.unstable_getAITools()  // MCP 提供的 AI 工具
    };

    // 创建流式响应处理器
    // 这个处理器负责处理文本输出和工具调用输出
    const dataStreamResponse = createDataStreamResponse({
      execute: async (dataStream) => {
        // 处理来自之前消息的待处理工具调用
        // 这处理需要人工确认的工具调用（人机交互循环）
        const processedMessages = await processToolCalls({
          messages: this.messages,  // 当前对话中的所有消息
          dataStream,               // 数据流写入器
          tools: allTools,          // 所有可用工具
          executions               // 工具执行函数
        });

        // 初始化 AI SDK OpenAI 客户端
        const openai = await this.initOpenAIClient();

        // 使用 AI SDK 的 streamText 方法实现流式传输
        // 这是官方推荐的标准实现方式
        const stream = streamText({
          model: openai("deepseek-chat"),  // 使用 DeepSeek 聊天模型
          system: `You are a helpful assistant that can do various tasks... 

${unstable_getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.`,
          messages: processedMessages.map(msg => ({
            role: msg.role as "user" | "assistant" | "system",
            content: msg.content
          })),
          tools: allTools,  // 提供工具给 AI 使用
          maxSteps: 5,      // 最大执行步数，防止无限循环
          onFinish: (result) => {
            // 处理完成回调
            console.log("Stream completed:", result);
            onFinish(result as any);
          },
        });

        // 将 streamText 的结果写入数据流
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
   * 执行定时任务的方法
   * 
   * 当系统需要执行预定的任务时，会调用这个方法
   * 它会将任务执行信息添加到对话历史中
   * 
   * @param description - 任务描述
   * @param _task - 任务调度信息（未使用）
   */
  async executeTask(description: string, _task: Schedule<string>) {
    // 将任务执行信息保存到消息历史中
    await this.saveMessages([
      ...this.messages,  // 保留现有消息
      {
        id: generateId(),  // 生成唯一 ID
        role: "user",      // 消息角色
        content: `Running scheduled task: ${description}`,  // 任务执行信息
        createdAt: new Date()  // 创建时间
      }
    ]);
  }
}

/**
 * Cloudflare Worker 的入口点
 * 
 * 这是整个应用的 HTTP 请求处理器
 * 负责：
 * 1. 初始化 AI 模型
 * 2. 处理健康检查请求
 * 3. 将请求路由到适当的处理器
 */
export default {
  /**
   * 处理所有传入的 HTTP 请求
   * 
   * @param request - 传入的 HTTP 请求
   * @param env - 环境变量（包含 API 密钥等配置）
   * @param _ctx - 执行上下文（未使用）
   * @returns HTTP 响应
   */
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    // AI 模型现在直接在 Chat 类中初始化
    // 不再需要全局模型实例

    // 健康检查端点
    // 前端会调用这个端点来检查 AI Gateway 配置是否正确
    if (url.pathname === "/check-open-ai-key") {
      // 检查所有必需的环境变量是否已设置
      const hasAIGateway = !!(
        env.DEEPSEEK_TOKEN &&
        env.AI_GATEWAY_ACCOUNT_ID &&
        env.AI_GATEWAY_ID
      );
      return Response.json({
        success: hasAIGateway
      });
    }

    // 配置检查：如果缺少必需的环境变量，记录错误
    if (
      !env.DEEPSEEK_TOKEN ||
      !env.AI_GATEWAY_ACCOUNT_ID ||
      !env.AI_GATEWAY_ID
    ) {
      console.error(
        "AI Gateway configuration is incomplete. Please ensure DEEPSEEK_TOKEN, AI_GATEWAY_ACCOUNT_ID, and AI_GATEWAY_ID are set in your wrangler.toml"
      );
    }

    // 将请求路由到 Agent 处理器
    // 如果 Agent 无法处理该请求，返回 404
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
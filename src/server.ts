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

// 导入 OpenAI 官方 SDK
import OpenAI from 'openai';

// 导入项目内部工具和工具函数
import { processToolCalls } from "./utils";
import { tools, executions } from "./tools";
import { formatDataStreamPart } from "@ai-sdk/ui-utils";
// import { env } from "cloudflare:workers";

// 全局变量，用于存储 AI 模型实例
// 这个变量将在 fetch 函数中初始化，供 Chat 类使用
let model: any;
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
  // 私有属性：存储 OpenAI 模型实例
  private model: OpenAI | null = null;

  /**
   * 初始化 AI Gateway 模型
   * 
   * 这个方法负责创建和配置 OpenAI 客户端，连接到 Cloudflare AI Gateway
   * 使用 DeepSeek 模型作为 AI 提供商
   * 
   * @returns {Promise<OpenAI>} 配置好的 OpenAI 客户端实例
   */
  private async initModel() {
    if (!this.model) {
      // 从环境变量获取配置信息
      const env = this.env as any;
      
      // 创建 OpenAI 客户端实例，配置 AI Gateway 作为基础 URL
      this.model = new OpenAI({
        apiKey: env.DEEPSEEK_TOKEN,  // DeepSeek API 密钥
        baseURL: `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/deepseek`
      });
    }
    return this.model;
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

        // 使用 AI Gateway 流式传输 AI 响应
        try {
          console.log("Starting AI Gateway request...");
          console.log("Messages:", processedMessages);
          
          // 初始化 AI 模型
          const aiModel = await this.initModel();
          
          // 调用 DeepSeek 模型生成回复
          const chatCompletion = await aiModel.chat.completions.create({
            model: "deepseek-chat",  // 使用 DeepSeek 聊天模型
            messages: [
              {
                role: "system",
                content: `You are a helpful assistant that can do various tasks... 

${unstable_getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.`
              },
              // 将处理后的消息转换为 OpenAI 格式
              ...processedMessages.map(msg => ({
                role: msg.role as "user" | "assistant" | "system",
                content: msg.content
              }))
            ]
          });

          console.log("AI Gateway response received:", chatCompletion);
          
          // 将 AI 响应写入数据流
          // 使用正确的 Agents 框架格式
          const response = chatCompletion.choices[0]?.message?.content || "No response";
          console.log("Writing response to dataStream:", response);
          
          // 使用 formatDataStreamPart 格式化数据流
          // 这是 Agents 框架期望的格式
          dataStream.write(
            formatDataStreamPart("text", response)
          );
          
          // 调试：记录发送的数据流
          console.log("Sent dataStream chunk:", formatDataStreamPart("text", response));
          
          // 调用完成回调，通知前端流式传输已完成
          onFinish({
            finishReason: 'stop',  // 完成原因：正常停止
            usage: chatCompletion.usage  // 使用统计信息
          } as any);
          
        } catch (error) {
          // 错误处理：记录详细的错误信息
          console.error("Error while streaming:", error);
          console.error("Model:", model);
          console.error("Error details:", {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : 'No stack trace'
          });
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

    // 初始化 AI Gateway 模型（全局单例）
    // 只有在第一次请求时才初始化，后续请求复用同一个实例
    if (!model) {
      model = new OpenAI({
        apiKey: env.DEEPSEEK_TOKEN,  // DeepSeek API 密钥
        baseURL: `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/deepseek`
      });
    }

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
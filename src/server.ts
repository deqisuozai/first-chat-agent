import { routeAgentRequest, type Schedule } from "agents";

import { unstable_getSchedulePrompt } from "agents/schedule";

import { AIChatAgent } from "agents/ai-chat-agent";
import {
  createDataStreamResponse,
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet
} from "ai";
import OpenAI from 'openai';

import { processToolCalls } from "./utils";
import { tools, executions } from "./tools";
// import { env } from "cloudflare:workers";

// 全局变量，将在 fetch 函数中设置
let model: any;
// const openai = createOpenAI({
//   apiKey: env.OPENAI_API_KEY,
//   baseURL: env.GATEWAY_BASE_URL,
// });

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env> {
  private model: OpenAI | null = null;

  /**
   * 初始化 AI Gateway 模型
   */
  private async initModel() {
    if (!this.model) {
      // 从环境变量获取配置
      const env = this.env as any;
      this.model = new OpenAI({
        apiKey: env.DEEPSEEK_TOKEN,
        baseURL: `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/deepseek`
      });
    }
    return this.model;
  }

  /**
   * Handles incoming chat messages and manages the response stream
   * @param onFinish - Callback function executed when streaming completes
   */

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools,
      ...this.mcp.unstable_getAITools()
    };

    // Create a streaming response that handles both text and tool outputs
    const dataStreamResponse = createDataStreamResponse({
      execute: async (dataStream) => {
        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: this.messages,
          dataStream,
          tools: allTools,
          executions
        });

        // Stream the AI response using AI Gateway
        try {
          console.log("Starting AI Gateway request...");
          console.log("Messages:", processedMessages);
          
          const aiModel = await this.initModel();
          const chatCompletion = await aiModel.chat.completions.create({
            model: "deepseek-chat",
            messages: [
              {
                role: "system",
                content: `You are a helpful assistant that can do various tasks... 

${unstable_getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.`
              },
              ...processedMessages.map(msg => ({
                role: msg.role as "user" | "assistant" | "system",
                content: msg.content
              }))
            ]
          });

          console.log("AI Gateway response received:", chatCompletion);
          
          // 将响应写入数据流 - 使用 Agents 框架格式
          const response = chatCompletion.choices[0]?.message?.content || "No response";
          console.log("Writing response to dataStream:", response);
          
          // 使用 Agents 框架期望的格式：直接写入文本内容
          dataStream.write(`0:${response}\n`);
          
          // 写入完成标记
          dataStream.write(`8:\n`);
          
          // 调试：记录发送的数据流
          console.log("Sent dataStream chunks:", [
            `0:${response}`,
            '8:'
          ]);
          
          // 调用完成回调
          onFinish({
            finishReason: 'stop',
            usage: chatCompletion.usage
          } as any);
          
        } catch (error) {
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
  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        content: `Running scheduled task: ${description}`,
        createdAt: new Date()
      }
    ]);
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    // 初始化 AI Gateway 模型
    if (!model) {
      model = new OpenAI({
        apiKey: env.DEEPSEEK_TOKEN,
        baseURL: `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/deepseek`
      });
    }

    if (url.pathname === "/check-open-ai-key") {
      // 检查 AI Gateway 配置是否可用
      const hasAIGateway = !!(
        env.DEEPSEEK_TOKEN &&
        env.AI_GATEWAY_ACCOUNT_ID &&
        env.AI_GATEWAY_ID
      );
      return Response.json({
        success: hasAIGateway
      });
    }

    if (
      !env.DEEPSEEK_TOKEN ||
      !env.AI_GATEWAY_ACCOUNT_ID ||
      !env.AI_GATEWAY_ID
    ) {
      console.error(
        "AI Gateway configuration is incomplete. Please ensure DEEPSEEK_TOKEN, AI_GATEWAY_ACCOUNT_ID, and AI_GATEWAY_ID are set in your wrangler.toml"
      );
    }
    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
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
import { createOpenAI } from "@ai-sdk/openai";

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
        const result = streamText({
          model,
          system: `You are a helpful assistant that can do various tasks... 

${unstable_getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.
`,
          messages: processedMessages,
          tools: allTools,
          onFinish: async (args) => {
            onFinish(
              args as Parameters<StreamTextOnFinishCallback<ToolSet>>[0]
            );
            // await this.mcp.closeConnection(mcpConnection.id);
          },
          onError: (error) => {
            console.error("Error while streaming:", error);
          },
          maxSteps: 10
        });

        // Merge the AI response stream with tool execution outputs
        result.mergeIntoDataStream(dataStream);
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
      const openai = createOpenAI({
        baseURL: `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/deepseek`,
        headers: {
          Authorization: `Bearer ${env.DEEPSEEK_TOKEN}`
        }
      });
      model = openai("deepseek/deepseek-chat");
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
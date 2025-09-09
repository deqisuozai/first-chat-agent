/**
 * 工具调用处理工具函数
 * 
 * 这个文件包含处理需要人工确认的工具调用的核心逻辑
 * 实现了"人机交互循环"模式，允许用户确认或拒绝工具执行
 * 
 * 参考：https://github.com/vercel/ai/blob/main/examples/next-openai/app/api/use-chat-human-in-the-loop/utils.ts
 */

// 导入 AI SDK 的工具和类型
import { formatDataStreamPart, type Message } from "@ai-sdk/ui-utils";
import {
  convertToCoreMessages,      // 消息格式转换
  type DataStreamWriter,       // 数据流写入器类型
  type ToolExecutionOptions,   // 工具执行选项类型
  type ToolSet                 // 工具集合类型
} from "ai";
import type { z } from "zod";  // Zod 类型验证库
import { APPROVAL } from "./shared";  // 确认状态常量

/**
 * 类型安全的工具名称验证函数
 * 
 * 检查给定的键是否存在于对象中，并提供类型安全
 * 
 * @param key - 要检查的键
 * @param obj - 要检查的对象
 * @returns 类型谓词，如果键存在则返回 true
 */
function isValidToolName<K extends PropertyKey, T extends object>(
  key: K,
  obj: T
): key is K & keyof T {
  return key in obj;
}

/**
 * 处理需要人工确认的工具调用
 * 
 * 这是实现"人机交互循环"的核心函数
 * 当 AI 调用需要确认的工具时，会等待用户确认
 * 用户确认后，执行相应的工具函数并将结果返回给客户端
 * 
 * @param options - 函数选项
 * @param options.tools - 工具名称到工具实例的映射
 * @param options.dataStream - 用于将结果发送回客户端的数据流
 * @param options.messages - 要处理的消息数组
 * @param options.executions - 工具名称到执行函数的映射
 * @returns 处理后的消息数组的 Promise
 */
export async function processToolCalls<
  Tools extends ToolSet,
  ExecutableTools extends {
    // biome-ignore lint/complexity/noBannedTypes: it's fine
    [Tool in keyof Tools as Tools[Tool] extends { execute: Function }
      ? never
      : Tool]: Tools[Tool];
  }
>({
  dataStream,
  messages,
  executions
}: {
  tools: Tools; // 用于类型推断
  dataStream: DataStreamWriter;  // 数据流写入器
  messages: Message[];           // 消息数组
  executions: {                  // 执行函数映射
    [K in keyof Tools & keyof ExecutableTools]?: (
      args: z.infer<ExecutableTools[K]["parameters"]>,  // 工具参数类型
      context: ToolExecutionOptions                     // 执行上下文
    ) => Promise<unknown>;
  };
}): Promise<Message[]> {
  // 获取最后一条消息（通常包含工具调用）
  const lastMessage = messages[messages.length - 1];
  const parts = lastMessage.parts;
  
  // 如果没有消息部分，直接返回原始消息
  if (!parts) return messages;

  // 并行处理所有消息部分
  const processedParts = await Promise.all(
    parts.map(async (part) => {
      // 只处理工具调用类型的部分
      if (part.type !== "tool-invocation") return part;

      const { toolInvocation } = part;
      const toolName = toolInvocation.toolName;

      // 只处理有执行函数且处于 'result' 状态的工具调用
      // 这意味着工具需要确认且用户已经做出决定
      if (!(toolName in executions) || toolInvocation.state !== "result")
        return part;

      let result: unknown;

      // 根据用户的确认决定执行相应的操作
      if (toolInvocation.result === APPROVAL.YES) {
        // 用户确认执行工具
        // 验证工具名称和状态
        if (
          !isValidToolName(toolName, executions) ||
          toolInvocation.state !== "result"
        ) {
          return part;
        }

        // 获取工具执行函数并执行
        const toolInstance = executions[toolName];
        if (toolInstance) {
          result = await toolInstance(toolInvocation.args, {
            messages: convertToCoreMessages(messages),  // 转换消息格式
            toolCallId: toolInvocation.toolCallId       // 工具调用 ID
          });
        } else {
          result = "Error: No execute function found on tool";
        }
      } else if (toolInvocation.result === APPROVAL.NO) {
        // 用户拒绝执行工具
        result = "Error: User denied access to tool execution";
      } else {
        // 对于任何未处理的响应，返回原始部分
        return part;
      }

      // 将更新的工具结果发送给客户端
      dataStream.write(
        formatDataStreamPart("tool_result", {
          toolCallId: toolInvocation.toolCallId,
          result
        })
      );

      // 返回带有实际结果的更新后的工具调用
      return {
        ...part,
        toolInvocation: {
          ...toolInvocation,
          result
        }
      };
    })
  );

  // 最后返回处理后的消息
  // 保留除最后一条消息外的所有消息，并更新最后一条消息的处理后的部分
  return [...messages.slice(0, -1), { ...lastMessage, parts: processedParts }];
}

// 注释掉的工具确认检查函数
// 这个函数可以用于动态确定哪些工具需要确认
// export function getToolsRequiringConfirmation<
//   T extends ToolSet
//   // E extends {
//   //   [K in keyof T as T[K] extends { execute: Function } ? never : K]: T[K];
//   // },
// >(tools: T): string[] {
//   return (Object.keys(tools) as (keyof T)[]).filter((key) => {
//     const maybeTool = tools[key];
//     return typeof maybeTool.execute !== "function";
//   }) as string[];
// }

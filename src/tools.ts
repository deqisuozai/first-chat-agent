/**
 * AI 聊天代理的工具定义文件
 * 
 * 这个文件定义了 AI 代理可以使用的所有工具
 * 工具分为两类：
 * 1. 需要人工确认的工具 - 执行前需要用户手动确认
 * 2. 自动执行的工具 - 可以直接执行，无需确认
 * 
 * 工具系统允许 AI 代理执行各种操作，如：
 * - 获取天气信息
 * - 查询时间
 * - 安排任务
 * - 管理定时任务
 */
import { tool } from "ai";  // AI SDK 的工具定义函数
import { z } from "zod";    // 数据验证库

// 导入类型定义和 Agent 相关功能
import type { Chat } from "./server";           // Chat 类类型
import { getCurrentAgent } from "agents";       // 获取当前 Agent 实例
import { unstable_scheduleSchema } from "agents/schedule";  // 任务调度模式

/**
 * 获取天气信息工具 - 需要人工确认
 * 
 * 当 AI 调用这个工具时，会向用户显示确认对话框
 * 用户可以选择允许或拒绝执行
 * 实际的执行逻辑在下面的 executions 对象中定义
 * 
 * 注意：没有 execute 函数使这个工具需要人工确认
 */
const getWeatherInformation = tool({
  description: "show the weather in a given city to the user",  // 工具描述
  parameters: z.object({ city: z.string() })  // 参数定义：需要一个城市名称
  // 注意：省略 execute 函数使这个工具需要人工确认
});

/**
 * 获取本地时间工具 - 自动执行
 * 
 * 由于包含 execute 函数，这个工具会在不需要用户确认的情况下直接执行
 * 适合不需要监督的低风险操作
 */
const getLocalTime = tool({
  description: "get the local time for a specified location",  // 工具描述
  parameters: z.object({ location: z.string() }),  // 参数定义：需要一个位置名称
  execute: async ({ location }) => {  // 执行函数
    console.log(`Getting local time for ${location}`);
    return "10am";  // 返回模拟的时间信息
  }
});

/**
 * 任务调度工具 - 自动执行
 * 
 * 这个工具允许 AI 安排任务在稍后执行
 * 支持三种调度类型：
 * 1. 定时执行 - 在特定日期时间执行
 * 2. 延迟执行 - 在指定秒数后执行
 * 3. 定时任务 - 使用 cron 表达式定期执行
 */
const scheduleTask = tool({
  description: "A tool to schedule a task to be executed at a later time",  // 工具描述
  parameters: unstable_scheduleSchema,  // 使用 Agents 框架的调度模式
  execute: async ({ when, description }) => {
    // 从 ALS (AsyncLocalStorage) 存储中获取当前 Agent 上下文
    const { agent } = getCurrentAgent<Chat>();

    /**
     * 错误处理辅助函数
     * @param msg - 错误消息
     * @returns 抛出错误
     */
    function throwError(msg: string): string {
      throw new Error(msg);
    }

    // 检查调度类型是否有效
    if (when.type === "no-schedule") {
      return "Not a valid schedule input";
    }

    // 根据调度类型确定输入参数
    const input =
      when.type === "scheduled"
        ? when.date              // 定时执行：使用具体日期
        : when.type === "delayed"
          ? when.delayInSeconds  // 延迟执行：使用延迟秒数
          : when.type === "cron"
            ? when.cron          // 定时任务：使用 cron 表达式
            : throwError("not a valid schedule input");

    try {
      // 调用 Agent 的 schedule 方法安排任务
      // 参数：调度时间、执行方法名、任务描述
      agent!.schedule(input!, "executeTask", description);
    } catch (error) {
      console.error("error scheduling task", error);
      return `Error scheduling task: ${error}`;
    }
    
    return `Task scheduled for type "${when.type}" : ${input}`;
  }
});

/**
 * 获取已调度任务列表工具 - 自动执行
 * 
 * 这个工具列出所有已安排的任务
 * 不需要人工确认，可以直接执行
 */
const getScheduledTasks = tool({
  description: "List all tasks that have been scheduled",  // 工具描述
  parameters: z.object({}),  // 不需要参数
  execute: async () => {
    // 获取当前 Agent 实例
    const { agent } = getCurrentAgent<Chat>();

    try {
      // 调用 Agent 的 getSchedules 方法获取所有已调度的任务
      const tasks = agent!.getSchedules();
      
      // 如果没有任务，返回提示信息
      if (!tasks || tasks.length === 0) {
        return "No scheduled tasks found.";
      }
      
      return tasks;  // 返回任务列表
    } catch (error) {
      console.error("Error listing scheduled tasks", error);
      return `Error listing scheduled tasks: ${error}`;
    }
  }
});

/**
 * 取消已调度任务工具 - 自动执行
 * 
 * 这个工具通过任务 ID 取消已安排的任务
 * 不需要人工确认，可以直接执行
 */
const cancelScheduledTask = tool({
  description: "Cancel a scheduled task using its ID",  // 工具描述
  parameters: z.object({
    taskId: z.string().describe("The ID of the task to cancel")  // 需要任务 ID 参数
  }),
  execute: async ({ taskId }) => {
    // 获取当前 Agent 实例
    const { agent } = getCurrentAgent<Chat>();
    
    try {
      // 调用 Agent 的 cancelSchedule 方法取消任务
      await agent!.cancelSchedule(taskId);
      return `Task ${taskId} has been successfully canceled.`;
    } catch (error) {
      console.error("Error canceling scheduled task", error);
      return `Error canceling task ${taskId}: ${error}`;
    }
  }
});

/**
 * 导出所有可用工具
 * 
 * 这个对象包含所有定义的工具，会被提供给 AI 模型
 * AI 模型可以根据这些工具的描述来决定何时调用哪个工具
 */
export const tools = {
  getWeatherInformation,  // 获取天气信息（需要确认）
  getLocalTime,           // 获取本地时间（自动执行）
  scheduleTask,           // 调度任务（自动执行）
  getScheduledTasks,      // 获取已调度任务（自动执行）
  cancelScheduledTask     // 取消已调度任务（自动执行）
};

/**
 * 需要确认的工具的执行实现
 * 
 * 这个对象包含需要人工确认的工具的实际执行逻辑
 * 每个函数对应上面没有 execute 函数的工具
 * 
 * 注意：下面的键必须与 app.tsx 中的 toolsRequiringConfirmation 数组匹配
 */
export const executions = {
  /**
   * 获取天气信息的实际执行逻辑
   * 当用户确认执行 getWeatherInformation 工具时，会调用这个函数
   * 
   * @param city - 城市名称
   * @returns 天气信息字符串
   */
  getWeatherInformation: async ({ city }: { city: string }) => {
    console.log(`Getting weather information for ${city}`);
    // 这里应该调用真实的天气 API
    // 目前返回模拟数据
    return `The weather in ${city} is sunny`;
  }
};

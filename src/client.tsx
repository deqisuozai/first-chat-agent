/**
 * 客户端入口文件
 * 
 * 这是整个 React 应用的入口点
 * 负责：
 * 1. 导入全局样式
 * 2. 创建 React 根节点
 * 3. 渲染应用组件
 * 4. 设置主题样式
 */

// 导入全局样式文件
import "./styles.css";

// 导入 React 18 的 createRoot API
import { createRoot } from "react-dom/client";

// 导入主应用组件
import App from "./app";

// 导入提供者组件（可能包含上下文提供者）
import { Providers } from "@/providers";

// 创建 React 根节点
// 使用非空断言 (!) 因为我们确信 #app 元素存在
const root = createRoot(document.getElementById("app")!);

// 渲染应用
root.render(
  <Providers>
    {/* 应用容器，包含主题样式 */}
    <div className="bg-neutral-50 text-base text-neutral-900 antialiased transition-colors selection:bg-blue-700 selection:text-white dark:bg-neutral-950 dark:text-neutral-100">
      <App />
    </div>
  </Providers>
);

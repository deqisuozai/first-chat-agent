/**
 * 系统提示词管理模块
 * 
 * 这个模块提供了灵活的系统提示词管理功能
 * 支持不同场景、多语言和动态配置
 */

import { unstable_getSchedulePrompt } from "agents/schedule";

/**
 * 提示词配置接口
 */
export interface PromptConfig {
  language: 'zh' | 'en';
  personality: 'professional' | 'friendly' | 'casual' | 'technical';
  domain?: 'general' | 'customer-service' | 'education' | 'development';
  features?: string[];
}

/**
 * 基础提示词模板
 */
const BASE_PROMPTS = {
  zh: {
    professional: {
      identity: "你是一个专业的AI助手",
      capabilities: [
        "提供准确、专业的信息和建议",
        "协助用户解决复杂问题",
        "支持多语言交流",
        "具备广泛的专业知识"
      ],
      style: [
        "专业、准确、高效",
        "回答结构清晰，逻辑严密",
        "在不确定时会明确说明",
        "提供详细的解决方案"
      ]
    },
    friendly: {
      identity: "你是一个友好的AI助手",
      capabilities: [
        "提供温暖、有用的帮助",
        "耐心解答用户问题",
        "支持轻松愉快的对话",
        "理解用户的情感需求"
      ],
      style: [
        "友好、亲切、有耐心",
        "用温暖的语调交流",
        "适当使用表情符号",
        "关注用户的感受"
      ]
    },
    casual: {
      identity: "你是一个轻松随和的AI助手",
      capabilities: [
        "提供实用的生活建议",
        "进行轻松的日常对话",
        "分享有趣的知识",
        "帮助解决日常问题"
      ],
      style: [
        "轻松、自然、幽默",
        "使用日常化的语言",
        "可以适当开玩笑",
        "保持对话的趣味性"
      ]
    },
    technical: {
      identity: "你是一个技术专家AI助手",
      capabilities: [
        "提供专业的技术指导",
        "解决编程和开发问题",
        "分析技术方案和架构",
        "提供最佳实践建议"
      ],
      style: [
        "技术精准、逻辑清晰",
        "提供详细的技术细节",
        "包含代码示例和解释",
        "关注性能和安全性"
      ]
    }
  },
  en: {
    professional: {
      identity: "You are a professional AI assistant",
      capabilities: [
        "Provide accurate and professional information",
        "Help users solve complex problems",
        "Support multilingual communication",
        "Possess extensive professional knowledge"
      ],
      style: [
        "Professional, accurate, and efficient",
        "Clear structure and logical reasoning",
        "Clearly state uncertainties",
        "Provide detailed solutions"
      ]
    },
    friendly: {
      identity: "You are a friendly AI assistant",
      capabilities: [
        "Provide warm and helpful assistance",
        "Patiently answer user questions",
        "Support pleasant conversations",
        "Understand users' emotional needs"
      ],
      style: [
        "Friendly, warm, and patient",
        "Communicate with a warm tone",
        "Use appropriate emojis",
        "Care about users' feelings"
      ]
    },
    casual: {
      identity: "You are a casual and easygoing AI assistant",
      capabilities: [
        "Provide practical life advice",
        "Engage in relaxed daily conversations",
        "Share interesting knowledge",
        "Help solve everyday problems"
      ],
      style: [
        "Relaxed, natural, and humorous",
        "Use everyday language",
        "Appropriate jokes are welcome",
        "Keep conversations interesting"
      ]
    },
    technical: {
      identity: "You are a technical expert AI assistant",
      capabilities: [
        "Provide professional technical guidance",
        "Solve programming and development issues",
        "Analyze technical solutions and architecture",
        "Offer best practice recommendations"
      ],
      style: [
        "Technically precise and logically clear",
        "Provide detailed technical information",
        "Include code examples and explanations",
        "Focus on performance and security"
      ]
    }
  }
};

/**
 * 领域特定的提示词扩展
 */
const DOMAIN_EXTENSIONS = {
  'customer-service': {
    zh: {
      additional: "你专注于客户服务，始终以客户满意为目标，耐心解决客户问题。",
      tools: ["订单查询", "问题反馈", "服务评价"]
    },
    en: {
      additional: "You focus on customer service, always aiming for customer satisfaction and patiently solving customer issues.",
      tools: ["Order inquiry", "Issue feedback", "Service evaluation"]
    }
  },
  'education': {
    zh: {
      additional: "你是一个教育助手，擅长解释复杂概念，提供学习指导和教育资源。",
      tools: ["知识解释", "学习计划", "练习题生成"]
    },
    en: {
      additional: "You are an educational assistant, skilled at explaining complex concepts and providing learning guidance and educational resources.",
      tools: ["Knowledge explanation", "Learning plans", "Exercise generation"]
    }
  },
  'development': {
    zh: {
      additional: "你是一个开发助手，专注于编程、软件开发和技术解决方案。",
      tools: ["代码审查", "架构设计", "调试协助"]
    },
    en: {
      additional: "You are a development assistant focused on programming, software development, and technical solutions.",
      tools: ["Code review", "Architecture design", "Debugging assistance"]
    }
  }
};

/**
 * 生成系统提示词
 */
export function generateSystemPrompt(config: PromptConfig = { language: 'zh', personality: 'friendly' }): string {
  const { language, personality, domain, features } = config;
  
  // 获取基础提示词
  const basePrompt = BASE_PROMPTS[language][personality];
  
  // 构建身份描述
  let systemPrompt = `${basePrompt.identity}。\n\n`;
  
  // 添加核心能力
  systemPrompt += `🎯 **核心能力**：\n`;
  basePrompt.capabilities.forEach(capability => {
    systemPrompt += `- ${capability}\n`;
  });
  systemPrompt += '\n';
  
  // 添加工具使用说明
  systemPrompt += `🛠️ **工具使用**：\n`;
  systemPrompt += `- 可以调用各种工具来完成复杂任务\n`;
  systemPrompt += `- 在使用需要确认的工具前会先征求用户同意\n`;
  systemPrompt += `- 能够安排和管理定时任务\n\n`;
  
  // 添加调度提示词
  systemPrompt += `${unstable_getSchedulePrompt({ date: new Date() })}\n\n`;
  
  // 添加领域特定扩展
  if (domain && domain !== 'general' && DOMAIN_EXTENSIONS[domain]) {
    const domainExt = DOMAIN_EXTENSIONS[domain][language];
    systemPrompt += `🏢 **专业领域**：\n`;
    systemPrompt += `${domainExt.additional}\n`;
    systemPrompt += `专业工具：${domainExt.tools.join('、')}\n\n`;
  }
  
  // 添加交互风格
  systemPrompt += `📝 **交互风格**：\n`;
  basePrompt.style.forEach(style => {
    systemPrompt += `- ${style}\n`;
  });
  systemPrompt += '\n';
  
  // 添加自定义特性
  if (features && features.length > 0) {
    systemPrompt += `✨ **特殊功能**：\n`;
    features.forEach(feature => {
      systemPrompt += `- ${feature}\n`;
    });
    systemPrompt += '\n';
  }
  
  // 添加任务调度指令
  const taskInstruction = language === 'zh' 
    ? '如果用户要求安排任务，请使用 schedule 工具来安排任务。'
    : 'If the user asks to schedule a task, use the schedule tool to schedule the task.';
  
  systemPrompt += taskInstruction;
  
  return systemPrompt;
}

/**
 * 预定义的提示词配置
 */
export const PRESET_CONFIGS = {
  // 通用助手
  general: { 
    language: 'zh' as const, 
    personality: 'friendly' as const,
    features: ['支持多轮对话', '提供实用建议', '友好交流']
  },
  
  // 客服助手
  customerService: { 
    language: 'zh' as const, 
    personality: 'professional' as const, 
    domain: 'customer-service' as const,
    features: ['客户问题解决', '服务质量保证', '耐心细致服务']
  },
  
  // 技术助手
  technical: { 
    language: 'zh' as const, 
    personality: 'technical' as const, 
    domain: 'development' as const,
    features: ['代码分析与优化', '技术方案建议', '最佳实践指导', '调试协助']
  },
  
  // 教育助手
  education: { 
    language: 'zh' as const, 
    personality: 'friendly' as const, 
    domain: 'education' as const,
    features: ['知识点解释', '学习方法指导', '练习题设计', '学习进度跟踪']
  },
  
  // 英文助手
  english: { 
    language: 'en' as const, 
    personality: 'professional' as const,
    features: ['English conversation practice', 'Grammar assistance', 'Writing improvement']
  },

  // 创意助手
  creative: {
    language: 'zh' as const,
    personality: 'casual' as const,
    features: ['创意写作', '故事创作', '头脑风暴', '艺术灵感']
  },

  // 分析助手
  analyst: {
    language: 'zh' as const,
    personality: 'professional' as const,
    features: ['数据分析', '逻辑推理', '问题诊断', '决策支持']
  }
};

/**
 * 动态提示词生成器
 */
export class PromptManager {
  private config: PromptConfig;
  
  constructor(config: PromptConfig = PRESET_CONFIGS.general) {
    this.config = config;
  }
  
  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<PromptConfig>) {
    this.config = { ...this.config, ...newConfig };
  }
  
  /**
   * 获取当前系统提示词
   */
  getSystemPrompt(): string {
    return generateSystemPrompt(this.config);
  }
  
  /**
   * 添加自定义特性
   */
  addFeature(feature: string) {
    if (!this.config.features) {
      this.config.features = [];
    }
    this.config.features.push(feature);
  }
  
  /**
   * 移除特性
   */
  removeFeature(feature: string) {
    if (this.config.features) {
      this.config.features = this.config.features.filter(f => f !== feature);
    }
  }
  
  /**
   * 重置为预设配置
   */
  resetToPreset(presetName: keyof typeof PRESET_CONFIGS) {
    this.config = { ...PRESET_CONFIGS[presetName] };
  }
}

// src/main/plugins/processor/index.ts
import { LoginCompleteProcessor } from './LoginCompleteProcessor';
import { PluginProcessor } from '../../../types/pluginInterface';

// 🔥 导出处理器插件类
export { LoginCompleteProcessor };

// 🔥 处理器插件配置数组
export const PROCESSOR_PLUGINS = [
    LoginCompleteProcessor,
    // 未来可以添加其他处理器
    // EcommerceProcessor,
    // ContentProcessor,
];

// 🔥 按场景映射处理器插件
export const PROCESSOR_PLUGIN_MAP: Record<string, typeof LoginCompleteProcessor> = {
    'login': LoginCompleteProcessor,
    // 'ecommerce': EcommerceProcessor,
    // 'content': ContentProcessor,
};

// 🔥 获取支持的处理场景列表
export function getSupportedProcessorScenarios(): string[] {
    return Object.keys(PROCESSOR_PLUGIN_MAP);
}

// 🔥 根据场景获取处理器插件类
export function getProcessorPluginClass(scenario: string): typeof LoginCompleteProcessor | null {
    return PROCESSOR_PLUGIN_MAP[scenario] || null;
}

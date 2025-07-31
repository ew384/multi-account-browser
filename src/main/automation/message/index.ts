// src/main/automation/message/index.ts

// 导出主要类
export { MessageTabManager } from './MessageTabManager';
export { MessageScheduler } from './MessageScheduler';

// 导出类型接口
export type { MessageTabMetadata } from './MessageTabManager';
export type { 
    MessageScheduleTask, 
    MessageSchedulerConfig 
} from './MessageScheduler';
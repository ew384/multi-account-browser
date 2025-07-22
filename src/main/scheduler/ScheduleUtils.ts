// src/main/scheduler/ScheduleUtils.ts

export interface TimeConfig {
    hour: number;
    minute: number;
}

export interface ScheduleOptions {
    totalVideos: number;
    videosPerDay?: number;
    dailyTimes?: (number | string)[];
    timestamps?: boolean;
    startDays?: number;
}

/**
 * 生成视频上传调度时间，从次日开始
 * 
 * @param options 调度配置选项
 * @returns 调度时间列表，可以是时间戳或 Date 对象
 */
export function generateScheduleTimeNextDay(options: ScheduleOptions): number[] | Date[] {
    const {
        totalVideos,
        videosPerDay = 1,
        dailyTimes = [6, 11, 14, 16, 22],
        timestamps = false,
        startDays = 0
    } = options;

    if (videosPerDay <= 0) {
        throw new Error("videosPerDay should be a positive integer");
    }

    // 解析时间格式 - 支持整数小时和 "HH:MM" 格式
    const parsedTimes: TimeConfig[] = [];

    for (const time of dailyTimes) {
        if (typeof time === 'string') {
            // 处理 "HH:MM" 格式
            if (time.includes(':')) {
                try {
                    const [hourStr, minuteStr] = time.split(':');
                    const hour = parseInt(hourStr, 10);
                    const minute = parseInt(minuteStr, 10);

                    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
                        throw new Error(`Invalid time format: ${time}. Hour should be 0-23, minute should be 0-59.`);
                    }

                    parsedTimes.push({ hour, minute });
                } catch (error) {
                    throw new Error(`Invalid time format: ${time}. Expected 'HH:MM' format.`);
                }
            } else {
                // 处理纯数字字符串
                try {
                    const hour = parseInt(time, 10);
                    if (isNaN(hour) || hour < 0 || hour > 23) {
                        throw new Error(`Invalid hour: ${time}. Expected 0-23.`);
                    }
                    parsedTimes.push({ hour, minute: 0 });
                } catch (error) {
                    throw new Error(`Invalid time format: ${time}. Expected integer or 'HH:MM' format.`);
                }
            }
        } else if (typeof time === 'number') {
            // 处理整数小时
            const hour = Math.floor(time);
            if (hour < 0 || hour > 23) {
                throw new Error(`Invalid hour: ${hour}. Expected 0-23.`);
            }
            parsedTimes.push({ hour, minute: 0 });
        } else {
            throw new Error(`Invalid time type: ${typeof time}. Expected number or string.`);
        }
    }

    if (videosPerDay > parsedTimes.length) {
        throw new Error("videosPerDay should not exceed the length of dailyTimes");
    }

    // 生成时间戳
    const schedule: Date[] = [];
    const currentTime = new Date();

    for (let video = 0; video < totalVideos; video++) {
        const day = Math.floor(video / videosPerDay) + startDays + 1; // +1 从次日开始
        const dailyVideoIndex = video % videosPerDay;

        // 计算当前视频的时间
        const timeInfo = parsedTimes[dailyVideoIndex];
        const { hour, minute } = timeInfo;

        // 创建目标时间
        const targetTime = new Date(currentTime);
        targetTime.setDate(currentTime.getDate() + day);
        targetTime.setHours(hour, minute, 0, 0);

        schedule.push(targetTime);
    }

    if (timestamps) {
        return schedule.map(time => Math.floor(time.getTime() / 1000));
    }

    return schedule;
}

// 导出类型定义
export type ScheduleTime = Date | number;
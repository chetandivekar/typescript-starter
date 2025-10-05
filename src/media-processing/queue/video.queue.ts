import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisOptions } from 'ioredis';

@Injectable()
export class VideoQueueService {
  private readonly queue: Queue;

  constructor() {
    // Configure BullMQ connection using ioredis-style config
    const connection: RedisOptions = {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
    };

    this.queue = new Queue('video-transcode', { connection });
  }

  async addJob(data: any) {
    return this.queue.add('transcode', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}

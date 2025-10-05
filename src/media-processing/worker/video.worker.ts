import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { AppModule } from '../../app.module';
import { MediaProcessingService } from '../media-processing.service';

async function bootstrapWorker() {
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const streamingService = appContext.get(MediaProcessingService);

  const worker = new Worker(
    'video-transcode',
    async (job) => {
      try {
        const { jobId, orgId } = job.data;

        await streamingService.convertAndUploadHLSAndCleanup(jobId, orgId);
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
    {
      connection: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    },
  );

  worker.on('failed', (job, err) =>
    console.error(`❌ Job ${job?.id} failed: ${err.message}`),
  );
}

bootstrapWorker();

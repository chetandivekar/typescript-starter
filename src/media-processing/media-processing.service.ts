import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import * as ffmpeg from 'fluent-ffmpeg';
import { r2Client } from 'src/common/r2.config';

enum FileStatus {
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  DONE = 'done',
  FAILED = 'failed',
}

export const getFileTypeFolder = (mimeType: string, ext: string): string => {
  if (
    mimeType.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)
  ) {
    return 'images';
  } else if (
    mimeType.startsWith('video/') ||
    ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext)
  ) {
    return 'videos';
  } else if (
    mimeType.startsWith('audio/') ||
    ['.mp3', '.wav', '.ogg'].includes(ext)
  ) {
    return 'audios';
  } else if (
    [
      '.pdf',
      '.doc',
      '.docx',
      '.ppt',
      '.pptx',
      '.xls',
      '.xlsx',
      '.csv',
      '.txt',
      '.json',
    ].includes(ext)
  ) {
    return 'documents';
  } else if (['.zip', '.rar', '.7z'].includes(ext)) {
    return 'archives';
  } else {
    return 'others';
  }
};
const getCleanFileKey = (file: any, orgId: string, isRaw?: boolean) => {
  const cleanName = file.originalname.trim().replace(/\s+/g, '-');
  const ext = path.extname(cleanName).toLowerCase();

  // Determine folder based on MIME type or extension
  const typeFolder = getFileTypeFolder(file.mimetype, ext);

  // Construct organized path: orgId/type/YYYY-MM/file
  const now = new Date();
  const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const fileKey = `${orgId}/${typeFolder}/${yyyyMm}/${Date.now()}-${uuidv4()}-${cleanName}`;
  const rawVideoUploadKey = `${orgId}/process-video/zi82faW6M7Uu6YRMZIY/${typeFolder}/${yyyyMm}/${Date.now()}-${uuidv4()}-${cleanName}`;
  return isRaw ? rawVideoUploadKey : fileKey;
};

// Function to safely get ffmpeg-static path
const getFfmpegPath = (): string => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpegStatic = require('ffmpeg-static');

    if (typeof ffmpegStatic === 'string' && ffmpegStatic) {
      return ffmpegStatic;
    } else if (typeof ffmpegStatic === 'object' && ffmpegStatic?.default) {
      return ffmpegStatic.default;
    } else {
      console.warn(
        'ffmpeg-static returned unexpected value, using system ffmpeg as fallback',
      );
      return 'ffmpeg';
    }
  } catch (error) {
    console.error('Failed to load ffmpeg-static:', error);
    console.warn('Using system ffmpeg as fallback');
    return 'ffmpeg';
  }
};

// Initialize ffmpeg path
const ffmpegPath = getFfmpegPath();
console.log('Resolved ffmpeg path:', ffmpegPath);
ffmpeg.setFfmpegPath(ffmpegPath);

@Injectable()
export class MediaProcessingService {
  constructor() {}
  private readonly bucketName = 'edquest-test';

  async uploadFile(
    file: Express.Multer.File,
    orgId: string,
    isRaw?: boolean,
  ): Promise<any> {
    try {
      if (!file?.originalname) throw new Error('File is missing');

      const fileKey = getCleanFileKey(file, orgId, isRaw);

      const uploadParams = {
        Bucket: this.bucketName,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      };

      await r2Client.send(new PutObjectCommand(uploadParams));

      // Return CDN or public-accessible URL
      return {
        url: `https://cdn.edquest.app/${fileKey}`,
        key: fileKey,
      };
    } catch (error) {
      console.error('Upload to R2 failed:', error);
      throw new Error('File upload failed');
    }
  }

  async convertAndUploadHLS(
    file: Express.Multer.File,
    orgId: string,
    jobId: string,
  ): Promise<string> {
    let outputDir: string;
    let baseNameSlug: string;

    try {
      const result = await this.processToHLS(file);
      outputDir = result.outputDir;
      baseNameSlug = result.baseNameSlug;

      const masterUrl = await this.uploadHLSOutputToR2(
        outputDir,
        orgId,
        baseNameSlug,
        jobId,
      );

      return masterUrl;
    } catch (error) {
      console.error('HLS conversion failed:', error);
      throw new BadRequestException(`HLS conversion failed: ${error.message}`);
    } finally {
      // Cleanup temporary files
      if (outputDir && fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
    }
  }

  async convertAndUploadHLSAndCleanup(
    jobId: string,
    orgId: string,
  ): Promise<any> {
    let outputDir: string;
    let baseNameSlug: string;
    const tempFilePath = path.join('/tmp', `${jobId}.mp4`); // temp download path

    try {
      //update the status to PROCESSING
      // await this.filesService.updateByJobId(
      //   jobId,
      //   {
      //     status: FileStatus.PROCESSING,
      //   },
      //   orgId,
      // );
      // ✅ Step 1: Download directly from R2 to disk (stream-based, no Buffer concat)
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: jobId,
      });

      const response = await r2Client.send(command);

      if (!response.Body) {
        throw new Error('No Body returned from R2');
      }
      const tempDir = path.dirname(tempFilePath);
      fs.mkdirSync(tempDir, { recursive: true });
      const writeStream = fs.createWriteStream(tempFilePath);

      await new Promise<void>((resolve, reject) => {
        (response.Body as any)
          .pipe(writeStream)
          .on('finish', resolve)
          .on('error', reject);
      });

      // ✅ Step 2: Process to HLS
      const result = await this.processToHLSByPath(tempFilePath);
      outputDir = result.outputDir;
      baseNameSlug = result.baseNameSlug;

      // ✅ Step 3: Upload HLS output to R2
      const masterUrl = await this.uploadHLSOutputToR2(
        outputDir,
        orgId,
        baseNameSlug,
        jobId,
      );

      console.log(`✅ HLS output uploaded to: ${masterUrl}`);
      // ✅ Step 5: Update status to DONE
      // const completedJob = await this.filesService.updateByJobId(
      //   jobId,
      //   {
      //     status: FileStatus.DONE,
      //   },
      //   orgId,
      // );

      try {
        const deleteCmd = new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: jobId,
        });
        await r2Client.send(deleteCmd);
        console.log(`🗑️ Original video deleted from R2: ${jobId}`);
      } catch (deleteError) {
        console.warn(
          '⚠️ Failed to delete original video from R2:',
          deleteError,
        );
      }

      return masterUrl;
    } catch (error: any) {
      console.error('❌ HLS conversion failed:', error);
      throw new BadRequestException(`HLS conversion failed: ${error.message}`);
    } finally {
      // ✅ Step 4: Cleanup
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        if (outputDir && fs.existsSync(outputDir)) {
          fs.rmSync(outputDir, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        console.warn('⚠️ Cleanup failed:', cleanupError);
      }
    }
  }

  private async processToHLS(
    file: Express.Multer.File,
  ): Promise<{ outputDir: string; baseNameSlug: string }> {
    const cleanName = file.originalname.trim().replace(/\s+/g, '-');
    const inputPath = `./tmp/${uuidv4()}-${cleanName}`;
    const baseNameSlug = path.parse(inputPath).name;
    const outputDir = `./tmp/hls-${uuidv4()}`;

    try {
      // Ensure tmp directory exists
      fs.mkdirSync('./tmp', { recursive: true });
      fs.mkdirSync(outputDir, { recursive: true });

      // Write input file
      fs.writeFileSync(inputPath, new Uint8Array(file.buffer));

      // Validate input file exists and has content
      const inputStats = fs.statSync(inputPath);

      if (inputStats.size === 0) {
        throw new Error('Input file is empty');
      }

      // Get video info first to determine available resolutions

      // Filter renditions based on input video resolution
      const availableRenditions = this.getAvailableRenditions();

      if (availableRenditions.length === 0) {
        throw new Error('No suitable renditions available for this video');
      }

      // Create master playlist
      const masterPlaylist = availableRenditions
        .map(
          (r) =>
            `#EXT-X-STREAM-INF:BANDWIDTH=${r.bitrate * 1000},RESOLUTION=${r.resolution}\n${r.name}.m3u8`,
        )
        .join('\n');
      fs.writeFileSync(
        `${outputDir}/master.m3u8`,
        `#EXTM3U\n${masterPlaylist}`,
      );

      // Process each rendition
      await Promise.all(
        availableRenditions.map((r) =>
          this.processRendition(inputPath, outputDir, r),
        ),
      );

      // Cleanup input file
      if (fs.existsSync(inputPath)) {
        fs.unlinkSync(inputPath);
      }

      return { outputDir, baseNameSlug };
    } catch (error) {
      // Cleanup on error
      if (fs.existsSync(inputPath)) {
        fs.unlinkSync(inputPath);
      }
      throw error;
    }
  }

  private async processToHLSByPath(
    inputPath: string,
  ): Promise<{ outputDir: string; baseNameSlug: string }> {
    const baseNameSlug = path.parse(inputPath).name;
    const outputDir = `./tmp/hls-${uuidv4()}`;

    try {
      // Ensure output directory exists
      fs.mkdirSync(outputDir, { recursive: true });

      // Validate input file exists and has content
      if (!fs.existsSync(inputPath)) {
        throw new Error('Input file does not exist');
      }

      const inputStats = fs.statSync(inputPath);
      if (inputStats.size === 0) {
        throw new Error('Input file is empty');
      }

      // Filter renditions based on input video resolution
      const availableRenditions = this.getAvailableRenditions();

      if (availableRenditions.length === 0) {
        throw new Error('No suitable renditions available for this video');
      }

      // Create master playlist
      const masterPlaylist = availableRenditions
        .map(
          (r) =>
            `#EXT-X-STREAM-INF:BANDWIDTH=${r.bitrate * 1000},RESOLUTION=${r.resolution}\n${r.name}.m3u8`,
        )
        .join('\n');

      fs.writeFileSync(
        `${outputDir}/master.m3u8`,
        `#EXTM3U\n${masterPlaylist}`,
      );

      // Process each rendition
      await Promise.all(
        availableRenditions.map((r) =>
          this.processRendition(inputPath, outputDir, r),
        ),
      );

      return { outputDir, baseNameSlug };
    } catch (error) {
      console.error('HLS processing failed:', error);
      throw error;
    }
  }

  private async getVideoInfo(inputPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          console.error('ffprobe error:', err);
          reject(new Error(`Failed to get video info: ${err.message}`));
        } else {
          resolve(metadata);
        }
      });
    });
  }

  private getAvailableRenditions(): {
    resolution: string;
    bitrate: number;
    name: string;
    width: number;
    height: number;
  }[] {
    //storing only 360p, 720p and 1080p renditions
    return [
      {
        resolution: '640x360',
        bitrate: 800,
        name: '360p',
        width: 640,
        height: 360,
      },
      {
        resolution: '1280x720',
        bitrate: 2400,
        name: '720p',
        width: 1280,
        height: 720,
      },
      {
        resolution: '1920x1080',
        bitrate: 4800,
        name: '1080p',
        width: 1920,
        height: 1080,
      },
    ];
  }

  private async processRendition(
    inputPath: string,
    outputDir: string,
    rendition: any,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Parse width and height from resolution string
      const [targetWidth, targetHeight] = rendition.resolution
        .split('x')
        .map(Number);

      const command = ffmpeg(inputPath)
        .addOptions([
          // Fixed filter syntax: scale first, then pad with proper syntax
          `-vf scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black`,
          '-c:v libx264',
          '-preset veryfast',
          `-b:v ${rendition.bitrate}k`,
          '-profile:v main',
          '-level 3.1',
          '-crf 23',
          '-sc_threshold 0',
          '-g 48',
          '-keyint_min 48',
          '-c:a aac',
          '-ar 48000',
          '-b:a 128k',
          '-ac 2',
          '-hls_time 10',
          '-hls_playlist_type vod',
          '-hls_flags independent_segments',
          `-hls_segment_filename ${outputDir}/${rendition.name}_%03d.ts`,
        ])
        .output(`${outputDir}/${rendition.name}.m3u8`)
        .on('end', () => {
          resolve();
        })
        .on('error', (err, stdout, stderr) => {
          console.error(`${rendition.name} conversion failed:`, {
            error: err.message,
            stdout,
            stderr,
          });
          reject(
            new Error(`${rendition.name} conversion failed: ${err.message}`),
          );
        });

      command.run();
    });
  }

  private async uploadHLSOutputToR2(
    outputDir: string,
    orgId: string,
    baseNameSlug: string,
    jobId: string,
  ): Promise<any> {
    const files = fs.readdirSync(outputDir);

    if (files.length === 0) {
      throw new Error('No HLS files generated');
    }

    await Promise.all(
      files.map(async (filename) => {
        const filePath = path.join(outputDir, filename);
        const content = fs.readFileSync(filePath);
        const key = `${orgId}/hls/${baseNameSlug}/${filename}`;

        await r2Client.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: content,
            ContentType: this.getMimeType(filename),
            CacheControl: 'public, max-age=31536000, immutable',
          }),
        );
      }),
    );

    const masterUrl = `https://cdn.edquest.app/${orgId}/hls/${baseNameSlug}/master.m3u8`;
    //save the master url to the db and change the status to done
    // const file = await this.filesService.updateByJobId(
    //   jobId,
    //   { status: FileStatus.DONE, url: masterUrl },
    //   orgId,
    // );
    return masterUrl;
  }

  private getMimeType(filename: string): string {
    if (filename.endsWith('.m3u8')) return 'application/x-mpegURL';
    if (filename.endsWith('.ts')) return 'video/MP2T';
    return 'application/octet-stream';
  }
}

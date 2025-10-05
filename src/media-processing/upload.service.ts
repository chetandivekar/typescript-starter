import { getFileTypeFolder } from './media-processing.service';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { r2Client } from 'src/common/r2.config';

@Injectable()
export class UploadService {
  private readonly bucketName = 'edquest-test';
  async createSignedUpload(
    {
      key,
      contentType,
    }: {
      key: string;
      contentType: string;
    },
    orgId: string,
  ) {
    try {
      const cleanName = key.trim().replace(/\s+/g, '-');
      const ext = path.extname(cleanName).toLowerCase();

      // Determine folder based on MIME type or extension
      const typeFolder = getFileTypeFolder(contentType, ext);

      // Construct organized path: orgId/type/YYYY-MM/file
      const now = new Date();
      const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const validKey = `${orgId}/${typeFolder}/${yyyyMm}/${Date.now()}-${uuidv4()}-${cleanName}`;
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: validKey,
        ContentType: contentType,
      });

      const url = await getSignedUrl(r2Client, command, { expiresIn: 60 * 5 });

      return { url, key: `https://cdn.edquest.app/${validKey}` };
    } catch (error) {
      console.error('Upload to R2 failed:', error);
      throw error;
    }
  }
}

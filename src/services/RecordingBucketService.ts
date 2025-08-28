import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';

dotenv.config();

export default class RecordingBucketService {
    private s3Client: S3Client;

    constructor() {
        this.s3Client = new S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
            }
        });
    }

    async generatePresignedUrl(key: string, bucketName: string): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key
        });

        return await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    }

    async downloadFromBucket(key: string, bucketName: string): Promise<Buffer> {
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key
        });

        const response = await this.s3Client.send(command);
        const stream = response.Body as any;

        return new Promise<Buffer>((resolve, reject) => {
            const chunks: Uint8Array[] = [];
            stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
            stream.on('error', reject);
            stream.on('end', () => resolve(Buffer.concat(chunks)));
        });
    }
}


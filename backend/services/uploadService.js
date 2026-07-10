const cloudinary = require('cloudinary').v2;
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

// Cloudflare R2 setup
let s3Client = null;
if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
    s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
    });
}

/**
 * Uploads an image to Cloudinary
 * @param {string} filePath - The local path of the file to upload
 * @returns {Promise<string>} - The public URL of the uploaded image
 */
async function uploadImageToCloudinary(filePath) {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
        throw new Error('Cloudinary is not configured');
    }
    
    try {
        const result = await cloudinary.uploader.upload(filePath, {
            folder: 'unichat_uploads',
            resource_type: 'image'
        });
        return result.secure_url;
    } catch (error) {
        console.error("Cloudinary upload error:", error);
        throw error;
    }
}

/**
 * Uploads a video to Cloudflare R2
 * @param {string} filePath - The local path of the file to upload
 * @param {string} originalName - The original name of the file
 * @returns {Promise<string>} - The public URL of the uploaded video
 */
async function uploadVideoToR2(filePath, originalName) {
    if (!s3Client || !process.env.R2_BUCKET_NAME) {
        throw new Error('Cloudflare R2 is not configured');
    }

    try {
        const fileStream = fs.createReadStream(filePath);
        const extension = path.extname(originalName) || '';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const key = `videos/${uniqueSuffix}${extension}`;
        
        const contentType = mime.lookup(filePath) || 'video/mp4';

        const uploadParams = {
            Bucket: process.env.R2_BUCKET_NAME,
            Key: key,
            Body: fileStream,
            ContentType: contentType
        };

        await s3Client.send(new PutObjectCommand(uploadParams));

        // Construct the public URL
        const publicDomain = process.env.R2_PUBLIC_DOMAIN;
        if (publicDomain) {
            return `${publicDomain.startsWith('http') ? '' : 'https://'}${publicDomain}/${key}`;
        } else {
            // Fallback (Note: R2 URLs require public access setup or signed URLs, 
            // usually you need a custom domain for public read access)
            return `https://${process.env.R2_BUCKET_NAME}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
        }
    } catch (error) {
        console.error("R2 upload error:", error);
        throw error;
    }
}

/**
 * Utility to delete local file
 */
function deleteLocalFile(filePath) {
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) console.error(`Failed to delete local file ${filePath}:`, err);
        });
    }
}

module.exports = {
    uploadImageToCloudinary,
    uploadVideoToR2,
    deleteLocalFile
};

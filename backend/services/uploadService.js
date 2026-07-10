const cloudinary = require('cloudinary').v2;
const fs = require('fs');

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
 * Uploads a video to Cloudinary
 * @param {string} filePath - The local path of the file to upload
 * @returns {Promise<string>} - The public URL of the uploaded video
 */
async function uploadVideoToCloudinary(filePath) {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
        throw new Error('Cloudinary is not configured');
    }
    
    try {
        const result = await cloudinary.uploader.upload(filePath, {
            folder: 'unichat_uploads',
            resource_type: 'video'
        });
        return result.secure_url;
    } catch (error) {
        console.error("Cloudinary video upload error:", error);
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
    uploadVideoToCloudinary,
    deleteLocalFile
};

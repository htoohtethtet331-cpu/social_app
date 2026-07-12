require('dotenv').config();
const { Storage } = require('@google-cloud/storage');

async function createBucket() {
    try {
        const storage = new Storage({
            projectId: process.env.GCS_PROJECT_ID,
            credentials: {
                client_email: process.env.GCS_CLIENT_EMAIL,
                private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
        });

        const bucketName = process.env.GCS_BUCKET_NAME;
        const bucket = storage.bucket(bucketName);
        
        const [exists] = await bucket.exists();
        if (!exists) {
            console.log(`Creating bucket ${bucketName}...`);
            await storage.createBucket(bucketName, {
                location: 'US',
                storageClass: 'STANDARD',
            });
            console.log(`Bucket ${bucketName} created.`);
        } else {
            console.log(`Bucket ${bucketName} already exists.`);
        }
        
        // Make bucket public (we want images to be publicly readable)
        console.log(`Making bucket ${bucketName} public...`);
        // Note: makePublic() applies to the entire bucket
        await bucket.makePublic();
        console.log(`Bucket ${bucketName} is now public.`);
        
        // Configure CORS so frontend can upload directly via PUT
        console.log(`Configuring CORS for ${bucketName}...`);
        await bucket.setCorsConfiguration([
            {
                maxAgeSeconds: 3600,
                method: ['GET', 'PUT', 'POST', 'OPTIONS'],
                origin: ['*'],
                responseHeader: ['Content-Type', 'x-goog-resumable'],
            }
        ]);
        console.log(`CORS configured successfully.`);
        
    } catch (err) {
        console.error('Error initializing GCS bucket:', err);
    }
}

createBucket();

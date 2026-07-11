require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const Post = require('./models/Post');
const Like = require('./models/Like');

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error(err));

async function migrate() {
    try {
        console.log('Starting like migration...');
        // Find all likes
        const likes = await Like.find();
        console.log(`Found ${likes.length} likes in Like collection.`);
        
        let count = 0;
        for (let like of likes) {
            const post = await Post.findById(like.post_id);
            if (post) {
                if (!post.likes.includes(like.user_id)) {
                    post.likes.push(like.user_id);
                    post.like_count = post.likes.length;
                    await post.save();
                    count++;
                }
            }
        }
        console.log(`Successfully migrated ${count} unique likes to Post documents.`);
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();

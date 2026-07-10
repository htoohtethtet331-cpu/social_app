const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Models
const User = require('./models/User');
const Post = require('./models/Post');
const Like = require('./models/Like');
const Comment = require('./models/Comment');
const Story = require('./models/Story');
const StoryLike = require('./models/StoryLike');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '../frontend')));

// Ensure local uploads directory exists
if (!fs.existsSync('uploads')){
    fs.mkdirSync('uploads');
}

// Cloudinary Configuration
if (process.env.CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
}

let storage;
if (process.env.CLOUDINARY_CLOUD_NAME) {
    storage = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: 'unichat_uploads',
            allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'mp4', 'mov']
        }
    });
} else {
    storage = multer.diskStorage({
        destination: path.join(__dirname, 'uploads'),
        filename: function(req, file, cb) {
            cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
        }
    });
}
const upload = multer({ storage: storage });

// Database Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/unichat')
  .then(() => console.log('Connected to MongoDB.'))
  .catch(err => console.error('MongoDB connection error:', err));


// --- API Routes ---

// 1. Authenticate / Register User
app.post('/api/auth', async (req, res) => {
    const { telegram_id, username, photo_url } = req.body;
    try {
        let user = await User.findOne({ telegram_id });
        if (!user) {
            user = await User.create({ telegram_id, username, photo_url, bio: '', last_active: Date.now() });
        } else {
            user.last_active = Date.now();
            await user.save();
        }
        res.json({ user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1.5 Ping Active Status
app.post('/api/ping', async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });
    try {
        await User.findByIdAndUpdate(user_id, { last_active: Date.now() });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Upload Profile Photo
app.post('/api/upload-profile', upload.single('photo'), async (req, res) => {
    const user_id = req.body.user_id;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const photo_url = (req.file.path && req.file.path.startsWith('http')) ? req.file.path : ('/uploads/' + req.file.filename);

    try {
        const user = await User.findByIdAndUpdate(user_id, { photo_url }, { new: true });
        res.json({ success: true, photo_url: user.photo_url, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Upload Cover Photo
app.post('/api/upload-cover', upload.single('cover'), async (req, res) => {
    const user_id = req.body.user_id;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const cover_url = (req.file.path && req.file.path.startsWith('http')) ? req.file.path : ('/uploads/' + req.file.filename);

    try {
        const user = await User.findByIdAndUpdate(user_id, { cover_url }, { new: true });
        res.json({ success: true, cover_url: user.cover_url, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Skip Photo Upload
app.post('/api/skip-profile', async (req, res) => {
    const user_id = req.body.user_id;
    try {
        const user = await User.findByIdAndUpdate(user_id, { photo_url: 'default' }, { new: true });
        res.json({ success: true, photo_url: user.photo_url, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Create a Post
app.post('/api/posts', upload.single('image'), async (req, res) => {
    const { user_id, content } = req.body;
    if (!user_id || (!content && !req.file)) return res.status(400).json({ error: 'Content or image required' });

    let image_url = null;
    if (req.file) {
        image_url = (req.file.path && req.file.path.startsWith('http')) ? req.file.path : ('/uploads/' + req.file.filename);
    }

    try {
        let post = await Post.create({ user_id, content: content || '', image_url });
        post = await post.populate('user_id', 'username photo_url last_active');
        res.json({
            post: {
                id: post._id,
                user_id: post.user_id._id,
                username: post.user_id.username,
                photo_url: post.user_id.photo_url,
                last_active: post.user_id.last_active,
                content: post.content,
                image_url: post.image_url,
                created_at: post.created_at,
                likes: 0,
                comments: 0,
                liked_by_user: 0
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Get All Posts (Feed)
app.get('/api/posts', async (req, res) => {
    const user_id = req.query.user_id;
    
    try {
        const posts = await Post.find().populate('user_id', 'username photo_url last_active').sort({ created_at: -1 });
        const postIds = posts.map(p => p._id);
        
        const likes = await Like.aggregate([
            { $match: { post_id: { $in: postIds } } },
            { $group: { _id: "$post_id", count: { $sum: 1 } } }
        ]);
        
        let userLikeSet = new Set();
        if (user_id) {
            const userLikes = await Like.find({ user_id, post_id: { $in: postIds } });
            userLikes.forEach(l => userLikeSet.add(l.post_id.toString()));
        }

        const comments = await Comment.aggregate([
            { $match: { post_id: { $in: postIds } } },
            { $group: { _id: "$post_id", count: { $sum: 1 } } }
        ]);

        const formatPosts = posts.map(post => {
            const likeData = likes.find(l => l._id.toString() === post._id.toString());
            const commentData = comments.find(c => c._id.toString() === post._id.toString());
            return {
                id: post._id,
                user_id: post.user_id ? post.user_id._id : null,
                username: post.user_id ? post.user_id.username : 'Unknown',
                photo_url: post.user_id ? post.user_id.photo_url : null,
                last_active: post.user_id ? post.user_id.last_active : null,
                content: post.content,
                image_url: post.image_url,
                created_at: post.created_at,
                like_count: likeData ? likeData.count : 0,
                comment_count: commentData ? commentData.count : 0,
                has_liked: userLikeSet.has(post._id.toString()) ? 1 : 0
            };
        });
        
        res.json({ posts: formatPosts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Toggle Like on a Post
app.post('/api/posts/:id/like', async (req, res) => {
    const post_id = req.params.id;
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });

    try {
        const existing = await Like.findOne({ post_id, user_id });
        if (existing) {
            await Like.deleteOne({ _id: existing._id });
            res.json({ success: true, liked: false });
        } else {
            await Like.create({ post_id, user_id });
            res.json({ success: true, liked: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7.1 Get Likes for a Post
app.get('/api/posts/:id/likes', async (req, res) => {
    const post_id = req.params.id;
    try {
        const likes = await Like.find({ post_id }).populate('user_id', 'username photo_url');
        const formattedLikes = likes.map(l => ({
            user_id: l.user_id._id,
            username: l.user_id.username,
            photo_url: l.user_id.photo_url
        }));
        res.json({ likes: formattedLikes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. Add a Comment
app.post('/api/posts/:id/comments', async (req, res) => {
    const postId = req.params.id;
    const { user_id, content, parent_id } = req.body;
    if (!user_id || !content) return res.status(400).json({ error: 'User ID and content required' });

    try {
        let comment = await Comment.create({ post_id: postId, user_id, content, parent_id: parent_id || null });
        comment = await comment.populate('user_id', 'username photo_url');
        res.json({
            comment: {
                id: comment._id,
                post_id: comment.post_id,
                user_id: comment.user_id ? comment.user_id._id : null,
                username: comment.user_id ? comment.user_id.username : 'Unknown',
                photo_url: comment.user_id ? comment.user_id.photo_url : null,
                content: comment.content,
                parent_id: comment.parent_id,
                created_at: comment.created_at
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Comments for a Post
app.get('/api/posts/:id/comments', async (req, res) => {
    try {
        const comments = await Comment.find({ post_id: req.params.id }).populate('user_id', 'username photo_url').sort({ created_at: 1 });
        const formatComments = comments.map(c => ({
            id: c._id,
            post_id: c.post_id,
            user_id: c.user_id ? c.user_id._id : null,
            username: c.user_id ? c.user_id.username : 'Unknown',
            photo_url: c.user_id ? c.user_id.photo_url : null,
            content: c.content,
            parent_id: c.parent_id,
            created_at: c.created_at
        }));
        res.json({ comments: formatComments });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all users
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().select('id username photo_url bio last_active');
        res.json({ users });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9. Get User Profile
app.get('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('id username photo_url cover_url bio last_active');
        const posts_count = await Post.countDocuments({ user_id: req.params.id });
        res.json({ user, posts_count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 10. Get User's Posts
app.get('/api/users/:id/posts', async (req, res) => {
    const current_user_id = req.query.user_id;
    const target_user_id = req.params.id;

    try {
        const posts = await Post.find({ user_id: target_user_id }).populate('user_id', 'username photo_url').sort({ created_at: -1 });
        const postIds = posts.map(p => p._id);
        
        const likes = await Like.aggregate([
            { $match: { post_id: { $in: postIds } } },
            { $group: { _id: "$post_id", count: { $sum: 1 } } }
        ]);
        
        let userLikeSet = new Set();
        if (current_user_id) {
            const userLikes = await Like.find({ user_id: current_user_id, post_id: { $in: postIds } });
            userLikes.forEach(l => userLikeSet.add(l.post_id.toString()));
        }

        const comments = await Comment.aggregate([
            { $match: { post_id: { $in: postIds } } },
            { $group: { _id: "$post_id", count: { $sum: 1 } } }
        ]);

        const formatPosts = posts.map(post => {
            const likeData = likes.find(l => l._id.toString() === post._id.toString());
            const commentData = comments.find(c => c._id.toString() === post._id.toString());
            return {
                id: post._id,
                user_id: post.user_id ? post.user_id._id : null,
                username: post.user_id ? post.user_id.username : 'Unknown',
                photo_url: post.user_id ? post.user_id.photo_url : null,
                content: post.content,
                image_url: post.image_url,
                created_at: post.created_at,
                like_count: likeData ? likeData.count : 0,
                comment_count: commentData ? commentData.count : 0,
                has_liked: userLikeSet.has(post._id.toString()) ? 1 : 0
            };
        });
        
        res.json({ posts: formatPosts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 11. Edit User Bio
app.put('/api/users/:id/bio', async (req, res) => {
    const { bio } = req.body;
    try {
        await User.findByIdAndUpdate(req.params.id, { bio: bio || '' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 12. Create Story
app.post('/api/stories', upload.single('media'), async (req, res) => {
    const { user_id } = req.body;
    if (!req.file || !user_id) return res.status(400).json({ error: 'User ID and media file required' });

    const media_url = (req.file.path && req.file.path.startsWith('http')) ? req.file.path : ('/uploads/' + req.file.filename);
    const media_type = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

    try {
        const story = await Story.create({ user_id, media_url, media_type });
        res.json({ success: true, story });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 13. Get Active Stories for a User
app.get('/api/users/:id/stories', async (req, res) => {
    const userId = req.params.id;

    try {
        const user = await User.findById(userId).select('id username photo_url');
        if (!user) return res.status(404).json({ error: 'User not found' });

        const stories = await Story.find({ user_id: userId }).sort({ created_at: 1 });
        res.json({ user, stories });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 14. Toggle Story Like
app.post('/api/stories/:id/like', async (req, res) => {
    const storyId = req.params.id;
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });

    try {
        const existing = await StoryLike.findOne({ story_id: storyId, user_id });
        if (existing) {
            await StoryLike.deleteOne({ _id: existing._id });
            res.json({ success: true, liked: false });
        } else {
            await StoryLike.create({ story_id: storyId, user_id });
            res.json({ success: true, liked: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 15. Get Story Likes Count
app.get('/api/stories/:id/likes', async (req, res) => {
    const storyId = req.params.id;
    const user_id = req.query.user_id;

    try {
        const count = await StoryLike.countDocuments({ story_id: storyId });
        let liked_by_user = false;
        if (user_id) {
            const existing = await StoryLike.findOne({ story_id: storyId, user_id });
            liked_by_user = !!existing;
        }
        res.json({ likes: count, liked_by_user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 16. Get All Users with Active Stories
app.get('/api/stories', async (req, res) => {
    try {
        const stories = await Story.find().populate('user_id', 'username photo_url');
        
        const grouped = {};
        stories.forEach(story => {
            if (!story.user_id) return;
            const uid = story.user_id._id.toString();
            if (!grouped[uid]) {
                grouped[uid] = {
                    id: uid,
                    username: story.user_id.username,
                    photo_url: story.user_id.photo_url,
                    has_unseen: true
                };
            }
        });
        
        res.json({ users_with_stories: Object.values(grouped) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Fallback route for frontend
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    const interfaces = require('os').networkInterfaces();
    for (let name of Object.keys(interfaces)) {
        for (let iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                console.log(`Network access: http://${iface.address}:${PORT}`);
            }
        }
    }
});

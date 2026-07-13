const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

// Models
const User = require('./models/User');
const Post = require('./models/Post');
const Like = require('./models/Like');
const Comment = require('./models/Comment');
const Story = require('./models/Story');
const StoryLike = require('./models/StoryLike');
const Favorite = require('./models/Favorite');
const Notification = require('./models/Notification');
const Follow = require('./models/Follow');
const Highlight = require('./models/Highlight');

const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
// Attach io to req object to use in routes
app.use((req, res, next) => {
    req.io = io;
    next();
});


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

const { uploadImageToCloudinary, uploadVideoToCloudinary, deleteLocalFile } = require('./services/uploadService');

let storage = multer.diskStorage({
    destination: path.join(__dirname, 'uploads'),
    filename: function(req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Database Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/unichat')
  .then(() => console.log('Connected to MongoDB.'))
  .catch(err => console.error('MongoDB connection error:', err));


// --- Telegram Bot Helper ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramNotification(userId, message) {
    try {
        const user = await User.findById(userId);
        if (user && user.telegram_id) {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: user.telegram_id,
                    text: message
                })
            });
        }
    } catch (err) {
        console.error("Failed to send Telegram notification:", err);
    }
}

// --- API Routes ---

// --- Notifications APIs ---

// Get Notifications
app.get('/api/notifications', async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });
    try {
        const notifications = await Notification.find({ receiver_id: user_id })
            .sort({ created_at: -1 })
            .populate('actor_id', 'username display_name photo_url');
        res.json({ notifications });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mark Notifications as Read
app.put('/api/notifications/read', async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });
    try {
        await Notification.updateMany({ receiver_id: user_id, status: 'unread' }, { status: 'read' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Routes
app.use('/api/admin', require('./routes/adminRoutes'));

// 1. Authenticate / Register User

// --- Search Engine Utility Functions ---
// Levenshtein Distance for Fuzzy Search Fallback
function getLevenshteinDistance(a, b) {
    const matrix = [];
    let i, j;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    for (i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(matrix[i][j - 1] + 1, // insertion
                             matrix[i - 1][j] + 1) // deletion
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function calculateFuzzyScore(text, query) {
    if (!text) return 0;
    const textLower = text.toLowerCase();
    const queryLower = query.toLowerCase();
    if (textLower.includes(queryLower)) return 100; // Exact partial match
    
    // Check word by word
    const textWords = textLower.split(/\s+/);
    const queryWords = queryLower.split(/\s+/);
    
    let totalScore = 0;
    for (const qw of queryWords) {
        let bestWordScore = 0;
        for (const tw of textWords) {
            const dist = getLevenshteinDistance(qw, tw);
            const maxLength = Math.max(qw.length, tw.length);
            const similarity = ((maxLength - dist) / maxLength) * 100;
            if (similarity > bestWordScore) {
                bestWordScore = similarity;
            }
        }
        totalScore += bestWordScore;
    }
    return totalScore / queryWords.length;
}

// Search Posts Endpoint
app.get('/api/posts/search', async (req, res) => {
    const { q, current_user_id } = req.query;
    if (!q) return res.json({ posts: [] });

    try {
        // 1. Primary Text Search (Inverted Index)
        let dbPosts = await Post.find(
            { $text: { $search: q } },
            { score: { $meta: "textScore" } }
        )
        .sort({ score: { $meta: "textScore" } })
        .populate('user_id', 'username display_name photo_url last_active')
        .limit(50);

        // 2. Fuzzy Search Fallback (if no exact text matches found or very few)
        if (dbPosts.length < 5) {
            const recentPosts = await Post.find()
                .sort({ created_at: -1 })
                .limit(200)
                .populate('user_id', 'username display_name photo_url last_active');
            
            const fuzzyResults = recentPosts.map(post => {
                const score = calculateFuzzyScore(post.content, q);
                return { post, score };
            }).filter(item => item.score > 60) // Threshold for fuzzy match
            .sort((a, b) => b.score - a.score);
            
            // Merge results avoiding duplicates
            const existingIds = new Set(dbPosts.map(p => p._id.toString()));
            for (const item of fuzzyResults) {
                if (!existingIds.has(item.post._id.toString())) {
                    // Inject a mock textScore for ranking
                    item.post = item.post.toObject();
                    item.post.score = item.score / 100; 
                    dbPosts.push(item.post);
                    existingIds.add(item.post._id.toString());
                }
            }
        }

        const formattedPosts = await Promise.all(dbPosts.map(async post => {
            const has_liked = current_user_id ? post.likes?.includes(current_user_id) : false;
            let comment_count = 0;
            try {
                comment_count = await Comment.countDocuments({ post_id: post._id });
            } catch(e) {}
            
            const has_favorited = current_user_id ? await Favorite.exists({ user_id: current_user_id, post_id: post._id }) : false;

            // Ranking Logic: Combine Relevance Score + Engagement + Recency
            let relevanceScore = post.score || 1; // from textScore or fuzzy
            let engagementScore = (post.like_count || 0) * 0.5 + (comment_count * 0.5);
            
            const daysOld = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60 * 24);
            let recencyScore = Math.max(0, 10 - daysOld); // Bonus points for newer posts

            let totalRankScore = relevanceScore * 10 + engagementScore + recencyScore;

            return {
                id: post._id || post.id,
                user_id: post.user_id._id,
                username: post.user_id.username, display_name: post.user_id.display_name,
                photo_url: post.user_id.photo_url,
                is_active: post.user_id.last_active ? (Date.now() - new Date(post.user_id.last_active).getTime() < 300000) : false,
                content: post.content,
                image_urls: post.image_urls,
                image_url: post.image_url,
                layout_type: post.layout_type,
                like_count: post.like_count || 0,
                comment_count: comment_count,
                has_liked: has_liked,
                has_favorited: !!has_favorited,
                created_at: post.created_at,
                rank_score: totalRankScore
            };
        }));

        // Sort by our custom Ranking Score
        formattedPosts.sort((a, b) => b.rank_score - a.rank_score);

        res.json({ posts: formattedPosts });
    } catch (err) {
        console.error("Search error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Auto-complete / Suggestion Endpoint
app.get('/api/posts/suggest', async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ suggestions: [] });

    try {
        // Quick regex search for auto-complete
        const regex = new RegExp(q, 'i');
        const dbPosts = await Post.find({ content: regex })
            .sort({ created_at: -1 })
            .limit(5)
            .select('content');

        const suggestions = dbPosts.map(p => {
            // Extract a snippet containing the keyword
            const text = p.content;
            const index = text.toLowerCase().indexOf(q.toLowerCase());
            let snippet = text;
            if (index !== -1) {
                const start = Math.max(0, index - 20);
                const end = Math.min(text.length, index + q.length + 20);
                snippet = (start > 0 ? "..." : "") + text.substring(start, end) + (end < text.length ? "..." : "");
            }
            return { id: p._id, snippet };
        });

        res.json({ suggestions });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

app.get('/api/cloudinary-signature', (req, res) => {
    try {
        const timestamp = Math.round((new Date).getTime() / 1000);
        const signature = cloudinary.utils.api_sign_request({
            timestamp: timestamp,
            folder: 'unichat_uploads'
        }, process.env.CLOUDINARY_API_SECRET);
        
        res.json({
            signature: signature,
            timestamp: timestamp,
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate signature' });
    }
});

app.post('/api/upload-profile', upload.single('photo'), async (req, res) => {
    const user_id = req.body.user_id;
    let photo_url = req.body.photo_url;
    
    if (!photo_url && req.file) {
        try {
            photo_url = await uploadImageToCloudinary(req.file.path);
        } catch (err) {
            deleteLocalFile(req.file.path);
            return res.status(500).json({ error: 'Failed to upload photo' });
        }
        deleteLocalFile(req.file.path);
    }
    if (!photo_url) return res.status(400).json({ error: 'No photo provided' });

    try {
        const user = await User.findByIdAndUpdate(user_id, { photo_url }, { new: true });
        res.json({ success: true, photo_url: user.photo_url, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/upload-cover', upload.single('cover'), async (req, res) => {
    const user_id = req.body.user_id;
    let cover_url = req.body.cover_url;
    
    if (!cover_url && req.file) {
        try {
            cover_url = await uploadImageToCloudinary(req.file.path);
        } catch (err) {
            deleteLocalFile(req.file.path);
            return res.status(500).json({ error: 'Failed to upload cover' });
        }
        deleteLocalFile(req.file.path);
    }
    if (!cover_url) return res.status(400).json({ error: 'No cover provided' });

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

app.post('/api/posts', upload.array('images', 100), async (req, res) => {
    const { user_id, content, layout_type } = req.body;
    let image_urls = req.body.image_urls;
    if (typeof image_urls === 'string') {
        try { image_urls = JSON.parse(image_urls); } catch(e) { image_urls = [image_urls]; }
    }
    if (!image_urls) image_urls = [];

    if (!user_id || (!content && (!req.files || req.files.length === 0) && image_urls.length === 0)) return res.status(400).json({ error: 'Content or images required' });
    if (req.files && req.files.length > 0) {
        for (const file of req.files) {
            try {
                let fileUrl = '';
                if (file.mimetype.startsWith('video/')) {
                    fileUrl = await uploadVideoToCloudinary(file.path);
                } else {
                    fileUrl = await uploadImageToCloudinary(file.path);
                }
                image_urls.push(fileUrl);
            } catch (err) {
                console.error("Failed to upload file:", err);
            } finally {
                deleteLocalFile(file.path);
            }
        }
    }

    try {
        let post = await Post.create({ 
            user_id, 
            content: content || '', 
            image_urls,
            image_url: image_urls.length > 0 ? image_urls[0] : null,
            layout_type: layout_type || 'single'
        });
        post = await post.populate('user_id', 'username display_name photo_url last_active');
        const newPost = {
            id: post._id,
            user_id: post.user_id._id,
            username: post.user_id.username, display_name: post.user_id.display_name,
            photo_url: post.user_id.photo_url,
            is_active: post.user_id.last_active ? (Date.now() - new Date(post.user_id.last_active).getTime() < 300000) : false,
            content: post.content,
            image_urls: post.image_urls,
            image_url: post.image_url,
            layout_type: post.layout_type,
            created_at: post.created_at,
            like_count: 0,
            comment_count: 0,
            has_liked: 0
        };
        req.io.emit('new_post', newPost);
        res.json({ post: newPost });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Get All Posts (Feed)
app.get('/api/posts', async (req, res) => {
    const user_id = req.query.user_id;
    
    try {
        const posts = await Post.find().populate('user_id', 'username display_name photo_url last_active').sort({ created_at: -1 });
        const postIds = posts.map(p => p._id);
        
        let userFavoriteSet = new Set();
        if (user_id) {
            const userFavorites = await Favorite.find({ user_id, post_id: { $in: postIds } });
            userFavorites.forEach(f => userFavoriteSet.add(f.post_id.toString()));
        }

        const comments = await Comment.aggregate([
            { $match: { post_id: { $in: postIds } } },
            { $group: { _id: "$post_id", count: { $sum: 1 } } }
        ]);

        const formatPosts = posts.map(post => {
            const commentData = comments.find(c => c._id.toString() === post._id.toString());
            return {
                id: post._id,
                user_id: post.user_id ? post.user_id._id : null,
                username: post.user_id ? post.user_id.username : 'Unknown', display_name: post.user_id ? post.user_id.display_name : '',
                photo_url: post.user_id ? post.user_id.photo_url : null,
                is_active: post.user_id && post.user_id.last_active ? (Date.now() - new Date(post.user_id.last_active).getTime() < 300000) : false,
                content: post.content,
                image_urls: post.image_urls,
                image_url: post.image_url,
                layout_type: post.layout_type,
                created_at: post.created_at,
                like_count: post.like_count || 0,
                comment_count: commentData ? commentData.count : 0,
                has_liked: (user_id && post.likes && post.likes.includes(user_id)) ? 1 : 0,
                has_favorited: userFavoriteSet.has(post._id.toString()) ? 1 : 0
            };
        });
        
        res.json({ posts: formatPosts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Advanced Like System: Message Queue & Processor
class LikeQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
    }

    add(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ ...task, resolve, reject });
            this.process();
        });
    }

    async process() {
        if (this.isProcessing || this.queue.length === 0) return;
        this.isProcessing = true;

        while (this.queue.length > 0) {
            const task = this.queue.shift();
            try {
                const result = await this.processTask(task);
                task.resolve(result);
            } catch (err) {
                task.reject(err);
            }
        }
        
        this.isProcessing = false;
    }

    async processTask({ post_id, user_id, action, io }) {
        const post = await Post.findById(post_id);
        if (!post) throw new Error('Post not found');
        
        const alreadyLiked = post.likes.includes(user_id);
        
        let updatedPost;
        let liked = alreadyLiked;

        if (action === 'like' && !alreadyLiked) {
            updatedPost = await Post.findByIdAndUpdate(post_id, {
                $addToSet: { likes: user_id },
                $inc: { like_count: 1 }
            }, { new: true });
            liked = true;

            // Notification Logic
            if (post.user_id.toString() !== user_id) {
                const notif = await Notification.create({
                    receiver_id: post.user_id,
                    actor_id: user_id,
                    type: 'like',
                    post_id: post._id
                });
                const populatedNotif = await notif.populate('actor_id', 'username display_name photo_url');
                io.emit(`new_notification_${post.user_id}`, populatedNotif);
                sendTelegramNotification(post.user_id, `${populatedNotif.actor_id.username} liked your post.`);
            }
        } else if (action === 'unlike' && alreadyLiked) {
            updatedPost = await Post.findByIdAndUpdate(post_id, {
                $pull: { likes: user_id },
                $inc: { like_count: -1 }
            }, { new: true });
            liked = false;
        } else {
            // Idempotent: Nothing changed
            updatedPost = post;
        }

        const currentLikes = updatedPost.like_count;
        io.emit('post_liked', { post_id, likes: currentLikes });
        return { success: true, liked, likes: currentLikes };
    }
}

const postLikeQueue = new LikeQueue();

// 7. Toggle Like on a Post (Using Queue)
app.post('/api/posts/:id/like', async (req, res) => {
    const post_id = req.params.id;
    const { user_id, action } = req.body; // action should be 'like' or 'unlike'
    if (!user_id) return res.status(400).json({ error: 'User ID required' });
    if (!['like', 'unlike'].includes(action)) return res.status(400).json({ error: 'Action must be like or unlike' });

    try {
        const result = await postLikeQueue.add({ post_id, user_id, action, io: req.io });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7b. Toggle Favorite on a Post
app.post('/api/posts/:id/favorite', async (req, res) => {
    const post_id = req.params.id;
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });

    try {
        const existing = await Favorite.findOne({ post_id, user_id });
        let favorited = false;
        if (existing) {
            await Favorite.deleteOne({ _id: existing._id });
        } else {
            await Favorite.create({ post_id, user_id });
            favorited = true;
            
            // Notification logic
            const post = await Post.findById(post_id);
            if (post && post.user_id.toString() !== user_id) {
                const notif = await Notification.create({
                    receiver_id: post.user_id,
                    actor_id: user_id,
                    type: 'favorite',
                    post_id: post._id
                });
                const populatedNotif = await notif.populate('actor_id', 'username display_name photo_url');
                req.io.emit(`new_notification_${post.user_id}`, populatedNotif);
                sendTelegramNotification(post.user_id, `${populatedNotif.actor_id.username} favorited your post.`);
            }
        }
        res.json({ success: true, favorited });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7c. Get User Favorites
app.get('/api/favorites', async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });

    try {
        const favorites = await Favorite.find({ user_id }).populate({
            path: 'post_id',
            populate: { path: 'user_id', select: 'username display_name photo_url last_active' }
        }).sort({ created_at: -1 });
        
        const validFavorites = favorites.filter(f => f.post_id != null);
        const postIds = validFavorites.map(f => f.post_id._id);

        const comments = await Comment.aggregate([
            { $match: { post_id: { $in: postIds } } },
            { $group: { _id: "$post_id", count: { $sum: 1 } } }
        ]);

        const formatPosts = validFavorites.map(fav => {
            const post = fav.post_id;
            const commentData = comments.find(c => c._id.toString() === post._id.toString());
            return {
                id: post._id,
                user_id: post.user_id ? post.user_id._id : null,
                username: post.user_id ? post.user_id.username : 'Unknown', display_name: post.user_id ? post.user_id.display_name : '',
                photo_url: post.user_id ? post.user_id.photo_url : null,
                is_active: post.user_id && post.user_id.last_active ? (Date.now() - new Date(post.user_id.last_active).getTime() < 300000) : false,
                content: post.content,
                image_urls: post.image_urls,
                image_url: post.image_url,
                layout_type: post.layout_type,
                created_at: post.created_at,
                like_count: post.like_count || 0,
                comment_count: commentData ? commentData.count : 0,
                has_liked: (user_id && post.likes && post.likes.includes(user_id)) ? 1 : 0,
                has_favorited: 1 // If it's in favorites list, it is favorited
            };
        });
        
        res.json({ posts: formatPosts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7.1 Get Likes for a Post
app.get('/api/posts/:id/likes', async (req, res) => {
    const post_id = req.params.id;
    try {
        const post = await Post.findById(post_id).populate('likes', 'username display_name photo_url');
        if (!post) return res.status(404).json({ error: 'Post not found' });
        
        const formattedLikes = post.likes.map(user => ({
            user_id: user._id,
            username: user.username, display_name: user.display_name,
            photo_url: user.photo_url
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
        let actualParentId = parent_id || null;
        let actualRepliedToUserId = null;
        
        if (parent_id) {
            const parentComment = await Comment.findById(parent_id);
            if (parentComment) {
                if (parentComment.parent_id) {
                    // Flattening Logic: If replying to a reply, use the root's ID as parent
                    actualParentId = parentComment.parent_id;
                } else {
                    // Replying to a root comment
                    actualParentId = parentComment._id;
                }
                // We are targeting the author of the comment we clicked "Reply" on
                actualRepliedToUserId = parentComment.user_id;
            }
        }
        
        let comment = await Comment.create({ post_id: postId, user_id, content, parent_id: actualParentId, replied_to_user_id: actualRepliedToUserId });
        comment = await comment.populate('user_id', 'username display_name photo_url');
        if (comment.replied_to_user_id) {
            comment = await comment.populate('replied_to_user_id', 'username display_name');
        }
        
        const formattedComment = {
            id: comment._id,
            post_id: comment.post_id,
            user_id: comment.user_id ? comment.user_id._id : null,
            username: comment.user_id ? comment.user_id.username : 'Unknown', display_name: comment.user_id ? comment.user_id.display_name : '',
            photo_url: comment.user_id ? comment.user_id.photo_url : null,
            content: comment.content,
            parent_id: comment.parent_id,
            replied_to_username: comment.replied_to_user_id ? comment.replied_to_user_id.username : null, replied_to_display_name: comment.replied_to_user_id ? comment.replied_to_user_id.display_name : '',
            created_at: comment.created_at
        };
        const count = await Comment.countDocuments({ post_id: postId });
        req.io.emit('new_comment', { post_id: postId, comment: formattedComment, comments: count });
        
        // Notification logic
        const post = await Post.findById(postId);
        
        // Target: Replied User
        if (actualRepliedToUserId && actualRepliedToUserId.toString() !== user_id) {
            const notif = await Notification.create({
                receiver_id: actualRepliedToUserId,
                actor_id: user_id,
                type: 'reply',
                post_id: post._id,
                comment_id: comment._id
            });
            const populatedNotif = await notif.populate('actor_id', 'username display_name photo_url');
            req.io.emit(`new_notification_${actualRepliedToUserId}`, populatedNotif);
            sendTelegramNotification(actualRepliedToUserId, `${populatedNotif.actor_id.username} replied to your comment.`);
        }
        
        // Target: Post Owner (only if they are not the ones who just got notified as the replied user)
        if (post && post.user_id.toString() !== user_id && post.user_id.toString() !== (actualRepliedToUserId ? actualRepliedToUserId.toString() : '')) {
            const notif = await Notification.create({
                receiver_id: post.user_id,
                actor_id: user_id,
                type: 'comment',
                post_id: post._id,
                comment_id: comment._id
            });
            const populatedNotif = await notif.populate('actor_id', 'username display_name photo_url');
            req.io.emit(`new_notification_${post.user_id}`, populatedNotif);
            sendTelegramNotification(post.user_id, `${populatedNotif.actor_id.username} commented on your post.`);
        }

        res.json({ comment: formattedComment });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Comments for a Post
app.get('/api/posts/:id/comments', async (req, res) => {
    try {
        const comments = await Comment.find({ post_id: req.params.id })
            .populate('user_id', 'username display_name photo_url')
            .populate('replied_to_user_id', 'username display_name')
            .sort({ created_at: 1 });
            
        const formatComments = comments.map(c => ({
            id: c._id,
            post_id: c.post_id,
            user_id: c.user_id ? c.user_id._id : null,
            username: c.user_id ? c.user_id.username : 'Unknown', display_name: c.user_id ? c.user_id.display_name : '',
            photo_url: c.user_id ? c.user_id.photo_url : null,
            content: c.content,
            parent_id: c.parent_id,
            replied_to_username: c.replied_to_user_id ? c.replied_to_user_id.username : null, replied_to_display_name: c.replied_to_user_id ? c.replied_to_user_id.display_name : '',
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
        const users = await User.find().select('id username display_name photo_url bio last_active follower_count following_count');
        const mappedUsers = users.map(u => ({
            ...u.toObject({ virtuals: true }),
            is_active: u.last_active ? (Date.now() - new Date(u.last_active).getTime() < 300000) : false
        }));
        res.json({ users: mappedUsers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9. Get User Profile
app.get('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('id username display_name photo_url cover_url bio last_active follower_count following_count');
        const posts = await Post.find({ user_id: req.params.id });
        const posts_count = posts.length;
        const likes_count = posts.reduce((acc, post) => acc + (post.likes ? post.likes.length : 0), 0);
        
        const mappedUser = {
            ...user.toObject({ virtuals: true }),
            is_active: user.last_active ? (Date.now() - new Date(user.last_active).getTime() < 300000) : false
        };
        res.json({ user: mappedUser, posts_count, likes_count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Follow Feature
const followRateLimits = new Map();

app.post('/api/users/:id/follow', async (req, res) => {
    const { follower_id } = req.body;
    const following_id = req.params.id;

    if (!follower_id || follower_id === following_id) return res.status(400).json({ error: 'Invalid follow request' });

    // Anti-Spam Rate Limiting (max 10 requests per minute)
    const now = Date.now();
    const rateLimitData = followRateLimits.get(follower_id) || { count: 0, lastReq: now };
    if (now - rateLimitData.lastReq > 60000) {
        rateLimitData.count = 1;
        rateLimitData.lastReq = now;
    } else {
        rateLimitData.count += 1;
        if (rateLimitData.count > 10) {
            return res.status(429).json({ error: 'Too fast, please slow down' });
        }
    }
    followRateLimits.set(follower_id, rateLimitData);

    try {
        const existingFollow = await Follow.findOne({ follower_id, following_id });
        let action = '';

        if (existingFollow) {
            await Follow.findByIdAndDelete(existingFollow._id);
            await User.findByIdAndUpdate(follower_id, { $inc: { following_count: -1 } });
            await User.findByIdAndUpdate(following_id, { $inc: { follower_count: -1 } });
            action = 'unfollowed';
        } else {
            await new Follow({ follower_id, following_id }).save();
            await User.findByIdAndUpdate(follower_id, { $inc: { following_count: 1 } });
            await User.findByIdAndUpdate(following_id, { $inc: { follower_count: 1 } });
            
            // Create notification
            await new Notification({ receiver_id: following_id, actor_id: follower_id, type: 'follow' }).save();
            
            action = 'followed';
        }

        const isMutual = await Follow.findOne({ follower_id: following_id, following_id: follower_id });
        res.json({ success: true, action, isMutual: !!isMutual });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users/:id/follow-status', async (req, res) => {
    const { follower_id } = req.query;
    if (!follower_id) return res.status(400).json({ error: 'follower_id required' });
    const following_id = req.params.id;

    try {
        const isFollowing = await Follow.findOne({ follower_id, following_id });
        const isMutual = isFollowing && await Follow.findOne({ follower_id: following_id, following_id: follower_id });
        
        let status = 'Not Following';
        if (isMutual) status = 'Friends';
        else if (isFollowing) status = 'Following';
        
        res.json({ status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users/:id/followers', async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });
        
        const viewerId = req.query.current_user_id;
        if (targetUser.is_private && viewerId !== req.params.id) {
            const isFollowing = viewerId ? await Follow.findOne({ follower_id: viewerId, following_id: req.params.id }) : null;
            if (!isFollowing) {
                return res.status(403).json({ error: 'Account is private', is_private: true });
            }
        }

        const limit = 20;
        const query = { following_id: req.params.id };
        if (req.query.cursor) {
            query._id = { $lt: req.query.cursor };
        }

        const follows = await Follow.find(query)
            .sort({ _id: -1 })
            .limit(limit)
            .populate('follower_id', 'username display_name photo_url bio last_active is_private');
            
        const nextCursor = follows.length === limit ? follows[follows.length - 1]._id : null;
        const users = follows.map(f => f.follower_id).filter(Boolean);
        res.json({ users, nextCursor });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users/:id/following', async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });
        
        const viewerId = req.query.current_user_id;
        if (targetUser.is_private && viewerId !== req.params.id) {
            const isFollowing = viewerId ? await Follow.findOne({ follower_id: viewerId, following_id: req.params.id }) : null;
            if (!isFollowing) {
                return res.status(403).json({ error: 'Account is private', is_private: true });
            }
        }

        const limit = 20;
        const query = { follower_id: req.params.id };
        if (req.query.cursor) {
            query._id = { $lt: req.query.cursor };
        }

        const follows = await Follow.find(query)
            .sort({ _id: -1 })
            .limit(limit)
            .populate('following_id', 'username display_name photo_url bio last_active is_private');
            
        const nextCursor = follows.length === limit ? follows[follows.length - 1]._id : null;
        const users = follows.map(f => f.following_id).filter(Boolean);
        res.json({ users, nextCursor });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users/:id/follow-map', async (req, res) => {
    try {
        const following = await Follow.find({ follower_id: req.params.id }).select('following_id');
        const followers = await Follow.find({ following_id: req.params.id }).select('follower_id');
        
        res.json({
            following: following.map(f => f.following_id.toString()),
            followers: followers.map(f => f.follower_id.toString())
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Toggle Privacy
app.put('/api/users/:id/privacy', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        user.is_private = req.body.is_private;
        await user.save();
        
        res.json({ message: 'Privacy updated', is_private: user.is_private });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// 10. Get User's Posts
app.get('/api/users/:id/posts', async (req, res) => {
    const current_user_id = req.query.user_id;
    const target_user_id = req.params.id;

    try {
        const posts = await Post.find({ user_id: target_user_id }).populate('user_id', 'username display_name photo_url').sort({ created_at: -1 });
        const postIds = posts.map(p => p._id);
        let userFavoriteSet = new Set();
        if (current_user_id) {
            const userFavorites = await Favorite.find({ user_id: current_user_id, post_id: { $in: postIds } });
            userFavorites.forEach(f => userFavoriteSet.add(f.post_id.toString()));
        }

        const comments = await Comment.aggregate([
            { $match: { post_id: { $in: postIds } } },
            { $group: { _id: "$post_id", count: { $sum: 1 } } }
        ]);

        const formatPosts = posts.map(post => {
            const commentData = comments.find(c => c._id.toString() === post._id.toString());
            return {
                id: post._id,
                user_id: post.user_id ? post.user_id._id : null,
                username: post.user_id ? post.user_id.username : 'Unknown', display_name: post.user_id ? post.user_id.display_name : '',
                photo_url: post.user_id ? post.user_id.photo_url : null,
                content: post.content,
                image_urls: post.image_urls,
                image_url: post.image_url,
                layout_type: post.layout_type,
                created_at: post.created_at,
                like_count: post.like_count || 0,
                comment_count: commentData ? commentData.count : 0,
                has_liked: (current_user_id && post.likes && post.likes.includes(current_user_id)) ? 1 : 0,
                has_favorited: userFavoriteSet.has(post._id.toString()) ? 1 : 0
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

// 11.5 Edit User Display Name
app.put('/api/users/:id/display_name', async (req, res) => {
    const { display_name } = req.body;
    try {
        await User.findByIdAndUpdate(req.params.id, { display_name: display_name || '' });
        res.json({ success: true, display_name: display_name || '' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/stories', upload.single('media'), async (req, res) => {
    const { user_id } = req.body;
    let media_url = req.body.media_url;
    let media_type = req.body.media_type;

    if (!media_url && !req.file) return res.status(400).json({ error: 'Media file required' });
    if (!user_id) return res.status(400).json({ error: 'User ID required' });

    if (!media_url && req.file) {
        media_type = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
        try {
            if (media_type === 'video') {
                media_url = await uploadVideoToCloudinary(req.file.path);
            } else {
                media_url = await uploadImageToCloudinary(req.file.path);
            }
        } catch (err) {
            deleteLocalFile(req.file.path);
            return res.status(500).json({ error: 'Failed to upload media' });
        }
        deleteLocalFile(req.file.path);
    }

    try {
        const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const story = await Story.create({ user_id, media_url, media_type, expires_at });
        req.io.emit('story_added', { user_id });
        res.json({ success: true, story });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 13. Get Active Stories for a User
app.get('/api/users/:id/stories', async (req, res) => {
    const userId = req.params.id;

    try {
        const user = await User.findById(userId).select('id username display_name photo_url');
        if (!user) return res.status(404).json({ error: 'User not found' });

        const stories = await Story.find({ 
            user_id: userId,
            $or: [ { expires_at: { $gt: new Date() } }, { expires_at: { $exists: false } } ]
        }).sort({ created_at: 1 });
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
            
            // Notification logic
            const story = await Story.findById(storyId);
            if (story && story.user_id.toString() !== user_id) {
                const notif = await Notification.create({
                    receiver_id: story.user_id,
                    actor_id: user_id,
                    type: 'story_like',
                    story_id: story._id
                });
                const populatedNotif = await notif.populate('actor_id', 'username display_name photo_url');
                req.io.emit(`new_notification_${story.user_id}`, populatedNotif);
                sendTelegramNotification(story.user_id, `${populatedNotif.actor_id.username} liked your story.`);
            }
            
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
        const viewerId = req.query.viewer_id;
        const stories = await Story.find({
            $or: [ { expires_at: { $gt: new Date() } }, { expires_at: { $exists: false } } ]
        }).populate('user_id', 'username display_name photo_url');
        
        const grouped = {};
        stories.forEach(story => {
            if (!story.user_id) return;
            const uid = story.user_id._id.toString();
            
            let isUnseen = true;
            if (viewerId) {
                // If the viewer has viewed this story, this specific story is seen.
                const hasViewed = story.viewers && story.viewers.some(v => v.user_id && v.user_id.toString() === viewerId);
                if (hasViewed) isUnseen = false;
            }
            // For a user, if ANY story is unseen, the ring should be unseen.
            // If ALL stories are seen, it's seen.

            if (!grouped[uid]) {
                grouped[uid] = {
                    id: uid,
                    username: story.user_id.username, display_name: story.user_id.display_name,
                    photo_url: story.user_id.photo_url,
                    has_unseen: isUnseen
                };
            } else {
                // If we found at least one unseen story, the whole user group is unseen.
                if (isUnseen) grouped[uid].has_unseen = true;
            }
        });
        const result = Object.values(grouped);
        
        // Sort: Unseen stories first
        result.sort((a, b) => {
            if (a.has_unseen === b.has_unseen) return 0;
            return a.has_unseen ? -1 : 1;
        });
        
        res.json({ users_with_stories: result, raw_grouped: grouped });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 17. Get Archived Stories for a User
app.get('/api/stories/archive', async (req, res) => {
    const user_id = req.query.user_id;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });
    try {
        // Fetch ALL stories for the user (both active and expired) so they can highlight recent ones too
        const archivedStories = await Story.find({
            user_id
        }).sort({ created_at: -1 });
        res.json({ stories: archivedStories });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 18. Track Story View
app.post('/api/stories/:id/view', async (req, res) => {
    const storyId = req.params.id;
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });
    try {
        const story = await Story.findById(storyId).populate('viewers.user_id', 'username display_name photo_url');
        if (!story) return res.status(404).json({ error: 'Story not found' });
        
        // Prevent story owner from being counted as a viewer, or count it? Usually owners aren't counted in 'seen by'.
        if (story.user_id.toString() !== user_id) {
            const hasViewed = story.viewers && story.viewers.some(v => v.user_id && v.user_id._id.toString() === user_id);
            if (!hasViewed) {
                story.viewers.push({ user_id, viewed_at: new Date() });
                await story.save();
                await story.populate('viewers.user_id', 'username display_name photo_url');
            }
        }
        res.json({ success: true, viewers: story.viewers || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Highlights APIs ---
// Create a new highlight
app.post('/api/highlights', async (req, res) => {
    const { user_id, title, cover_image_url, story_ids } = req.body;
    if (!user_id || !title || !story_ids || story_ids.length === 0) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        let cover = cover_image_url;
        if (!cover) {
            const firstStory = await Story.findById(story_ids[0]);
            if (firstStory) cover = firstStory.media_url;
        }
        
        const highlight = new Highlight({
            user_id,
            title,
            cover_image_url: cover,
            stories: story_ids
        });
        await highlight.save();
        res.json({ success: true, highlight });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get a user's highlights
app.get('/api/highlights/:user_id', async (req, res) => {
    try {
        const highlights = await Highlight.find({ user_id: req.params.user_id }).sort({ created_at: -1 });
        res.json({ highlights });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get stories for a specific highlight
app.get('/api/highlights/view/:id', async (req, res) => {
    try {
        const highlight = await Highlight.findById(req.params.id).populate('stories');
        if (!highlight) return res.status(404).json({ error: 'Highlight not found' });
        // Filter out any deleted stories just in case
        const validStories = highlight.stories.filter(s => s != null);
        res.json({ highlight, stories: validStories });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fallback route for frontend
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
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

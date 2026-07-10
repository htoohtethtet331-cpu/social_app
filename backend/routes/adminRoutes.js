const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const Story = require('../models/Story');
const StoryLike = require('../models/StoryLike');
const Favorite = require('../models/Favorite');

// Admin Authentication Middleware
const requireAdmin = (req, res, next) => {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Admin Password' });
    }
    next();
};

// Protect all /api/admin routes
router.use(requireAdmin);

// ==========================================
// Dashboard Statistics
// ==========================================
router.get('/stats', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalPosts = await Post.countDocuments();
        const totalComments = await Comment.countDocuments();
        const totalLikes = await Like.countDocuments();
        const totalStories = await Story.countDocuments();

        res.json({
            users: totalUsers,
            posts: totalPosts,
            comments: totalComments,
            likes: totalLikes,
            stories: totalStories
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// Users Management
// ==========================================

// Get all users
router.get('/users', async (req, res) => {
    try {
        const users = await User.find().sort({ created_at: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Edit user
router.put('/users/:id', async (req, res) => {
    try {
        const { username, bio } = req.body;
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id, 
            { username, bio },
            { new: true }
        );
        res.json(updatedUser);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete user and associated data
router.delete('/users/:id', async (req, res) => {
    const userId = req.params.id;
    try {
        // Delete all associated posts
        const posts = await Post.find({ user_id: userId });
        for (const post of posts) {
            await Like.deleteMany({ post_id: post._id });
            await Comment.deleteMany({ post_id: post._id });
            await Favorite.deleteMany({ post_id: post._id });
            await Post.findByIdAndDelete(post._id);
        }

        // Delete likes/comments made by user
        await Like.deleteMany({ user_id: userId });
        await Comment.deleteMany({ user_id: userId });
        await Favorite.deleteMany({ user_id: userId });
        
        // Delete stories
        await Story.deleteMany({ user_id: userId });
        await StoryLike.deleteMany({ user_id: userId });

        // Finally delete the user
        await User.findByIdAndDelete(userId);

        res.json({ success: true, message: 'User and all associated data deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// Posts Management
// ==========================================

// Get all posts with user populated
router.get('/posts', async (req, res) => {
    try {
        const posts = await Post.find().populate('user_id', 'username').sort({ created_at: -1 });
        res.json(posts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Edit post content
router.put('/posts/:id', async (req, res) => {
    try {
        const { content } = req.body;
        const updatedPost = await Post.findByIdAndUpdate(
            req.params.id, 
            { content },
            { new: true }
        ).populate('user_id', 'username');
        res.json(updatedPost);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete post and associated likes/comments
router.delete('/posts/:id', async (req, res) => {
    const postId = req.params.id;
    try {
        await Like.deleteMany({ post_id: postId });
        await Comment.deleteMany({ post_id: postId });
        await Favorite.deleteMany({ post_id: postId });
        await Post.findByIdAndDelete(postId);
        res.json({ success: true, message: 'Post deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// Stories Management
// ==========================================

// Get all stories with user populated
router.get('/stories', async (req, res) => {
    try {
        const stories = await Story.find().populate('user_id', 'username').sort({ created_at: -1 });
        res.json(stories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete story and associated likes
router.delete('/stories/:id', async (req, res) => {
    const storyId = req.params.id;
    try {
        await StoryLike.deleteMany({ story_id: storyId });
        await Story.findByIdAndDelete(storyId);
        res.json({ success: true, message: 'Story deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

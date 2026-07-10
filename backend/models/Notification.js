const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    receiver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['like', 'comment', 'reply', 'favorite', 'story_like'], required: true },
    post_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    story_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Story' },
    status: { type: String, enum: ['unread', 'read'], default: 'unread' },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', NotificationSchema);

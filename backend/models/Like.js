const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
  post_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// Ensure unique like per user per post
likeSchema.index({ post_id: 1, user_id: 1 }, { unique: true });

likeSchema.virtual('id').get(function() { return this._id.toHexString(); });
likeSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Like', likeSchema);

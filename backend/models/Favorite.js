const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
  post_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Ensure unique favorite per user per post
favoriteSchema.index({ post_id: 1, user_id: 1 }, { unique: true });

favoriteSchema.virtual('id').get(function() { return this._id.toHexString(); });
favoriteSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Favorite', favoriteSchema);

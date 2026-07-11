const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  image_urls: { type: [String], default: [] },
  image_url: String, // Keeping for backward compatibility
  layout_type: { type: String, default: 'single' },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  like_count: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

postSchema.index({ content: 'text' });

postSchema.virtual('id').get(function() { return this._id.toHexString(); });
postSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Post', postSchema);

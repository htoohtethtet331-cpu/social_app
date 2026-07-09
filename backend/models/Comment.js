const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  post_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  parent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
  created_at: { type: Date, default: Date.now }
});

commentSchema.virtual('id').get(function() { return this._id.toHexString(); });
commentSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Comment', commentSchema);

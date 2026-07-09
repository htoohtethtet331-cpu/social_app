const mongoose = require('mongoose');

const storyLikeSchema = new mongoose.Schema({
  story_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Story' },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now }
});

storyLikeSchema.index({ story_id: 1, user_id: 1 }, { unique: true });

storyLikeSchema.virtual('id').get(function() { return this._id.toHexString(); });
storyLikeSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('StoryLike', storyLikeSchema);

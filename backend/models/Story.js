const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  media_url: String,
  media_type: String,
  created_at: { type: Date, default: Date.now }
});

storySchema.virtual('id').get(function() { return this._id.toHexString(); });
storySchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Story', storySchema);

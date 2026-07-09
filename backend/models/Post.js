const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  image_url: String,
  created_at: { type: Date, default: Date.now }
});

postSchema.virtual('id').get(function() { return this._id.toHexString(); });
postSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Post', postSchema);

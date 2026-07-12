const mongoose = require('mongoose');

const highlightSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  cover_image_url: { type: String, required: true },
  stories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Story' }],
  created_at: { type: Date, default: Date.now }
});

highlightSchema.virtual('id').get(function() { return this._id.toHexString(); });
highlightSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Highlight', highlightSchema);

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegram_id: { type: String, unique: true },
  username: String,
  photo_url: String,
  cover_url: String,
  bio: { type: String, default: "" },
  follower_count: { type: Number, default: 0 },
  following_count: { type: Number, default: 0 },
  is_active: { type: Boolean, default: true },
  is_private: { type: Boolean, default: false },
  last_active: { type: Date, default: Date.now },
  created_at: { type: Date, default: Date.now }
});

// To easily migrate from SQL 'id' to Mongo '_id' on frontend, we can add a virtual
userSchema.virtual('id').get(function() {
  return this._id.toHexString();
});
userSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('User', userSchema);

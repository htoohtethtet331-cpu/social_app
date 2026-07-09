const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegram_id: { type: String, unique: true },
  username: String,
  photo_url: String,
  cover_url: String,
  bio: String
});

// To easily migrate from SQL 'id' to Mongo '_id' on frontend, we can add a virtual
userSchema.virtual('id').get(function() {
  return this._id.toHexString();
});
userSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('User', userSchema);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.set('trust proxy', true); // Required for Render — correct IP behind proxy

// ===== MONGODB CONNECTION =====
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/twittercampaign';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });

// ===== SCHEMAS & MODELS =====

// Campaign Content (Tweets, Retweets, Replies)
const contentSchema = new mongoose.Schema({
  type:      { type: String, enum: ['tweet', 'retweet', 'reply'], required: true },
  text:      { type: String, default: '' },
  postLink:  { type: String, default: '' },
  targetId:  { type: String, default: '' },
  replyText: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

// Campaign Config (Single document — kill switch, breaking news, etc.)
const configSchema = new mongoose.Schema({
  isActive:      { type: Boolean, default: true },
  breakingNews:  { type: String, default: '🚨 Campaign is LIVE! Keep Tweeting! #MissionNTPCResult' },
  posterMessage: { type: String, default: 'Campaign temporarily paused. Hum jaldi wapas aayenge!' },
  redAlertLine:  { type: String, default: 'Campaign Halted' }
});

// Global Campaign Stats (Single document — aggregate counters)
const globalStatsSchema = new mongoose.Schema({
  tweets:   { type: Number, default: 0 },
  retweets: { type: Number, default: 0 },
  replies:  { type: Number, default: 0 }
});

// Per-User Progress — keyed by IP address
const userProgressSchema = new mongoose.Schema({
  ip: { type: String, required: true, unique: true, index: true },
  completedCardIds: [{ type: String }],
  stats: {
    tweets:   { type: Number, default: 0 },
    retweets: { type: Number, default: 0 },
    replies:  { type: Number, default: 0 }
  },
  totalClicks: { type: Number, default: 0 },
  levels: {
    tweets:   { type: Number, default: 1 },
    retweets: { type: Number, default: 1 },
    replies:  { type: Number, default: 1 }
  },
  unlockedBadges: [{ type: String }],
  lastActive: { type: Date, default: Date.now }
});

const Content      = mongoose.model('Content', contentSchema);
const Config       = mongoose.model('Config', configSchema);
const GlobalStats  = mongoose.model('GlobalStats', globalStatsSchema);
const UserProgress = mongoose.model('UserProgress', userProgressSchema);

// ===== HELPERS =====

// Extract real client IP (works behind Render's proxy)
const getClientIP = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
};

// Get or create singleton documents
const getOrCreateConfig = async () => {
  let doc = await Config.findOne();
  if (!doc) doc = await Config.create({});
  return doc;
};

const getOrCreateGlobalStats = async () => {
  let doc = await GlobalStats.findOne();
  if (!doc) doc = await GlobalStats.create({});
  return doc;
};

const getOrCreateUserProgress = async (ip) => {
  let doc = await UserProgress.findOne({ ip });
  if (!doc) doc = await UserProgress.create({ ip });
  return doc;
};

// ===== API ROUTES =====

// ── GET /api/live-data ── Main data endpoint (config + stats + content + user progress)
app.get('/api/live-data', async (req, res) => {
  try {
    const ip = getClientIP(req);

    const [config, stats, content, userProgress] = await Promise.all([
      getOrCreateConfig(),
      getOrCreateGlobalStats(),
      Content.find().sort({ createdAt: -1 }),
      getOrCreateUserProgress(ip)
    ]);

    res.json({
      config: {
        isActive:      config.isActive,
        breakingNews:  config.breakingNews,
        posterMessage: config.posterMessage,
        redAlertLine:  config.redAlertLine
      },
      stats: {
        tweets:   stats.tweets,
        retweets: stats.retweets,
        replies:  stats.replies
      },
      content: content,
      userProgress: {
        completedCardIds: userProgress.completedCardIds,
        stats:            userProgress.stats,
        totalClicks:      userProgress.totalClicks,
        levels:           userProgress.levels,
        unlockedBadges:   userProgress.unlockedBadges
      }
    });
  } catch (err) {
    console.error('GET /api/live-data error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/config ── Update campaign configuration
app.put('/api/config', async (req, res) => {
  try {
    const config = await getOrCreateConfig();
    const { isActive, breakingNews, posterMessage, redAlertLine } = req.body;

    if (isActive !== undefined)      config.isActive = isActive;
    if (breakingNews !== undefined)   config.breakingNews = breakingNews;
    if (posterMessage !== undefined)  config.posterMessage = posterMessage;
    if (redAlertLine !== undefined)   config.redAlertLine = redAlertLine;

    await config.save();
    res.json(config);
  } catch (err) {
    console.error('PUT /api/config error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/content ── Add single content card
app.post('/api/content', async (req, res) => {
  try {
    const { type, text, postLink, targetId, replyText } = req.body;
    const content = await Content.create({ type, text, postLink, targetId, replyText });
    res.json(content);
  } catch (err) {
    console.error('POST /api/content error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/content/bulk ── Bulk upload content cards
app.post('/api/content/bulk', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Items array required' });
    }
    const created = await Content.insertMany(items);
    res.json({ count: created.length, items: created });
  } catch (err) {
    console.error('POST /api/content/bulk error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/content/:id ── Delete a content card
app.delete('/api/content/:id', async (req, res) => {
  try {
    await Content.findByIdAndDelete(req.params.id);
    // Also clean up from all users' completed lists
    await UserProgress.updateMany(
      {},
      { $pull: { completedCardIds: req.params.id } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/content error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/action ── Record a user action (tweet/retweet/reply completion)
app.post('/api/action', async (req, res) => {
  try {
    const { id, type } = req.body;
    const ip = getClientIP(req);
    const statKey = type + 's'; // 'tweets' | 'retweets' | 'replies'

    // Get user progress
    const userProgress = await getOrCreateUserProgress(ip);

    // If already completed this card, return current state (no double-counting)
    if (userProgress.completedCardIds.includes(id)) {
      const globalStats = await getOrCreateGlobalStats();
      return res.json({
        stats: { tweets: globalStats.tweets, retweets: globalStats.retweets, replies: globalStats.replies },
        userProgress: {
          completedCardIds: userProgress.completedCardIds,
          stats:            userProgress.stats,
          totalClicks:      userProgress.totalClicks,
          levels:           userProgress.levels,
          unlockedBadges:   userProgress.unlockedBadges
        }
      });
    }

    // Update user progress
    userProgress.completedCardIds.push(id);
    userProgress.stats[statKey] = (userProgress.stats[statKey] || 0) + 1;
    userProgress.totalClicks    = (userProgress.totalClicks || 0) + 1;
    userProgress.lastActive     = new Date();
    await userProgress.save();

    // Update global stats
    const globalStats = await getOrCreateGlobalStats();
    globalStats[statKey] = (globalStats[statKey] || 0) + 1;
    await globalStats.save();

    res.json({
      stats: { tweets: globalStats.tweets, retweets: globalStats.retweets, replies: globalStats.replies },
      userProgress: {
        completedCardIds: userProgress.completedCardIds,
        stats:            userProgress.stats,
        totalClicks:      userProgress.totalClicks,
        levels:           userProgress.levels,
        unlockedBadges:   userProgress.unlockedBadges
      }
    });
  } catch (err) {
    console.error('POST /api/action error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/user-progress/levels ── Persist level advancement for a user
app.put('/api/user-progress/levels', async (req, res) => {
  try {
    const ip = getClientIP(req);
    const { levels } = req.body;

    const userProgress = await getOrCreateUserProgress(ip);
    if (levels) {
      userProgress.levels = levels;
      userProgress.lastActive = new Date();
      await userProgress.save();
    }

    res.json({ success: true, levels: userProgress.levels });
  } catch (err) {
    console.error('PUT /api/user-progress/levels error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/user-progress/badges ── Persist unlocked badges for a user
app.put('/api/user-progress/badges', async (req, res) => {
  try {
    const ip = getClientIP(req);
    const { unlockedBadges } = req.body;

    const userProgress = await getOrCreateUserProgress(ip);
    if (unlockedBadges) {
      userProgress.unlockedBadges = unlockedBadges;
      userProgress.lastActive = new Date();
      await userProgress.save();
    }

    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/user-progress/badges error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== STATIC FILES & SPA CATCH-ALL =====
app.use(express.static(path.join(__dirname, 'pubic')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'pubic', 'twittercampaignnui.html'));
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 MongoDB: ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`);
});

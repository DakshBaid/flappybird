const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const isVercel = process.env.VERCEL === '1';

// Supabase Setup
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Fallback Local JSON setup if Supabase is missing
const DB_FILE = isVercel ? path.join('/tmp', 'db.json') : path.join(__dirname, 'db.json');
const BUNDLED_DB = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json());

// Helper function to read Local DB (Fallback)
function readLocalDB() {
  if (!fs.existsSync(DB_FILE)) {
    let initialData = { users: [], scores: [] };
    if (isVercel && fs.existsSync(BUNDLED_DB)) {
      try { initialData = JSON.parse(fs.readFileSync(BUNDLED_DB, 'utf8')); } catch (e) {}
    }
    try { fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2)); } catch (e) {}
    return initialData;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    return { users: [], scores: [] };
  }
}

// Helper function to write Local DB (Fallback)
function writeLocalDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Local write failed', err.message);
  }
}

// 1. Auth Endpoint: Register (Kept for backward compatibility)
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  
  const trimmedUser = username.trim();
  const passwordHash = bcrypt.hashSync(password, 8);

  if (supabase) {
    const { data: exists } = await supabase.from('users').select('id').ilike('username', trimmedUser).single();
    if (exists) return res.status(400).json({ error: 'Username is already taken' });
    
    await supabase.from('users').insert([{ username: trimmedUser, password_hash: passwordHash }]);
    return res.status(201).json({ message: 'User registered successfully', username: trimmedUser });
  } else {
    const db = readLocalDB();
    if (db.users.find(u => u.username.toLowerCase() === trimmedUser.toLowerCase())) {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    db.users.push({ username: trimmedUser, passwordHash });
    writeLocalDB(db);
    return res.status(201).json({ message: 'User registered successfully', username: trimmedUser });
  }
});

// 2. Auth Endpoint: Login (Kept for backward compatibility)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  const trimmedUser = username.trim();

  if (supabase) {
    const { data: user } = await supabase.from('users').select('*').ilike('username', trimmedUser).single();
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }
    return res.status(200).json({ message: 'Login successful', username: user.username });
  } else {
    const db = readLocalDB();
    const user = db.users.find(u => u.username.toLowerCase() === trimmedUser.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }
    return res.status(200).json({ message: 'Login successful', username: user.username });
  }
});

// Serve static files from the React frontend build
app.use(express.static(path.join(__dirname, '../dist')));

// 3. Scores Endpoint: Post Score
app.post('/api/scores', async (req, res) => {
  const { username, score } = req.body;
  if (!username || score === undefined) return res.status(400).json({ error: 'Missing username or score' });
  
  const trimmedUser = username.trim();
  const parsedScore = parseInt(score, 10);

  if (supabase) {
    const { error } = await supabase.from('scores').insert([{ username: trimmedUser, score: parsedScore }]);
    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to save score' });
    }
    return res.status(201).json({ message: 'Score saved successfully', score: { username: trimmedUser, score: parsedScore, timestamp: new Date().toISOString() } });
  } else {
    const db = readLocalDB();
    const newScore = { username: trimmedUser, score: parsedScore, timestamp: new Date().toISOString() };
    db.scores.push(newScore);
    writeLocalDB(db);
    return res.status(201).json({ message: 'Score saved successfully', score: newScore });
  }
});

// 4. Leaderboard Endpoint: Get Top Scores (Case-insensitive user aggregation, 25-day limit)
app.get('/api/scores/leaderboard', async (req, res) => {
  if (supabase) {
    // 25-day cutoff
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 25);
    
    const { data, error } = await supabase
      .from('scores')
      .select('username, score, created_at')
      .gte('created_at', cutoffDate.toISOString());

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }

    // Aggregate highest score per user
    const userMaxScores = {};
    (data || []).forEach(s => {
      const key = s.username.toLowerCase();
      if (!userMaxScores[key] || s.score > userMaxScores[key].score) {
        // Remap created_at to timestamp for frontend compatibility
        userMaxScores[key] = { username: s.username, score: s.score, timestamp: s.created_at };
      }
    });

    const leaderboard = Object.values(userMaxScores)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
      
    return res.status(200).json(leaderboard);
  } else {
    const db = readLocalDB();
    const cutoffTime = Date.now() - 25 * 24 * 60 * 60 * 1000;
    
    const userMaxScores = {};
    db.scores.forEach(s => {
      if (!s.timestamp || new Date(s.timestamp).getTime() >= cutoffTime) {
        const key = s.username.toLowerCase();
        if (!userMaxScores[key] || s.score > userMaxScores[key].score) {
          userMaxScores[key] = s;
        }
      }
    });

    const leaderboard = Object.values(userMaxScores)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return res.status(200).json(leaderboard);
  }
});

// 5. Personal Best Endpoint: Get user's high score
app.get('/api/scores/personal-best', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'Username parameter is required' });

  const trimmedUser = username.trim();

  if (supabase) {
    const { data, error } = await supabase
      .from('scores')
      .select('score')
      .ilike('username', trimmedUser)
      .order('score', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({ error: 'Failed to fetch personal best' });
    }

    const personalBest = data && data.length > 0 ? data[0].score : 0;
    return res.status(200).json({ personalBest });
  } else {
    const db = readLocalDB();
    let personalBest = 0;
    db.scores.forEach(s => {
      if (s.username.toLowerCase() === trimmedUser.toLowerCase() && s.score > personalBest) {
        personalBest = s.score;
      }
    });
    return res.status(200).json({ personalBest });
  }
});

// Fallback to index.html for React SPA
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Export app for Vercel
module.exports = app;

// Start server locally if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Leaderboard backend running on port ${PORT}`);
    if (supabase) console.log('Connected to Supabase');
    else console.log('Using local DB fallback');
  });
}

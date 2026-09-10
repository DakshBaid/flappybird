const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const isVercel = process.env.VERCEL === '1';

// Supabase config
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Supabase REST API helper (no npm package needed)
async function supabase(method, table, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  if (options.query) url += '?' + options.query;

  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation'
  };

  const res = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase ${method} ${table} failed: ${errText}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// Fallback Local JSON setup
const DB_FILE = isVercel ? path.join('/tmp', 'db.json') : path.join(__dirname, 'db.json');
const BUNDLED_DB = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json());

function readLocalDB() {
  if (!fs.existsSync(DB_FILE)) {
    let initialData = { users: [], scores: [] };
    if (isVercel && fs.existsSync(BUNDLED_DB)) {
      try { initialData = JSON.parse(fs.readFileSync(BUNDLED_DB, 'utf8')); } catch (e) {}
    }
    try { fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2)); } catch (e) {}
    return initialData;
  }
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (err) { return { users: [], scores: [] }; }
}

function writeLocalDB(data) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }
  catch (err) { console.error('Local write failed', err.message); }
}

// 1. Register
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

  const trimmedUser = username.trim();
  const passwordHash = bcrypt.hashSync(password, 8);

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const existing = await supabase('GET', 'users', {
        query: `username=ilike.${encodeURIComponent(trimmedUser)}&select=id`
      });
      if (existing && existing.length > 0) return res.status(400).json({ error: 'Username is already taken' });

      await supabase('POST', 'users', {
        body: { username: trimmedUser, password_hash: passwordHash },
        prefer: 'return=minimal'
      });
      return res.status(201).json({ message: 'User registered successfully', username: trimmedUser });
    } catch (err) {
      console.error('Supabase register error:', err.message);
    }
  }

  // Fallback
  const db = readLocalDB();
  if (db.users.find(u => u.username.toLowerCase() === trimmedUser.toLowerCase())) {
    return res.status(400).json({ error: 'Username is already taken' });
  }
  db.users.push({ username: trimmedUser, passwordHash });
  writeLocalDB(db);
  return res.status(201).json({ message: 'User registered successfully', username: trimmedUser });
});

// 2. Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  const trimmedUser = username.trim();

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const users = await supabase('GET', 'users', {
        query: `username=ilike.${encodeURIComponent(trimmedUser)}&select=*`
      });
      const user = users && users[0];
      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(400).json({ error: 'Invalid username or password' });
      }
      return res.status(200).json({ message: 'Login successful', username: user.username });
    } catch (err) {
      console.error('Supabase login error:', err.message);
    }
  }

  // Fallback
  const db = readLocalDB();
  const user = db.users.find(u => u.username.toLowerCase() === trimmedUser.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(400).json({ error: 'Invalid username or password' });
  }
  return res.status(200).json({ message: 'Login successful', username: user.username });
});

// Serve static files
app.use(express.static(path.join(__dirname, '../dist')));

// 3. Post Score
app.post('/api/scores', async (req, res) => {
  const { username, score } = req.body;
  if (!username || score === undefined) return res.status(400).json({ error: 'Missing username or score' });

  const trimmedUser = username.trim();
  const parsedScore = parseInt(score, 10);

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      await supabase('POST', 'scores', {
        body: { username: trimmedUser, score: parsedScore },
        prefer: 'return=minimal'
      });
      return res.status(201).json({ message: 'Score saved successfully', score: { username: trimmedUser, score: parsedScore, timestamp: new Date().toISOString() } });
    } catch (err) {
      console.error('Supabase score insert error:', err.message);
      return res.status(500).json({ error: 'Failed to save score: ' + err.message });
    }
  }

  // Fallback
  const db = readLocalDB();
  const newScore = { username: trimmedUser, score: parsedScore, timestamp: new Date().toISOString() };
  db.scores.push(newScore);
  writeLocalDB(db);
  return res.status(201).json({ message: 'Score saved successfully', score: newScore });
});

// 4. Leaderboard (25-day limit)
app.get('/api/scores/leaderboard', async (req, res) => {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 25);

      const data = await supabase('GET', 'scores', {
        query: `select=username,score,created_at&created_at=gte.${cutoffDate.toISOString()}&order=score.desc`
      });

      const userMaxScores = {};
      (data || []).forEach(s => {
        const key = s.username.toLowerCase();
        if (!userMaxScores[key] || s.score > userMaxScores[key].score) {
          userMaxScores[key] = { username: s.username, score: s.score, timestamp: s.created_at };
        }
      });

      const leaderboard = Object.values(userMaxScores)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      return res.status(200).json(leaderboard);
    } catch (err) {
      console.error('Supabase leaderboard error:', err.message);
      return res.status(500).json({ error: 'Failed to fetch leaderboard: ' + err.message });
    }
  }

  // Fallback
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
  const leaderboard = Object.values(userMaxScores).sort((a, b) => b.score - a.score).slice(0, 10);
  return res.status(200).json(leaderboard);
});

// 5. Personal Best
app.get('/api/scores/personal-best', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'Username parameter is required' });
  const trimmedUser = username.trim();

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const data = await supabase('GET', 'scores', {
        query: `username=ilike.${encodeURIComponent(trimmedUser)}&select=score&order=score.desc&limit=1`
      });
      const personalBest = data && data.length > 0 ? data[0].score : 0;
      return res.status(200).json({ personalBest });
    } catch (err) {
      console.error('Supabase personal best error:', err.message);
    }
  }

  // Fallback
  const db = readLocalDB();
  let personalBest = 0;
  db.scores.forEach(s => {
    if (s.username.toLowerCase() === trimmedUser.toLowerCase() && s.score > personalBest) {
      personalBest = s.score;
    }
  });
  return res.status(200).json({ personalBest });
});

// Fallback to React SPA
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(SUPABASE_URL ? 'Supabase connected' : 'Using local DB fallback');
  });
}

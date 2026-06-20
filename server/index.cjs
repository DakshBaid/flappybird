const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json());

// Helper for fetch with timeout
async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 4000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

const KVDB_URL = 'https://kvdb.io/flappy_bird_daksh_scores_v2/data';

// Helper function to read DB
async function readDB() {
  try {
    const res = await fetchWithTimeout(KVDB_URL, { timeout: 3000 });
    if (res.ok) {
      const text = await res.text();
      if (text.trim()) {
        return JSON.parse(text);
      }
    }
  } catch (err) {
    console.error('Error reading from remote KVDB, falling back to local:', err.message);
  }

  if (!fs.existsSync(DB_FILE)) {
    const initialData = { users: [], scores: [] };
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    } catch (e) {
      console.error('Failed to write local db.json initial data:', e.message);
    }
    return initialData;
  }
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading local database file, resetting...', err);
    const initialData = { users: [], scores: [] };
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    } catch (e) {}
    return initialData;
  }
}

// Helper function to write DB
async function writeDB(data) {
  let remoteSuccess = false;
  try {
    const res = await fetchWithTimeout(KVDB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      timeout: 3500
    });
    if (res.ok) {
      remoteSuccess = true;
    } else {
      console.error('Remote KVDB write failed with status:', res.status);
    }
  } catch (err) {
    console.error('Error writing to remote KVDB:', err.message);
  }

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    if (!remoteSuccess) {
      console.error('Both remote and local write failed!', err.message);
    }
  }
}

// 1. Auth Endpoint: Register
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const trimmedUser = username.trim();
  if (trimmedUser.length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Username must be >= 3 chars, password >= 4 chars' });
  }

  const db = await readDB();
  const exists = db.users.find(u => u.username.toLowerCase() === trimmedUser.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: 'Username is already taken' });
  }

  const passwordHash = bcrypt.hashSync(password, 8);
  db.users.push({ username: trimmedUser, passwordHash });
  await writeDB(db);

  res.status(201).json({ message: 'User registered successfully', username: trimmedUser });
});

// 2. Auth Endpoint: Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const db = await readDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!user) {
    return res.status(400).json({ error: 'Invalid username or password' });
  }

  const passwordIsValid = bcrypt.compareSync(password, user.passwordHash);
  if (!passwordIsValid) {
    return res.status(400).json({ error: 'Invalid username or password' });
  }

  res.status(200).json({ message: 'Login successful', username: user.username });
});

// Serve static files from the React frontend build
app.use(express.static(path.join(__dirname, '../dist')));

// 3. Scores Endpoint: Post Score
app.post('/api/scores', async (req, res) => {
  const { username, score } = req.body;
  if (!username || score === undefined) {
    return res.status(400).json({ error: 'Missing username or score' });
  }

  const db = await readDB();
  const userExists = db.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());

  const newScore = {
    username: userExists ? userExists.username : username.trim(),
    score: parseInt(score, 10),
    timestamp: new Date().toISOString()
  };

  db.scores.push(newScore);
  await writeDB(db);

  res.status(201).json({ message: 'Score saved successfully', score: newScore });
});

// 4. Leaderboard Endpoint: Get Top Scores (Case-insensitive user aggregation)
app.get('/api/scores/leaderboard', async (req, res) => {
  const db = await readDB();
  
  // Aggregate high score per user case-insensitively
  const userMaxScores = {};
  db.scores.forEach(s => {
    const key = s.username.toLowerCase();
    if (!userMaxScores[key] || s.score > userMaxScores[key].score) {
      userMaxScores[key] = s;
    }
  });

  // Sort descending and slice top 10
  const leaderboard = Object.values(userMaxScores)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  res.status(200).json(leaderboard);
});

// 5. Personal Best Endpoint: Get user's high score
app.get('/api/scores/personal-best', async (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ error: 'Username parameter is required' });
  }

  const db = await readDB();
  let personalBest = 0;

  db.scores.forEach(s => {
    if (s.username.toLowerCase() === username.trim().toLowerCase()) {
      if (s.score > personalBest) {
        personalBest = s.score;
      }
    }
  });

  res.status(200).json({ personalBest });
});

// Fallback to index.html for React SPA
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Export app for Vercel
module.exports = app;

// Start server locally if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Leaderboard backend running on port ${PORT}`);
  });
}

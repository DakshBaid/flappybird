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

// Helper function to read DB
function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = { users: [], scores: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading database file, resetting...', err);
    const initialData = { users: [], scores: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
}

// Helper function to write DB
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// 1. Auth Endpoint: Register
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const trimmedUser = username.trim();
  if (trimmedUser.length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Username must be >= 3 chars, password >= 4 chars' });
  }

  const db = readDB();
  const exists = db.users.find(u => u.username.toLowerCase() === trimmedUser.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: 'Username is already taken' });
  }

  const passwordHash = bcrypt.hashSync(password, 8);
  db.users.push({ username: trimmedUser, passwordHash });
  writeDB(db);

  res.status(201).json({ message: 'User registered successfully', username: trimmedUser });
});

// 2. Auth Endpoint: Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const db = readDB();
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
app.post('/api/scores', (req, res) => {
  const { username, score } = req.body;
  if (!username || score === undefined) {
    return res.status(400).json({ error: 'Missing username or score' });
  }

  const db = readDB();
  const userExists = db.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());

  const newScore = {
    username: userExists ? userExists.username : username.trim(),
    score: parseInt(score, 10),
    timestamp: new Date().toISOString()
  };

  db.scores.push(newScore);
  writeDB(db);

  res.status(201).json({ message: 'Score saved successfully', score: newScore });
});

// 4. Leaderboard Endpoint: Get Top Scores (Case-insensitive user aggregation)
app.get('/api/scores/leaderboard', (req, res) => {
  const db = readDB();
  
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
app.get('/api/scores/personal-best', (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ error: 'Username parameter is required' });
  }

  const db = readDB();
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
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Leaderboard backend running on port ${PORT}`);
});

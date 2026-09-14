try { require('dotenv').config(); } catch (e) {}

const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase config (sanitize URL to strip trailing slashes and /rest/v1 if pasted by user)
let rawUrl = (process.env.SUPABASE_URL || '').trim();
rawUrl = rawUrl.replace(/\/+$/, ''); // Remove trailing slashes
rawUrl = rawUrl.replace(/\/rest\/v1$/i, ''); // Remove /rest/v1 suffix if present
const SUPABASE_URL = rawUrl || undefined;
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || '').trim() || undefined;

// Supabase REST API helper
async function supabase(method, table, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase URL or Anon Key is missing in environment variables');
  }

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

app.use(cors());
app.use(express.json());

// 0. User Sync/Register by Enrollment Number (No password required)
app.post('/api/users', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });
  const trimmedUser = username.trim();

  try {
    const existing = await supabase('GET', 'users', {
      query: `username=ilike.${encodeURIComponent(trimmedUser)}&select=id`
    });
    if (!existing || existing.length === 0) {
      await supabase('POST', 'users', {
        body: { username: trimmedUser },
        prefer: 'return=minimal'
      });
    }
    return res.status(200).json({ message: 'User synced with Supabase successfully', username: trimmedUser });
  } catch (err) {
    console.error('Supabase user sync error:', err.message);
    return res.status(500).json({ error: 'Failed to sync user to Supabase: ' + err.message });
  }
});

// 1. Register
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  const trimmedUser = username.trim();
  const passwordHash = password ? bcrypt.hashSync(password, 8) : null;

  try {
    const existing = await supabase('GET', 'users', {
      query: `username=ilike.${encodeURIComponent(trimmedUser)}&select=id`
    });
    if (existing && existing.length > 0) return res.status(400).json({ error: 'Username is already taken' });

    await supabase('POST', 'users', {
      body: { username: trimmedUser, password_hash: passwordHash },
      prefer: 'return=minimal'
    });
    return res.status(201).json({ message: 'User registered in Supabase successfully', username: trimmedUser });
  } catch (err) {
    console.error('Supabase register error:', err.message);
    return res.status(500).json({ error: 'Failed to register user in Supabase: ' + err.message });
  }
});

// 2. Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  const trimmedUser = username.trim();

  try {
    const users = await supabase('GET', 'users', {
      query: `username=ilike.${encodeURIComponent(trimmedUser)}&select=*`
    });
    const user = users && users[0];
    if (!user || (user.password_hash && !bcrypt.compareSync(password, user.password_hash))) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }
    return res.status(200).json({ message: 'Login successful', username: user.username });
  } catch (err) {
    console.error('Supabase login error:', err.message);
    return res.status(500).json({ error: 'Failed to login via Supabase: ' + err.message });
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, '../dist')));

// 3. Post Score (Only to Supabase)
app.post('/api/scores', async (req, res) => {
  const { username, score } = req.body;
  if (!username || score === undefined) return res.status(400).json({ error: 'Missing username or score' });

  const trimmedUser = username.trim();
  const parsedScore = parseInt(score, 10);

  try {
    // 1. Ensure user entry exists in Supabase users table
    try {
      await supabase('POST', 'users', {
        body: { username: trimmedUser },
        prefer: 'return=minimal'
      });
    } catch (userErr) {
      // Ignored if user already exists
    }

    // 2. Insert score to Supabase scores table
    await supabase('POST', 'scores', {
      body: { username: trimmedUser, score: parsedScore },
      prefer: 'return=minimal'
    });
    
    console.log(`✅ Score saved to Supabase for ${trimmedUser}: ${parsedScore}`);
    return res.status(201).json({ message: 'Score saved to Supabase successfully', score: { username: trimmedUser, score: parsedScore } });
  } catch (err) {
    console.error('Supabase score insert error:', err.message);
    return res.status(500).json({ error: 'Failed to save score to Supabase: ' + err.message });
  }
});

// 4. Leaderboard (Only from Supabase)
app.get('/api/scores/leaderboard', async (req, res) => {
  try {
    const data = await supabase('GET', 'scores', {
      query: `select=username,score,created_at&order=score.desc&limit=200`
    });

    const userMaxScores = {};
    (data || []).forEach(s => {
      if (s && s.username) {
        const key = s.username.toLowerCase();
        if (!userMaxScores[key] || s.score > userMaxScores[key].score) {
          userMaxScores[key] = {
            username: s.username,
            score: Number(s.score),
            timestamp: s.created_at || s.timestamp || new Date().toISOString()
          };
        }
      }
    });

    const leaderboard = Object.values(userMaxScores)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return res.status(200).json(leaderboard);
  } catch (err) {
    console.error('Supabase leaderboard error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch leaderboard from Supabase: ' + err.message });
  }
});

// 5. Personal Best (Only from Supabase)
app.get('/api/scores/personal-best', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'Username parameter is required' });
  const trimmedUser = username.trim();

  try {
    const data = await supabase('GET', 'scores', {
      query: `username=ilike.${encodeURIComponent(trimmedUser)}&select=score&order=score.desc&limit=1`
    });
    const personalBest = data && data.length > 0 ? data[0].score : 0;
    return res.status(200).json({ personalBest });
  } catch (err) {
    console.error('Supabase personal best error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch personal best from Supabase: ' + err.message });
  }
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
    console.log('Connected exclusively to Supabase Database');
  });
}
  

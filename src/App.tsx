import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Trophy, User, LogOut, ListOrdered, X, Volume2, VolumeX } from 'lucide-react';

// Slower gameplay constants
const GRAVITY = 0.35;
const JUMP_STRENGTH = -7;
const PIPE_WIDTH = 110;
const BIRD_SIZE = 65; // Increased size to fit the logo image nicely
const BIRD_X = 120; // Bird's fixed horizontal position

type GameState = 'START' | 'PLAYING' | 'GAME_OVER';

interface PipeData {
  x: number;
  topHeight: number;
  pipeGap: number;
  passed: boolean;
}

// Difficulty curves: starts between MEDIUM and HARD, gets harder over time
const getPipeGap = (currentScore: number) => {
  // Starts at 230 (wider to fit size 65 bird) and decreases to a minimum cap of 170
  return Math.max(170, 230 - currentScore * 1.5);
};

const getPipeSpeed = (currentScore: number) => {
  return Math.min(5.2, 3.0 + currentScore * 0.05);
};

const PARTICLES = [
  { symbol: '{ }', left: '5%', delay: '0s', size: '20px', duration: '25s' },
  { symbol: '</>', left: '15%', delay: '5s', size: '24px', duration: '20s' },
  { symbol: 'const', left: '25%', delay: '12s', size: '18px', duration: '28s' },
  { symbol: 'import', left: '35%', delay: '2s', size: '16px', duration: '32s' },
  { symbol: '[]', left: '45%', delay: '8s', size: '22px', duration: '22s' },
  { symbol: '=>', left: '55%', delay: '15s', size: '20px', duration: '26s' },
  { symbol: 'function', left: '65%', delay: '4s', size: '18px', duration: '30s' },
  { symbol: 'let', left: '75%', delay: '10s', size: '24px', duration: '24s' },
  { symbol: 'npm', left: '85%', delay: '1s', size: '20px', duration: '27s' },
  { symbol: 'git', left: '95%', delay: '7s', size: '18px', duration: '29s' },
  { symbol: '&&', left: '10%', delay: '18s', size: '22px', duration: '23s' },
  { symbol: '||', left: '30%', delay: '22s', size: '20px', duration: '31s' },
  { symbol: '===', left: '50%', delay: '14s', size: '16px', duration: '25s' },
  { symbol: 'React', left: '70%', delay: '9s', size: '22px', duration: '21s' },
  { symbol: 'Vite', left: '90%', delay: '16s', size: '18px', duration: '29s' },
];

const GAME_OVER_AUDIO = '/jumpscares/fahh.mp3';
const BGM_AUDIO = '/jumpscares/bgm.mp3';

const BackgroundParticles = React.memo(() => {
  return (
    <>
      {PARTICLES.map((p, idx) => (
        <div
          key={idx}
          className="absolute font-mono font-bold text-sky-900/10 pointer-events-none select-none z-0"
          style={{
            left: p.left,
            fontSize: p.size,
            animation: `float-up ${p.duration} linear infinite`,
            animationDelay: p.delay,
            bottom: '-50px',
          }}
        >
          {p.symbol}
        </div>
      ))}
    </>
  );
});

const BackgroundClouds = React.memo(() => {
  return (
    <>
      <div className="absolute top-[10%] w-32 h-12 bg-white/70 rounded-full blur-[2px] animate-cloud-1" style={{ animationDelay: '-10s' }}></div>
      <div className="absolute top-[5%] w-48 h-16 bg-white/60 rounded-full blur-[3px] animate-cloud-2" style={{ animationDelay: '-25s' }}></div>
      <div className="absolute bottom-[30%] w-40 h-14 bg-white/50 rounded-full blur-[2px] animate-cloud-3" style={{ animationDelay: '-5s' }}></div>
      <div className="absolute top-[40%] w-24 h-8 bg-white/40 rounded-full blur-[2px] animate-cloud-4" style={{ animationDelay: '-35s' }}></div>
      <div className="absolute top-[20%] w-36 h-12 bg-white/40 rounded-full blur-[2px] animate-cloud-5" style={{ animationDelay: '-18s' }}></div>
    </>
  );
});

export default function App() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  const [birdPos, setBirdPos] = useState(window.innerHeight / 2);
  const [birdVelocity, setBirdVelocity] = useState(0);
  const [pipes, setPipes] = useState<PipeData[]>([]);
  const [score, setScore] = useState(0);
  // Personal high score
  const [highScore, setHighScore] = useState<number>(0);

  // Auth States
  const [user, setUser] = useState<string | null>(localStorage.getItem('flappyUser') || null);
  const [authTab, setAuthTab] = useState<'LEADERBOARD' | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [leaderboard, setLeaderboard] = useState<{ username: string, score: number, timestamp: string }[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [bgmMuted, setBgmMuted] = useState(false);

  // Game Over and Audio Ref
  const isGameOverTriggeredRef = useRef(false);
  const gameOverAudioRef = useRef<HTMLAudioElement | null>(null);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);

  const requestRef = useRef<number | undefined>(undefined);

  // Handle window resize for full screen
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
      if (gameState === 'START') {
        setBirdPos(window.innerHeight / 2);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [gameState]);

  useEffect(() => {
    // Load high score from localStorage
    const saved = localStorage.getItem('flappyHighScore') || '0';
    setHighScore(parseInt(saved, 10));

    // Preload game over audio to memory cache
    const audio = new Audio(GAME_OVER_AUDIO);
    audio.preload = 'auto';
    audio.volume = 1.0;
    audio.load();
    gameOverAudioRef.current = audio;

    // Preload and configure BGM loop
    const bgm = new Audio(BGM_AUDIO);
    bgm.preload = 'auto';
    bgm.volume = 0.35;
    bgm.loop = true;
    bgm.load();
    bgmAudioRef.current = bgm;

    return () => {
      if (bgmAudioRef.current) {
        bgmAudioRef.current.pause();
      }
    };
  }, []);

  // Fetch and poll leaderboard when tab opens
  useEffect(() => {
    if (authTab === 'LEADERBOARD') {
      fetchLeaderboard();
      const interval = setInterval(() => {
        fetchLeaderboard();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [authTab]);

  // Sync personal bests when user changes (on login/register/guest start/reload)
  useEffect(() => {
    if (user) {
      fetchPersonalBests(user);
    }
  }, [user]);

  const fetchPersonalBests = async (username: string) => {
    try {
      const res = await fetch(`/api/scores/personal-best?username=${encodeURIComponent(username)}`);
      if (res.ok) {
        const data = await res.json();
        const pb = data.personalBest || 0;
        setHighScore(pb);
        localStorage.setItem('flappyHighScore', pb.toString());
      }
    } catch (err) {
      console.error('Error fetching personal bests:', err);
    }
  };

  const fetchLeaderboard = async () => {
    setLoadingLeaderboard(true);
    try {
      const res = await fetch('/api/scores/leaderboard');
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data);
      }
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  const handleSetUsername = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = usernameInput.trim();
    if (trimmed.length < 3) {
      setAuthError('Username must be at least 3 characters long');
      return;
    }
    setUser(trimmed);
    localStorage.setItem('flappyUser', trimmed);
    setAuthError('');
    setUsernameInput('');

    // Trigger BGM play on interaction
    if (bgmAudioRef.current && !bgmMuted) {
      bgmAudioRef.current.play().catch((err: any) => console.log("BGM play failed:", err));
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('flappyUser');
    // Reset high score on logout
    setHighScore(0);
    localStorage.removeItem('flappyHighScore');
    if (bgmAudioRef.current) {
      bgmAudioRef.current.pause();
    }
  };

  const toggleBgm = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMuted = !bgmMuted;
    setBgmMuted(newMuted);
    if (bgmAudioRef.current) {
      bgmAudioRef.current.muted = newMuted;
      if (!newMuted) {
        bgmAudioRef.current.play().catch((err: any) => console.log("BGM play failed:", err));
      }
    }
  };

  const submitScoreToBackend = async (finalScore: number) => {
    if (!user) return;
    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, score: finalScore })
      });
      if (res.ok) {
        fetchPersonalBests(user);
      }
    } catch (err) {
      console.error('Failed to submit score to backend:', err);
    }
  };

  const jump = useCallback(() => {
    if (gameState === 'PLAYING') {
      setBirdVelocity(JUMP_STRENGTH);
    }
  }, [gameState]);

  const startGame = () => {
    isGameOverTriggeredRef.current = false;
    setGameState('PLAYING');
    
    const startBirdPos = dimensions.height / 2;
    setBirdPos(startBirdPos);
    setBirdVelocity(JUMP_STRENGTH);
    
    // Spawn the first pipe closer to reduce starting gap
    const initialPipeGap = getPipeGap(0);
    const minPipeHeight = 100;
    const maxPipeHeight = dimensions.height - initialPipeGap - 100;
    const topHeight = Math.floor(Math.random() * (maxPipeHeight - minPipeHeight + 1) + minPipeHeight);
    const initialPipeX = Math.max(BIRD_X + 250, Math.min(dimensions.width * 0.75, 650));
    
    const initialPipes = [
      {
        x: initialPipeX,
        topHeight,
        pipeGap: initialPipeGap,
        passed: false,
      }
    ];
    setPipes(initialPipes);
    setScore(0);

    // Update stateRef immediately to avoid game loop reading stale initial values
    stateRef.current = {
      birdPos: startBirdPos,
      birdVelocity: JUMP_STRENGTH,
      pipes: initialPipes,
      gameState: 'PLAYING',
      dimensions,
      score: 0
    };

    // Play/resume BGM on game start
    if (bgmAudioRef.current && !bgmMuted) {
      bgmAudioRef.current.currentTime = 0;
      bgmAudioRef.current.play().catch((err: any) => console.log("BGM play failed:", err));
    }
  };

  const gameOver = useCallback(() => {
    if (isGameOverTriggeredRef.current) return;
    isGameOverTriggeredRef.current = true;
    setGameState('GAME_OVER');
    
    // Save local high score
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('flappyHighScore', score.toString());
    }

    // Submit score to backend
    if (user) {
      submitScoreToBackend(score);
    }

    // Pause BGM on game over
    if (bgmAudioRef.current) {
      bgmAudioRef.current.pause();
    }

    // Play game over audio
    if (gameOverAudioRef.current) {
      gameOverAudioRef.current.currentTime = 0;
      gameOverAudioRef.current.play().catch((e: any) => console.error("Audio playback blocked", e));
    }
  }, [score, user, highScore, bgmMuted]);

  // Ref to hold mutable state for the animation frame
  const stateRef = useRef({ birdPos, birdVelocity, pipes, gameState, dimensions, score });
  useEffect(() => {
    stateRef.current = { birdPos, birdVelocity, pipes, gameState, dimensions, score };
  }, [birdPos, birdVelocity, pipes, gameState, dimensions, score]);

  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const gameLoop = () => {
      const currentState = stateRef.current;
      const { width, height } = currentState.dimensions;
      const currentScore = currentState.score;
      const currentPipeSpeed = getPipeSpeed(currentScore);
      
      // Ground offset (visual ground height)
      const GROUND_HEIGHT = 0;
      
      // 1. Update Bird
      let newVelocity = currentState.birdVelocity + GRAVITY;
      let newBirdPos = currentState.birdPos + newVelocity;

      let crashed = false;

      // Floor / Ceiling collisions
      if (newBirdPos >= height - BIRD_SIZE - GROUND_HEIGHT) {
        newBirdPos = height - BIRD_SIZE - GROUND_HEIGHT;
        crashed = true;
      }
      if (newBirdPos <= 0) {
        newBirdPos = 0;
        crashed = true;
      }

      // 2. Update Pipes, collision check, and scoring
      let scoreIncrement = 0;
      let nextPipes = currentState.pipes.map((pipe: PipeData) => {
        const nextX = pipe.x - currentPipeSpeed;
        let passed = pipe.passed;
        
        // Tighter hitboxes
        const birdRect = {
          left: BIRD_X + 5,
          right: BIRD_X + BIRD_SIZE - 5,
          top: newBirdPos + 5,
          bottom: newBirdPos + BIRD_SIZE - 5,
        };

        const topPipeRect = {
          left: nextX,
          right: nextX + PIPE_WIDTH,
          top: 0,
          bottom: pipe.topHeight,
        };
        
        const bottomPipeRect = {
          left: nextX,
          right: nextX + PIPE_WIDTH,
          top: pipe.topHeight + pipe.pipeGap,
          bottom: height,
        };

        const hasCollision = (rect1: any, rect2: any) => {
          return (
            rect1.left < rect2.right &&
            rect1.right > rect2.left &&
            rect1.top < rect2.bottom &&
            rect1.bottom > rect2.top
          );
        };

        if (hasCollision(birdRect, topPipeRect) || hasCollision(birdRect, bottomPipeRect)) {
          crashed = true;
        }

        if (nextX + PIPE_WIDTH < birdRect.left && !passed) {
          passed = true;
          scoreIncrement++;
        }

        return { ...pipe, x: nextX, passed };
      });

      // Filter off-screen pipes
      nextPipes = nextPipes.filter((pipe: PipeData) => pipe.x > -PIPE_WIDTH * 2);

      // Spawn new pipe if needed
      const SPAWN_DISTANCE = 400; 
      if (nextPipes.length === 0 || nextPipes[nextPipes.length - 1].x < width - SPAWN_DISTANCE) {
        const nextPipeGap = getPipeGap(currentScore + scoreIncrement);
        const minPipeHeight = 100;
        const maxPipeHeight = height - nextPipeGap - 100 - GROUND_HEIGHT;
        const topHeight = Math.floor(Math.random() * (maxPipeHeight - minPipeHeight + 1) + minPipeHeight);
        
        nextPipes.push({
          x: width,
          topHeight,
          pipeGap: nextPipeGap,
          passed: false,
        });
      }

      // 3. Apply state updates and sync stateRef synchronously
      setBirdPos(newBirdPos);
      setBirdVelocity(newVelocity);
      setPipes(nextPipes);

      stateRef.current.birdPos = newBirdPos;
      stateRef.current.birdVelocity = newVelocity;
      stateRef.current.pipes = nextPipes;

      if (scoreIncrement > 0) {
        setScore((s: number) => s + scoreIncrement);
        stateRef.current.score = currentScore + scoreIncrement;
      }

      if (crashed) {
        gameOver();
        return; // Terminate loop
      }

      requestRef.current = requestAnimationFrame(gameLoop);
    };

    requestRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, gameOver]);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [jump]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none relative">
      <div 
        className="absolute inset-0 bg-gradient-to-b from-sky-400 via-sky-300 to-sky-100"
        onClick={jump}
        onPointerDown={(e) => {
            e.preventDefault();
            jump();
        }}
      >
        {/* Dynamic Floating Code Particles */}
        <BackgroundParticles />

        {/* Dynamic Animated Clouds */}
        <BackgroundClouds />

        {/* Pipes */}
        {pipes.map((pipe: PipeData, i: number) => (
          <React.Fragment key={i}>
            {/* Top Pipe */}
            <div
              className="absolute top-0 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 border-x-4 border-b-4 border-emerald-800 shadow-2xl"
              style={{
                left: pipe.x,
                width: PIPE_WIDTH,
                height: pipe.topHeight,
                borderBottomLeftRadius: '8px',
                borderBottomRightRadius: '8px',
              }}
            >
              <div className="absolute bottom-[-4px] left-[-6px] w-[calc(100%+12px)] h-10 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 border-4 border-emerald-800 rounded-sm shadow-lg"></div>
            </div>
            
            {/* Bottom Pipe */}
            <div
              className="absolute bottom-0 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 border-x-4 border-t-4 border-emerald-800 shadow-2xl"
              style={{
                left: pipe.x,
                width: PIPE_WIDTH,
                height: dimensions.height - pipe.topHeight - pipe.pipeGap,
                borderTopLeftRadius: '8px',
                borderTopRightRadius: '8px',
              }}
            >
               <div className="absolute top-[-4px] left-[-6px] w-[calc(100%+12px)] h-10 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 border-4 border-emerald-800 rounded-sm shadow-lg"></div>
            </div>
          </React.Fragment>
        ))}

        {/* Bird */}
        <div
          className="absolute z-20 flex items-center justify-center transition-transform duration-[50ms]"
          style={{
            left: BIRD_X,
            top: birdPos,
            width: BIRD_SIZE,
            height: BIRD_SIZE,
            transform: `rotate(${Math.min(Math.max(birdVelocity * 3, -25), 90)}deg)`,
          }}
        >
          <svg viewBox="0 0 60 60" className="w-full h-full filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)]">
            {/* Tail */}
            <path d="M 12 32 L 4 28 L 6 36 Z" fill="#eab308" stroke="#713f12" strokeWidth="2.5" strokeLinejoin="round" />
            
            {/* Body */}
            <circle cx="30" cy="30" r="18" fill="#facc15" stroke="#713f12" strokeWidth="3" />
            
            {/* Cheek */}
            <circle cx="25" cy="33" r="3" fill="#f97316" opacity="0.6" />
            
            {/* Eye */}
            <circle cx="40" cy="22" r="6.5" fill="white" stroke="#713f12" strokeWidth="2.5" />
            <circle cx="41" cy="22" r="2.5" fill="black" />
            <circle cx="42.5" cy="20.5" r="1" fill="white" />
            
            {/* Beak */}
            <path d="M 44 26 L 54 29 L 42 34 Z" fill="#f97316" stroke="#713f12" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M 42 30 L 50 31" stroke="#713f12" strokeWidth="2" strokeLinecap="round" />
            
            {/* Wing (Animated) */}
            <path 
              d="M 22 28 C 12 22, 10 38, 22 36 C 24 35, 24 30, 22 28 Z" 
              fill="white" 
              stroke="#713f12" 
              strokeWidth="2.5" 
              className="animate-wing"
              style={{ transformOrigin: '22px 32px' }}
            />
          </svg>
        </div>

        {/* HUD / UI */}
        <div className="absolute inset-0 pointer-events-none z-30 p-8 flex flex-col justify-between">
          
          {/* Top Bar: Score & High Score */}
          <div className="flex justify-between items-start">
            <div className="bg-white border-4 border-slate-950 px-8 py-3 rounded-2xl text-slate-950 font-bold font-game text-2xl shadow-[4px_4px_0px_0px_rgba(2,6,23,1)]">
              {score}
            </div>
            <div className="flex items-center gap-3 bg-white border-4 border-slate-950 px-6 py-3 rounded-2xl text-slate-950 font-bold font-game text-sm shadow-[4px_4px_0px_0px_rgba(2,6,23,1)]">
              <Trophy size={18} className="text-yellow-500 fill-yellow-500" />
              <span>{highScore}</span>
            </div>
          </div>

          {/* Overlays */}
          {gameState !== 'PLAYING' && (
            <div 
              className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-xs z-40 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="bg-[#1e293b] p-8 rounded-3xl border-4 border-slate-950 shadow-[10px_10px_0px_0px_rgba(2,6,23,1)] text-center transform transition-all max-w-md w-full mx-4 text-white relative">
                
                {!user ? (
                  /* Username Input Screen */
                  <>
                    <h1 className="text-2xl font-bold font-game text-yellow-400 mb-2 drop-shadow-[3px_3px_0px_rgba(2,6,23,1)] uppercase tracking-wider">
                      Flappy Bird
                    </h1>
                    <p className="text-slate-300 font-bold text-xs mb-6 font-sans">
                      Enter a username to start playing
                    </p>

                    {authError && <p className="text-xs text-rose-400 font-bold mb-4 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg text-left">{authError}</p>}

                    <form onSubmit={handleSetUsername} className="flex flex-col text-left">
                      <label className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1.5 pl-1">Username</label>
                      <div className="flex items-center bg-slate-900 border-2 border-slate-950 rounded-xl px-3 py-2.5 mb-6">
                        <User size={16} className="text-slate-400 mr-2" />
                        <input 
                          type="text" 
                          required
                          value={usernameInput}
                          onChange={(e) => setUsernameInput(e.target.value)}
                          placeholder="username" 
                          className="bg-transparent border-none outline-none text-sm w-full text-white placeholder-slate-500 font-sans" 
                        />
                      </div>

                      <button 
                        type="submit" 
                        className="w-full py-3.5 rounded-xl font-bold font-game text-xs text-slate-950 bg-sky-400 border-2 border-slate-950 shadow-[4px_4px_0px_0px_rgba(2,6,23,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(2,6,23,1)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-[0px_0px_0px_0px_rgba(2,6,23,1)] transition-all cursor-pointer"
                      >
                        Let's Play
                      </button>
                    </form>
                  </>
                ) : (
                  /* Authenticated Screens (Leaderboard or Main Menu) */
                  <>
                    {authTab === 'LEADERBOARD' ? (
                      <div className="flex flex-col text-left">
                        <div className="flex justify-between items-center mb-4">
                          <h2 className="text-lg font-bold font-game flex items-center gap-2 text-yellow-400 drop-shadow-[2px_2px_0px_rgba(2,6,23,1)]">
                            <ListOrdered size={18} className="text-amber-400" /> Leaderboard
                          </h2>
                          <button type="button" onClick={() => setAuthTab(null)} className="text-slate-400 hover:text-white cursor-pointer">
                            <X size={20} />
                          </button>
                        </div>

                        <div className="bg-slate-900 border-2 border-slate-950 rounded-2xl overflow-hidden max-h-[250px] overflow-y-auto shadow-[4px_4px_0px_0px_rgba(2,6,23,1)]">
                          {loadingLeaderboard ? (
                            <p className="text-xs text-center py-8 text-slate-400 font-game">Loading...</p>
                          ) : leaderboard.length === 0 ? (
                            <p className="text-xs text-center py-8 text-slate-400 font-game">No high scores!</p>
                          ) : (
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-slate-950/40 bg-slate-950 text-slate-400 font-bold font-game text-[9px] uppercase tracking-wider">
                                  <th className="p-3 text-center w-12">Rank</th>
                                  <th className="p-3">Player</th>
                                  <th className="p-3 text-right">Score</th>
                                </tr>
                              </thead>
                              <tbody>
                                {leaderboard.map((item: { username: string, score: number, timestamp: string }, idx: number) => (
                                  <tr key={idx} className="border-b border-slate-950/20 hover:bg-white/5 transition-colors font-game text-[9px]">
                                    <td className="p-3 text-center font-bold">
                                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                                    </td>
                                    <td className="p-3 font-semibold text-white font-sans text-xs">{item.username}</td>
                                    <td className="p-3 text-right font-bold text-sky-400">{item.score}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Main Menu View */
                      <>
                        {/* User profile header & BGM Toggle centered cleanly */}
                        <div className="flex justify-center items-center gap-3 mb-6 text-xs pointer-events-auto">
                          <div className="flex items-center gap-2 bg-slate-900 border-2 border-slate-950 px-4 py-2 rounded-xl shadow-[2px_2px_0px_0px_rgba(2,6,23,1)]">
                            <span className="font-bold text-sky-400">👤 {user}</span>
                            <button 
                              onClick={handleLogout}
                              title="Log Out"
                              className="text-slate-400 hover:text-rose-400 cursor-pointer transition-colors"
                            >
                              <LogOut size={14} />
                            </button>
                          </div>
                          
                          <button
                            onClick={toggleBgm}
                            className="p-2 bg-slate-900 border-2 border-slate-950 rounded-xl shadow-[2px_2px_0px_0px_rgba(2,6,23,1)] text-slate-300 hover:text-white cursor-pointer transition-colors"
                            title={bgmMuted ? "Unmute BGM" : "Mute BGM"}
                          >
                            {bgmMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                          </button>
                        </div>

                        <h1 className="text-3xl font-bold font-game text-yellow-400 mb-2 drop-shadow-[4px_4px_0px_rgba(2,6,23,1)] uppercase tracking-wider">
                          Flappy Bird
                        </h1>
                        
                        <p className="text-slate-300 font-bold text-xs mb-6 font-sans">
                          {gameState === 'GAME_OVER' ? '💻 You crashed!' : '🚀 Flap through the obstacles'}
                        </p>

                        {/* Score Dashboard */}
                        {gameState === 'START' ? (
                          <div className="bg-slate-900 border-2 border-slate-950 rounded-2xl p-4 mb-6 flex items-center justify-between shadow-[4px_4px_0px_0px_rgba(2,6,23,1)]">
                            <div className="flex items-center gap-3">
                              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl">
                                <Trophy size={22} fill="currentColor" />
                              </div>
                              <div className="text-left">
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest font-sans">Personal Best</p>
                                <p className="text-xl font-bold text-white font-game">{highScore}</p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-slate-900 border-2 border-slate-950 rounded-2xl p-4 flex flex-col items-center shadow-[4px_4px_0px_0px_rgba(2,6,23,1)]">
                              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1 font-sans">Score</p>
                              <p className="text-xl font-bold text-sky-400 font-game">{score}</p>
                            </div>
                            <div className="bg-slate-900 border-2 border-slate-950 rounded-2xl p-4 flex flex-col items-center shadow-[4px_4px_0px_0px_rgba(2,6,23,1)]">
                              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1 font-sans">Best</p>
                              <p className="text-xl font-bold text-amber-400 font-game">{highScore}</p>
                            </div>
                          </div>
                        )}

                        {/* Menu Actions */}
                        <div className="flex flex-col gap-3 pointer-events-auto">
                          <button 
                            onClick={(e) => { e.stopPropagation(); startGame(); }}
                            className="w-full py-3.5 rounded-xl font-bold font-game text-xs text-slate-950 bg-yellow-400 border-2 border-slate-950 shadow-[4px_4px_0px_0px_rgba(2,6,23,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(2,6,23,1)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-[0px_0px_0px_0px_rgba(2,6,23,1)] transition-all cursor-pointer flex items-center justify-center gap-2"
                          >
                            <Play size={14} fill="currentColor" />
                            {gameState === 'START' ? 'Start Game' : 'Restart Game'}
                          </button>

                          <button 
                            onClick={() => setAuthTab('LEADERBOARD')}
                            className="w-full py-3.5 rounded-xl font-bold font-game text-xs text-white bg-slate-800 border-2 border-slate-950 shadow-[4px_4px_0px_0px_rgba(2,6,23,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(2,6,23,1)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-[0px_0px_0px_0px_rgba(2,6,23,1)] transition-all cursor-pointer flex items-center justify-center gap-2"
                          >
                            <ListOrdered size={14} className="text-amber-400" />
                            View Leaderboard
                          </button>
                        </div>

                        <p className="text-[10px] text-slate-500 font-bold mt-4 font-sans">
                          {gameState === 'START' ? 'Press Space or click screen to jump once started' : 'Press Restart to play again'}
                        </p>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}



        </div>
      </div>
    </div>
  );
}

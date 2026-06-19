import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, RotateCcw, Trophy, User, Lock, LogOut, ListOrdered, X } from 'lucide-react';

// Slower gameplay constants
const GRAVITY = 0.35;
const JUMP_STRENGTH = -7;
const PIPE_WIDTH = 90;
const BIRD_SIZE = 50; // Increased size to fit the logo image nicely
const BIRD_X = 120; // Bird's fixed horizontal position

type GameState = 'START' | 'PLAYING' | 'GAME_OVER';
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

interface PipeData {
  x: number;
  topHeight: number;
  passed: boolean;
}

interface DifficultySettings {
  pipeGap: number;
  spawnDistance: number;
  pipeSpeed: number;
}

const DIFFICULTY_CONFIG: Record<Difficulty, DifficultySettings> = {
  EASY: {
    pipeGap: 280, // Very wide vertical gap
    spawnDistance: 300, // Frequent pipes
    pipeSpeed: 1.8, // Slow motion speed
  },
  MEDIUM: {
    pipeGap: 210, // Standard gap
    spawnDistance: 390, // Standard spacing
    pipeSpeed: 2.9, // Standard speed
  },
  HARD: {
    pipeGap: 145, // Extremely narrow gap
    spawnDistance: 480, // More spacing to allow reaction at high speed
    pipeSpeed: 4.2, // Extremely fast speed
  },
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

export default function App() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  const [birdPos, setBirdPos] = useState(window.innerHeight / 2);
  const [birdVelocity, setBirdVelocity] = useState(0);
  const [pipes, setPipes] = useState<PipeData[]>([]);
  const [score, setScore] = useState(0);
  
  // Difficulty-specific high scores
  const [highScores, setHighScores] = useState<Record<Difficulty, number>>({
    EASY: 0,
    MEDIUM: 0,
    HARD: 0
  });

  // Auth States
  const [user, setUser] = useState<string | null>(localStorage.getItem('flappyUser') || null);
  const [authTab, setAuthTab] = useState<'LOGIN' | 'REGISTER' | 'LEADERBOARD' | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [leaderboard, setLeaderboard] = useState<{ username: string, score: number, timestamp: string }[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [compulsoryTab, setCompulsoryTab] = useState<'LOGIN' | 'REGISTER' | 'GUEST'>('LOGIN');
  const [guestNameInput, setGuestNameInput] = useState('');

  // Jumpscare States
  const [jumpscareActive, setJumpscareActive] = useState(false);
  const [jumpscareImg, setJumpscareImg] = useState('');
  const isGameOverTriggeredRef = useRef(false);
  const remainingImagesRef = useRef<string[]>([]);
  const preloadedAudiosRef = useRef<Record<string, HTMLAudioElement>>({});
  const remainingAudiosRef = useRef<string[]>([]);

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
    // Load high scores from localStorage
    const easy = localStorage.getItem('flappyHighScore_EASY') || '0';
    const medium = localStorage.getItem('flappyHighScore_MEDIUM') || '0';
    const hard = localStorage.getItem('flappyHighScore_HARD') || '0';
    setHighScores({
      EASY: parseInt(easy, 10),
      MEDIUM: parseInt(medium, 10),
      HARD: parseInt(hard, 10)
    });

    // Preload jumpscare audios to memory cache
    const audiosToPreload = [
      '/jumpscares/fahh.mp3',
      '/jumpscares/ganekajuice_memetemplatespro.mp3',
      '/jumpscares/gian-hain-aap.mp3',
      '/jumpscares/goofy-uhhh-indian-sound.mp3',
      '/jumpscares/memetemplatespro.in MkbAagAmitabhBachchan.mp3',
      '/jumpscares/modi-ji-bkl.mp3',
      '/jumpscares/scream.mp3'
    ];
    audiosToPreload.forEach((src) => {
      const audio = new Audio(src);
      audio.volume = 1.0;
      preloadedAudiosRef.current[src] = audio;
    });

    // Preload jumpscare images to memory cache for zero-delay loading
    const imagesToPreload = [
      '/jumpscares/scary_face.png', 
      '/jumpscares/scary_face_2.png',
      '/jumpscares/WhatsApp Image 2026-06-20 at 12.05.57 AM.jpeg',
      '/jumpscares/WhatsApp Image 2026-06-20 at 12.07.46 AM.jpeg',
      '/jumpscares/WhatsApp Image 2026-06-20 at 12.08.30 AM.jpeg',
      '/jumpscares/Screenshot 2026-06-19 235947.png',
      '/jumpscares/Screenshot 2026-06-20 001111.png',
      '/jumpscares/Screenshot 2026-06-20 004037.png',
      '/jumpscares/Screenshot 2026-06-20 005417.png',
      '/jumpscares/Screenshot 2026-06-20 005422.png'
    ];
    imagesToPreload.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  // Fetch leaderboard when tab opens
  useEffect(() => {
    if (authTab === 'LEADERBOARD') {
      fetchLeaderboard(difficulty);
    }
  }, [authTab, difficulty]);

  const fetchLeaderboard = async (diff: Difficulty) => {
    setLoadingLeaderboard(true);
    try {
      const res = await fetch(`/api/scores/leaderboard?difficulty=${diff}`);
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Registration failed');
      } else {
        setAuthMessage('Account created! Please log in.');
        setAuthTab('LOGIN');
        setPasswordInput('');
      }
    } catch (err) {
      setAuthError('Connection error');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Login failed');
      } else {
        setUser(data.username);
        localStorage.setItem('flappyUser', data.username);
        setAuthTab(null);
        setUsernameInput('');
        setPasswordInput('');
      }
    } catch (err) {
      setAuthError('Connection error');
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('flappyUser');
  };

  const handleGuestPlay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestNameInput.trim()) return;
    const name = `${guestNameInput.trim()} (Guest)`;
    setUser(name);
    localStorage.setItem('flappyUser', name);
    setGuestNameInput('');
  };

  const submitScoreToBackend = async (finalScore: number, finalDiff: Difficulty) => {
    if (!user) return;
    try {
      await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, score: finalScore, difficulty: finalDiff })
      });
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
    setBirdPos(dimensions.height / 2);
    setBirdVelocity(JUMP_STRENGTH);
    
    // Spawn the first pipe closer to reduce starting gap
    const config = DIFFICULTY_CONFIG[difficulty];
    const GROUND_HEIGHT = 40;
    const minPipeHeight = 100;
    const maxPipeHeight = dimensions.height - config.pipeGap - 100 - GROUND_HEIGHT;
    const topHeight = Math.floor(Math.random() * (maxPipeHeight - minPipeHeight + 1) + minPipeHeight);
    const initialPipeX = Math.max(BIRD_X + 250, Math.min(dimensions.width * 0.75, 650));
    
    setPipes([
      {
        x: initialPipeX,
        topHeight,
        passed: false,
      }
    ]);
    setScore(0);
  };

  const gameOver = useCallback(() => {
    if (isGameOverTriggeredRef.current) return;
    isGameOverTriggeredRef.current = true;
    setGameState('GAME_OVER');
    
    // Save difficulty-specific local high scores
    const currentHighScore = highScores[difficulty];
    if (score > currentHighScore) {
      setHighScores(prev => {
        const updated = { ...prev, [difficulty]: score };
        localStorage.setItem(`flappyHighScore_${difficulty}`, score.toString());
        return updated;
      });
    }

    // Submit score to backend
    if (user) {
      submitScoreToBackend(score, difficulty);
    }

    // Jumpscare trigger logic: TRIGGER EVERY TIME
    const images = [
      '/jumpscares/scary_face.png', 
      '/jumpscares/scary_face_2.png',
      '/jumpscares/WhatsApp Image 2026-06-20 at 12.05.57 AM.jpeg',
      '/jumpscares/WhatsApp Image 2026-06-20 at 12.07.46 AM.jpeg',
      '/jumpscares/WhatsApp Image 2026-06-20 at 12.08.30 AM.jpeg',
      '/jumpscares/Screenshot 2026-06-19 235947.png',
      '/jumpscares/Screenshot 2026-06-20 001111.png',
      '/jumpscares/Screenshot 2026-06-20 004037.png',
      '/jumpscares/Screenshot 2026-06-20 005417.png',
      '/jumpscares/Screenshot 2026-06-20 005422.png'
    ];

    // Shuffle images if remaining queue is empty, ensuring fully randomized non-repeating cycle
    if (remainingImagesRef.current.length === 0) {
      remainingImagesRef.current = [...images].sort(() => Math.random() - 0.5);
    }
    const nextImg = remainingImagesRef.current.pop() || images[0];
    setJumpscareImg(nextImg);
    
    // Audio selection: Shuffle audios if remaining queue is empty, ensuring fully randomized non-repeating cycle
    const audioSources = [
      '/jumpscares/fahh.mp3',
      '/jumpscares/ganekajuice_memetemplatespro.mp3',
      '/jumpscares/gian-hain-aap.mp3',
      '/jumpscares/goofy-uhhh-indian-sound.mp3',
      '/jumpscares/memetemplatespro.in MkbAagAmitabhBachchan.mp3',
      '/jumpscares/modi-ji-bkl.mp3',
      '/jumpscares/scream.mp3'
    ];
    
    if (remainingAudiosRef.current.length === 0) {
      remainingAudiosRef.current = [...audioSources].sort(() => Math.random() - 0.5);
    }
    const nextAudioSrc = remainingAudiosRef.current.pop() || audioSources[0];
    const audio = preloadedAudiosRef.current[nextAudioSrc] || new Audio(nextAudioSrc);
    
    audio.currentTime = 0;
    audio.play().catch(e => console.error("Audio playback blocked", e));
    
    setJumpscareActive(true);
    setTimeout(() => {
      setJumpscareActive(false);
    }, 1500);
  }, [score, difficulty, user, highScores]);

  // Ref to hold mutable state for the animation frame
  const stateRef = useRef({ birdPos, birdVelocity, pipes, gameState, dimensions, difficulty });
  useEffect(() => {
    stateRef.current = { birdPos, birdVelocity, pipes, gameState, dimensions, difficulty };
  }, [birdPos, birdVelocity, pipes, gameState, dimensions, difficulty]);

  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const gameLoop = () => {
      const currentState = stateRef.current;
      const { width, height } = currentState.dimensions;
      const currentDifficulty = currentState.difficulty;
      const config = DIFFICULTY_CONFIG[currentDifficulty];
      
      // Ground offset (visual ground height)
      const GROUND_HEIGHT = 40;
      
      // Update Bird
      let newVelocity = currentState.birdVelocity + GRAVITY;
      let newBirdPos = currentState.birdPos + newVelocity;

      // Floor / Ceiling collisions
      if (newBirdPos >= height - BIRD_SIZE - GROUND_HEIGHT) {
        newBirdPos = height - BIRD_SIZE - GROUND_HEIGHT;
        gameOver();
      }
      if (newBirdPos <= 0) {
        newBirdPos = 0;
        gameOver();
      }

      setBirdPos(newBirdPos);
      setBirdVelocity(newVelocity);

      // Update Pipes
      setPipes((currentPipes) => {
        let newPipes = currentPipes
          .map((pipe) => ({ ...pipe, x: pipe.x - config.pipeSpeed }))
          .filter((pipe) => pipe.x > -PIPE_WIDTH * 2);

        // Spawn new pipe based on screen width
        // Spawn when the last pipe is far enough away
        const spawnDistance = config.spawnDistance; 
        
        if (newPipes.length === 0 || newPipes[newPipes.length - 1].x < width - spawnDistance) {
          const minPipeHeight = 100;
          const maxPipeHeight = height - config.pipeGap - 100 - GROUND_HEIGHT;
          const topHeight = Math.floor(Math.random() * (maxPipeHeight - minPipeHeight + 1) + minPipeHeight);
          
          newPipes.push({
            x: width,
            topHeight,
            passed: false,
          });
        }
        return newPipes;
      });

      requestRef.current = requestAnimationFrame(gameLoop);
    };

    requestRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, gameOver]);

  // Collision and Score Detection
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const config = DIFFICULTY_CONFIG[difficulty];
    const birdRect = {
      left: BIRD_X + 5, // Tighter horizontal hitbox for the image
      right: BIRD_X + BIRD_SIZE - 5,
      top: birdPos + 5, // Tighter vertical hitbox
      bottom: birdPos + BIRD_SIZE - 5,
    };

    let crashed = false;

    for (let pipe of pipes) {
      // Top pipe rect
      const topPipeRect = {
        left: pipe.x,
        right: pipe.x + PIPE_WIDTH,
        top: 0,
        bottom: pipe.topHeight,
      };
      
      // Bottom pipe rect
      const bottomPipeRect = {
        left: pipe.x,
        right: pipe.x + PIPE_WIDTH,
        top: pipe.topHeight + config.pipeGap,
        bottom: dimensions.height,
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

      // Check passing for score
      if (pipe.x + PIPE_WIDTH < birdRect.left && !pipe.passed) {
        setScore((s) => s + 1);
        setPipes((p) => p.map(p2 => p2 === pipe ? { ...p2, passed: true } : p2));
      }
    }

    if (crashed) {
      gameOver();
    }
  }, [birdPos, pipes, gameState, gameOver, dimensions.height, difficulty]);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
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

        {/* Dynamic Animated Clouds */}
        <div className="absolute top-[10%] w-32 h-12 bg-white/70 rounded-full blur-[2px] animate-cloud-1" style={{ animationDelay: '-10s' }}></div>
        <div className="absolute top-[5%] w-48 h-16 bg-white/60 rounded-full blur-[3px] animate-cloud-2" style={{ animationDelay: '-25s' }}></div>
        <div className="absolute bottom-[30%] w-40 h-14 bg-white/50 rounded-full blur-[2px] animate-cloud-3" style={{ animationDelay: '-5s' }}></div>
        <div className="absolute top-[40%] w-24 h-8 bg-white/40 rounded-full blur-[2px] animate-cloud-4" style={{ animationDelay: '-35s' }}></div>
        <div className="absolute top-[20%] w-36 h-12 bg-white/40 rounded-full blur-[2px] animate-cloud-5" style={{ animationDelay: '-18s' }}></div>

        {/* Pipes */}
        {pipes.map((pipe, i) => (
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
              className="absolute bottom-10 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 border-x-4 border-t-4 border-emerald-800 shadow-2xl"
              style={{
                left: pipe.x,
                width: PIPE_WIDTH,
                height: dimensions.height - pipe.topHeight - DIFFICULTY_CONFIG[difficulty].pipeGap - 40, // 40 is ground height
                borderTopLeftRadius: '8px',
                borderTopRightRadius: '8px',
              }}
            >
               <div className="absolute top-[-4px] left-[-6px] w-[calc(100%+12px)] h-10 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 border-4 border-emerald-800 rounded-sm shadow-lg"></div>
            </div>
          </React.Fragment>
        ))}

        {/* Ground */}
        <div 
          className="absolute bottom-0 w-full h-10 bg-[#ded895] border-t-8 border-[#73bf2e] z-10"
          style={{ 
            backgroundSize: '30px 30px', 
            backgroundImage: 'linear-gradient(45deg, #d4ce8c 25%, transparent 25%, transparent 75%, #d4ce8c 75%, #d4ce8c), linear-gradient(45deg, #d4ce8c 25%, transparent 25%, transparent 75%, #d4ce8c 75%, #d4ce8c)', 
            backgroundPosition: '0 0, 15px 15px' 
          }}
        ></div>

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
            <div className="bg-white/40 backdrop-blur-xl px-8 py-3 rounded-3xl text-white font-black text-5xl shadow-2xl border-2 border-white/50 text-shadow-lg">
              {score}
            </div>
            <div className="flex items-center gap-3 bg-black/40 backdrop-blur-xl px-6 py-3 rounded-2xl text-white font-bold shadow-2xl border-2 border-white/20">
              <Trophy size={24} className="text-yellow-400 drop-shadow-lg" />
              <span className="text-2xl">{highScores[difficulty]}</span>
            </div>
          </div>

          {/* Overlays */}
          {gameState !== 'PLAYING' && (
            <div 
              className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/50 backdrop-blur-sm z-40 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="bg-slate-900/90 backdrop-blur-xl p-8 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-center transform transition-all border border-white/10 max-w-md w-full mx-4 text-white relative">
                
                {!user ? (
                  /* Compulsory Authentication Screen */
                  <>
                    <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 mb-2 drop-shadow-sm pb-1 tracking-wider uppercase">
                      Flappy Dev
                    </h1>
                    <p className="text-slate-400 font-bold text-xs mb-6">
                      Identify yourself to build the project
                    </p>

                    {/* Tabs to select method */}
                    <div className="flex gap-1 mb-6 bg-white/5 p-1 rounded-xl">
                      {(['LOGIN', 'REGISTER', 'GUEST'] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => {
                            setCompulsoryTab(tab);
                            setAuthError('');
                            setAuthMessage('');
                          }}
                          className={`flex-1 py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
                            compulsoryTab === tab
                              ? 'bg-white/10 text-white shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {tab === 'LOGIN' ? 'Login' : tab === 'REGISTER' ? 'Register' : 'Guest'}
                        </button>
                      ))}
                    </div>

                    {authError && <p className="text-xs text-rose-400 font-bold mb-4 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg text-left">{authError}</p>}
                    {authMessage && <p className="text-xs text-emerald-400 font-bold mb-4 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg text-left">{authMessage}</p>}

                    {compulsoryTab === 'LOGIN' && (
                      <form onSubmit={handleLogin} className="flex flex-col text-left">
                        <label className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1.5 pl-1">Username</label>
                        <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 mb-4">
                          <User size={16} className="text-slate-400 mr-2" />
                          <input 
                            type="text" 
                            required
                            value={usernameInput}
                            onChange={(e) => setUsernameInput(e.target.value)}
                            placeholder="username" 
                            className="bg-transparent border-none outline-none text-sm w-full text-white placeholder-slate-500" 
                          />
                        </div>

                        <label className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1.5 pl-1">Password</label>
                        <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 mb-6">
                          <Lock size={16} className="text-slate-400 mr-2" />
                          <input 
                            type="password" 
                            required
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            placeholder="••••••••" 
                            className="bg-transparent border-none outline-none text-sm w-full text-white placeholder-slate-500" 
                          />
                        </div>

                        <button 
                          type="submit" 
                          className="w-full py-3.5 rounded-xl font-black text-sm text-white bg-sky-500 hover:bg-sky-600 transition-all cursor-pointer font-bold"
                        >
                          Login
                        </button>
                      </form>
                    )}

                    {compulsoryTab === 'REGISTER' && (
                      <form onSubmit={handleRegister} className="flex flex-col text-left">
                        <label className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1.5 pl-1">Username</label>
                        <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 mb-4">
                          <User size={16} className="text-slate-400 mr-2" />
                          <input 
                            type="text" 
                            required
                            value={usernameInput}
                            onChange={(e) => setUsernameInput(e.target.value)}
                            placeholder="3+ characters" 
                            className="bg-transparent border-none outline-none text-sm w-full text-white placeholder-slate-500" 
                          />
                        </div>

                        <label className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1.5 pl-1">Password</label>
                        <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 mb-6">
                          <Lock size={16} className="text-slate-400 mr-2" />
                          <input 
                            type="password" 
                            required
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            placeholder="4+ characters" 
                            className="bg-transparent border-none outline-none text-sm w-full text-white placeholder-slate-500" 
                          />
                        </div>

                        <button 
                          type="submit" 
                          className="w-full py-3.5 rounded-xl font-black text-sm text-white bg-emerald-500 hover:bg-emerald-600 transition-all cursor-pointer font-bold"
                        >
                          Create Account
                        </button>
                      </form>
                    )}

                    {compulsoryTab === 'GUEST' && (
                      <form onSubmit={handleGuestPlay} className="flex flex-col text-left">
                        <label className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1.5 pl-1">Guest Display Name</label>
                        <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 mb-6">
                          <User size={16} className="text-slate-400 mr-2" />
                          <input 
                            type="text" 
                            required
                            value={guestNameInput}
                            onChange={(e) => setGuestNameInput(e.target.value)}
                            placeholder="Enter guest name..." 
                            className="bg-transparent border-none outline-none text-sm w-full text-white placeholder-slate-500" 
                          />
                        </div>

                        <button 
                          type="submit" 
                          className="w-full py-3.5 rounded-xl font-black text-sm text-white bg-blue-500 hover:bg-blue-600 transition-all cursor-pointer font-bold"
                        >
                          Play as Guest
                        </button>
                      </form>
                    )}
                  </>
                ) : (
                  /* Authenticated Screens (Leaderboard or Main Menu) */
                  <>
                    {authTab === 'LEADERBOARD' ? (
                      <div className="flex flex-col text-left">
                        <div className="flex justify-between items-center mb-4">
                          <h2 className="text-2xl font-black flex items-center gap-2">
                            <ListOrdered size={22} className="text-amber-400" /> Leaderboard
                          </h2>
                          <button type="button" onClick={() => setAuthTab(null)} className="text-slate-400 hover:text-white cursor-pointer">
                            <X size={20} />
                          </button>
                        </div>

                        {/* Difficulty Tab Selector for Leaderboard */}
                        <div className="flex gap-1 mb-4 bg-white/5 p-1 rounded-xl">
                          {(['EASY', 'MEDIUM', 'HARD'] as const).map((diff) => (
                            <button
                              key={diff}
                              onClick={() => setDifficulty(diff)}
                              className={`flex-1 py-1.5 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
                                difficulty === diff
                                  ? 'bg-white/10 text-white shadow-sm'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {diff}
                            </button>
                          ))}
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden max-h-[250px] overflow-y-auto">
                          {loadingLeaderboard ? (
                            <p className="text-xs text-center py-8 text-slate-400">Loading scores...</p>
                          ) : leaderboard.length === 0 ? (
                            <p className="text-xs text-center py-8 text-slate-400">No high scores yet on {difficulty}!</p>
                          ) : (
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-white/10 bg-white/5 text-slate-400 font-black">
                                  <th className="p-3 text-center w-12">Rank</th>
                                  <th className="p-3">Player</th>
                                  <th className="p-3 text-right">Score</th>
                                </tr>
                              </thead>
                              <tbody>
                                {leaderboard.map((item, idx) => (
                                  <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                    <td className="p-3 text-center font-bold">
                                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                                    </td>
                                    <td className="p-3 font-semibold text-white">{item.username}</td>
                                    <td className="p-3 text-right font-black text-sky-400">{item.score}</td>
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
                        {/* User profile header */}
                        <div className="absolute top-4 right-4 flex items-center gap-2 text-xs">
                          <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
                            <span className="font-bold text-sky-400">👤 {user}</span>
                            <button 
                              onClick={handleLogout}
                              title="Log Out"
                              className="text-slate-400 hover:text-rose-400 cursor-pointer transition-colors"
                            >
                              <LogOut size={12} />
                            </button>
                          </div>
                        </div>

                        <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 mb-2 drop-shadow-sm pb-1 tracking-wider uppercase">
                          Flappy Dev
                        </h1>
                        
                        <p className="text-slate-400 font-bold text-sm mb-6">
                          {gameState === 'GAME_OVER' ? '💻 You crashed the code!' : '🚀 Refactor and fly through the obstacles'}
                        </p>

                        {/* Score Dashboard */}
                        {gameState === 'START' ? (
                          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl">
                                <Trophy size={22} fill="currentColor" />
                              </div>
                              <div className="text-left">
                                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Personal Best ({difficulty})</p>
                                <p className="text-2xl font-black text-white">{highScores[difficulty]}</p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center">
                              <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Score</p>
                              <p className="text-3xl font-black text-sky-400">{score}</p>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center">
                              <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Best ({difficulty})</p>
                              <p className="text-3xl font-black text-amber-400">{highScores[difficulty]}</p>
                            </div>
                          </div>
                        )}

                        {/* Difficulty Selector */}
                        <div className="mb-6 pointer-events-auto">
                          <p className="text-xs text-slate-400 uppercase font-black tracking-widest mb-3 text-left pl-1">Select Difficulty</p>
                          <div className="flex gap-2 justify-center">
                            {(['EASY', 'MEDIUM', 'HARD'] as const).map((diff) => {
                              const isActive = difficulty === diff;
                              let btnClass = "flex-1 py-3 rounded-xl font-black text-xs transition-all duration-300 border cursor-pointer ";
                              if (isActive) {
                                if (diff === 'EASY') btnClass += "bg-emerald-500 text-white border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)] scale-[1.03]";
                                else if (diff === 'MEDIUM') btnClass += "bg-amber-500 text-white border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)] scale-[1.03]";
                                else btnClass += "bg-rose-500 text-white border-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.4)] scale-[1.03]";
                              } else {
                                btnClass += "bg-white/5 text-slate-400 border-white/5 hover:bg-white/10 hover:text-white";
                              }
                              return (
                                <button
                                  key={diff}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDifficulty(diff);
                                  }}
                                  className={btnClass}
                                >
                                  {diff}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Menu Actions */}
                        <div className="flex flex-col gap-3 pointer-events-auto">
                          <button 
                            onClick={(e) => { e.stopPropagation(); startGame(); }}
                            className="w-full py-4 rounded-xl font-black text-md text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 active:scale-95 transition-all duration-300 cursor-pointer flex items-center justify-center gap-2"
                          >
                            {gameState === 'START' ? (
                              <>
                                <Play size={18} fill="currentColor" />
                                Confirm & Start
                              </>
                            ) : (
                              <>
                                <RotateCcw size={18} />
                                Confirm & Restart
                              </>
                            )}
                          </button>

                          <button 
                            onClick={() => setAuthTab('LEADERBOARD')}
                            className="w-full py-3 rounded-xl font-black text-xs text-slate-300 bg-white/5 hover:bg-white/10 border border-white/5 transition-all duration-300 cursor-pointer flex items-center justify-center gap-2"
                          >
                            <ListOrdered size={14} className="text-amber-400" />
                            View Leaderboard
                          </button>
                        </div>

                        <p className="text-[10px] text-slate-500 font-bold mt-4">
                          {gameState === 'START' ? 'Press Space or click screen to jump once started' : 'Select difficulty and press Restart to play again'}
                        </p>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

        {/* Jumpscare Overlay */}
        {jumpscareActive && (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center pointer-events-none">
            <div className="w-[90vw] h-[90vh] max-w-5xl max-h-[85vh] animate-jumpscare-shake flex items-center justify-center">
              <img 
                src={jumpscareImg} 
                alt="👻 JUMPSCARE 👻" 
                className="w-full h-full object-contain filter drop-shadow-[0_0_30px_rgba(244,63,94,0.6)]"
              />
            </div>
          </div>
        )}

        </div>
      </div>
    </div>
  );
}

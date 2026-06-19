import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, RotateCcw, Trophy } from 'lucide-react';

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
    width: Math.min(window.innerWidth, 480),
    height: Math.min(window.innerHeight, 720)
  });
  const [birdPos, setBirdPos] = useState(Math.min(window.innerHeight, 720) / 2);
  const [birdVelocity, setBirdVelocity] = useState(0);
  const [pipes, setPipes] = useState<PipeData[]>([]);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);

  const requestRef = useRef<number | undefined>(undefined);

  // Handle window resize for full screen
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: Math.min(window.innerWidth, 480),
        height: Math.min(window.innerHeight, 720)
      });
      if (gameState === 'START') {
        setBirdPos(Math.min(window.innerHeight, 720) / 2);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [gameState]);

  useEffect(() => {
    const savedScore = localStorage.getItem('flappyHighScore');
    if (savedScore) setHighScore(parseInt(savedScore, 10));
  }, []);

  const jump = useCallback(() => {
    if (gameState === 'PLAYING') {
      setBirdVelocity(JUMP_STRENGTH);
    } else if (gameState === 'START' || gameState === 'GAME_OVER') {
      startGame();
    }
  }, [gameState]);

  const startGame = () => {
    setGameState('PLAYING');
    setBirdPos(dimensions.height / 2);
    setBirdVelocity(JUMP_STRENGTH);
    
    // Spawn the first pipe closer to reduce starting gap
    const config = DIFFICULTY_CONFIG[difficulty];
    const GROUND_HEIGHT = 40;
    const minPipeHeight = 100;
    const maxPipeHeight = dimensions.height - config.pipeGap - 100 - GROUND_HEIGHT;
    const topHeight = Math.floor(Math.random() * (maxPipeHeight - minPipeHeight + 1) + minPipeHeight);
    const initialPipeX = Math.max(BIRD_X + 200, Math.min(dimensions.width * 0.75, 400));
    
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
    setGameState('GAME_OVER');
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('flappyHighScore', score.toString());
    }
  }, [score, highScore]);

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
    <div className="w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none flex justify-center items-center p-4">
      <div 
        className="w-full max-w-[480px] h-full max-h-[720px] rounded-[2rem] overflow-hidden relative bg-gradient-to-b from-sky-400 via-sky-300 to-sky-100 shadow-2xl border border-white/10"
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
          className="absolute z-20 flex items-center justify-center transition-transform duration-[50ms] drop-shadow-2xl"
          style={{
            left: BIRD_X,
            top: birdPos,
            width: BIRD_SIZE,
            height: BIRD_SIZE,
            transform: `rotate(${Math.min(Math.max(birdVelocity * 3, -25), 90)}deg)`,
          }}
        >
          {/* Custom Bird Image */}
          <img 
            src="/bird.png" 
            alt="Bird" 
            className="w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)]"
            onError={(e) => {
              // Fallback styling if image is missing
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement?.classList.add('bg-yellow-400', 'rounded-full', 'border-4', 'border-white');
            }}
          />
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
              <span className="text-2xl">{highScore}</span>
            </div>
          </div>

          {/* Overlays */}
          {gameState !== 'PLAYING' && (
            <div 
              className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/50 backdrop-blur-sm z-40"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="bg-slate-900/90 backdrop-blur-xl p-8 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-center transform transition-all border border-white/10 max-w-md w-full mx-4 text-white">
                
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
                        <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Personal Best</p>
                        <p className="text-2xl font-black text-white">{highScore}</p>
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
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Best</p>
                      <p className="text-3xl font-black text-amber-400">{highScore}</p>
                    </div>
                  </div>
                )}

                {/* Difficulty Selector */}
                <div className="mb-8 pointer-events-auto">
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

                <button 
                  onClick={(e) => { e.stopPropagation(); startGame(); }}
                  className="w-full py-4 rounded-xl font-black text-md text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 active:scale-95 transition-all duration-300 pointer-events-auto cursor-pointer flex items-center justify-center gap-2"
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

                <p className="text-[10px] text-slate-500 font-bold mt-4">
                  {gameState === 'START' ? 'Press Space or click screen to jump once started' : 'Select difficulty and press Restart to play again'}
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

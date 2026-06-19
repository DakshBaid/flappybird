import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, RotateCcw, Trophy } from 'lucide-react';

// Slower gameplay constants
const GRAVITY = 0.35;
const JUMP_STRENGTH = -7;
const PIPE_SPEED = 2.5;
const PIPE_WIDTH = 90;
const PIPE_GAP = 240; // Wider gap for slower/easier play
const BIRD_SIZE = 50; // Increased size to fit the logo image nicely
const BIRD_X = 150; // Bird's fixed horizontal position

type GameState = 'START' | 'PLAYING' | 'GAME_OVER';

interface PipeData {
  x: number;
  topHeight: number;
  passed: boolean;
}

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
  const [highScore, setHighScore] = useState(0);

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
    setPipes([]);
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
  const stateRef = useRef({ birdPos, birdVelocity, pipes, gameState, dimensions });
  useEffect(() => {
    stateRef.current = { birdPos, birdVelocity, pipes, gameState, dimensions };
  }, [birdPos, birdVelocity, pipes, gameState, dimensions]);

  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const gameLoop = () => {
      const currentState = stateRef.current;
      const { width, height } = currentState.dimensions;
      
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
        newVelocity = 0;
      }

      setBirdPos(newBirdPos);
      setBirdVelocity(newVelocity);

      // Update Pipes
      setPipes((currentPipes) => {
        let newPipes = currentPipes
          .map((pipe) => ({ ...pipe, x: pipe.x - PIPE_SPEED }))
          .filter((pipe) => pipe.x > -PIPE_WIDTH * 2);

        // Spawn new pipe based on screen width
        // Spawn when the last pipe is far enough away
        const spawnDistance = Math.min(450, width / 2); 
        
        if (newPipes.length === 0 || newPipes[newPipes.length - 1].x < width - spawnDistance) {
          const minPipeHeight = 100;
          const maxPipeHeight = height - PIPE_GAP - 100 - GROUND_HEIGHT;
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
        top: pipe.topHeight + PIPE_GAP,
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
  }, [birdPos, pipes, gameState, gameOver, dimensions.height]);

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
        {/* Dynamic Background Clouds */}
        <div className="absolute top-[10%] left-[15%] w-32 h-12 bg-white/70 rounded-full blur-[2px]"></div>
        <div className="absolute top-[5%] right-[20%] w-48 h-16 bg-white/60 rounded-full blur-[3px]"></div>
        <div className="absolute bottom-[30%] left-[25%] w-40 h-14 bg-white/50 rounded-full blur-[2px]"></div>
        <div className="absolute top-[40%] right-[10%] w-24 h-8 bg-white/40 rounded-full blur-[2px]"></div>
        <div className="absolute top-[20%] right-[45%] w-36 h-12 bg-white/40 rounded-full blur-[2px]"></div>

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
                height: dimensions.height - pipe.topHeight - PIPE_GAP - 40, // 40 is ground height
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
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-sm z-40">
              <div className="bg-white/95 backdrop-blur-xl p-12 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-center transform transition-all border-4 border-white/50 max-w-lg w-full mx-6">
                
                <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 mb-4 drop-shadow-sm pb-2">
                  Flappy Dev
                </h1>
                
                <p className="text-slate-600 font-bold text-lg mb-10">
                  {gameState === 'GAME_OVER' ? 'Oh no! You crashed.' : 'Press Space or Click to Fly'}
                </p>
                
                {gameState === 'GAME_OVER' && (
                  <div className="bg-slate-100/80 rounded-3xl p-6 mb-10 border-2 border-slate-200 shadow-inner">
                     <p className="text-sm text-slate-500 uppercase tracking-widest font-black mb-2">Final Score</p>
                     <p className="text-7xl font-black text-slate-800 drop-shadow-sm">{score}</p>
                  </div>
                )}

                <button 
                  onClick={(e) => { e.stopPropagation(); startGame(); }}
                  className="group relative inline-flex items-center justify-center px-10 py-5 font-black text-white text-xl transition-all duration-300 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-blue-500 hover:scale-[1.02] hover:shadow-[0_15px_30px_rgba(59,130,246,0.5)] active:scale-95 w-full pointer-events-auto"
                >
                  {gameState === 'GAME_OVER' ? (
                    <><RotateCcw size={28} className="mr-3 group-hover:-rotate-180 transition-transform duration-700" /> Play Again</>
                  ) : (
                    <><Play size={28} className="mr-3" /> Start Game</>
                  )}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

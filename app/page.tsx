"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import styles from "./page.module.css";

type Enemy = { x: number; y: number; vx: number; vy: number; r: number };
type Pickup = { x: number; y: number; r: number; kind: "shield" | "boost" };

const ARENA_SIZE = 480;

export default function Home() {
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const hudTickRef = useRef(0);
  const runningRef = useRef(false);
  const enemiesRef = useRef<Enemy[]>([]);
  const pickupsRef = useRef<Pickup[]>([]);
  const shieldRef = useRef(0);
  const scoreRef = useRef(0);
  const timeRef = useRef(0);
  const spawnEnemyRef = useRef(0);
  const spawnPickupRef = useRef(0);
  const bestRef = useRef(0);
  const pointerRef = useRef({ x: ARENA_SIZE / 2, y: ARENA_SIZE / 2 });
  const keysRef = useRef({
    up: false,
    down: false,
    left: false,
    right: false,
  });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const musicTimerRef = useRef<number | null>(null);
  const musicStepRef = useRef(0);
  const musicStartedRef = useRef(false);
  const musicModeRef = useRef<"calm" | "action" | "none">("none");
  const flashRef = useRef(0);
  const pulseRef = useRef<{ x: number; y: number; r: number; life: number }[]>(
    []
  );
  const playerRef = useRef({
    x: ARENA_SIZE / 2,
    y: ARENA_SIZE / 2,
    r: 12,
    vx: 0,
    vy: 0,
  });

  const [gameState, setGameState] = useState<"idle" | "running" | "over">(
    "idle"
  );
  const [hud, setHud] = useState({
    score: 0,
    time: 0,
    best: 0,
    danger: 1,
    status: "Warm-up",
  });

  useEffect(() => {
    if (!isMiniAppReady) {
      setMiniAppReady();
    }
  }, [setMiniAppReady, isMiniAppReady]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("survivorBest");
      if (stored) {
        const value = Number(stored);
        if (!Number.isNaN(value)) {
          bestRef.current = value;
          setHud((prev) => ({ ...prev, best: value }));
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const playTone = (
    frequency: number,
    duration = 0.08,
    volume = 0.06,
    type: OscillatorType = "triangle"
  ) => {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  };

  const playHit = () => playTone(140, 0.09, 0.08);

  const playNoise = (
    duration = 0.12,
    volume = 0.05,
    filterType: BiquadFilterType = "highpass",
    filterFreq = 2200
  ) => {
    const ctx = getAudioContext();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    source.stop(ctx.currentTime + duration);
  };

  const playShield = () => {
    playNoise(0.18, 0.05, "lowpass", 1400);
    playTone(240, 0.18, 0.03, "sine");
  };

  const playBoost = () => {
    playNoise(0.12, 0.03, "bandpass", 2600);
    playTone(640, 0.12, 0.025, "sine");
  };

  const playGameOver = () => playTone(90, 0.14, 0.08);

  const playMusicNote = (
    frequency: number,
    duration = 0.18,
    volume = 0.04
  ) => {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  };

  const stopBackgroundMusic = () => {
    if (musicTimerRef.current) {
      clearInterval(musicTimerRef.current);
      musicTimerRef.current = null;
    }
    musicModeRef.current = "none";
  };

  const startCalmMusic = () => {
    if (musicModeRef.current === "calm") return;
    stopBackgroundMusic();
    musicModeRef.current = "calm";
    const bpm = 78;
    const stepMs = 60000 / bpm;
    const melody = [220, 246.9, 196, 246.9, 220, 196, 174.6, 196];
    musicStepRef.current = 0;
    const tick = () => {
      const step = musicStepRef.current;
      playMusicNote(melody[step % melody.length], 0.28, 0.03);
      musicStepRef.current += 1;
    };
    tick();
    musicTimerRef.current = window.setInterval(tick, stepMs);
  };

  const startActionMusic = () => {
    if (musicModeRef.current === "action") return;
    stopBackgroundMusic();
    musicModeRef.current = "action";
    const bpm = 120;
    const stepMs = (60000 / bpm) / 2;
    const melody = [261.6, 293.7, 329.6, 392.0, 349.2, 293.7];
    musicStepRef.current = 0;
    const tick = () => {
      const step = musicStepRef.current;
      playMusicNote(melody[step % melody.length], 0.16, 0.04);
      if (step % 4 === 0) playMusicNote(130.8, 0.1, 0.03);
      musicStepRef.current += 1;
    };
    tick();
    musicTimerRef.current = window.setInterval(tick, stepMs);
  };

  const difficulty = useMemo(
    () => ({
      minSpawn: 350,
      startSpawn: 1200,
      enemySpeed: 110,
    }),
    []
  );

  const resetGame = () => {
    enemiesRef.current = [];
    pickupsRef.current = [];
    shieldRef.current = 0;
    scoreRef.current = 0;
    timeRef.current = 0;
    spawnEnemyRef.current = 0;
    spawnPickupRef.current = 0;
    playerRef.current.x = ARENA_SIZE / 2;
    playerRef.current.y = ARENA_SIZE / 2;
    playerRef.current.vx = 0;
    playerRef.current.vy = 0;
    pointerRef.current = { x: ARENA_SIZE / 2, y: ARENA_SIZE / 2 };
    flashRef.current = 0;
    pulseRef.current = [];
    setHud((prev) => ({
      ...prev,
      score: 0,
      time: 0,
      danger: 1,
      status: "Warm-up",
    }));
    setGameState("idle");
  };

  useEffect(() => {
    resetGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spawnEnemy = (speed: number) => {
    const edge = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;
    if (edge === 0) {
      x = Math.random() * ARENA_SIZE;
      y = -20;
    } else if (edge === 1) {
      x = ARENA_SIZE + 20;
      y = Math.random() * ARENA_SIZE;
    } else if (edge === 2) {
      x = Math.random() * ARENA_SIZE;
      y = ARENA_SIZE + 20;
    } else {
      x = -20;
      y = Math.random() * ARENA_SIZE;
    }
    const dx = playerRef.current.x - x;
    const dy = playerRef.current.y - y;
    const len = Math.hypot(dx, dy) || 1;
    enemiesRef.current.push({
      x,
      y,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      r: 10 + Math.random() * 6,
    });
  };

  const spawnPickup = () => {
    const margin = 40;
    pickupsRef.current.push({
      x: margin + Math.random() * (ARENA_SIZE - margin * 2),
      y: margin + Math.random() * (ARENA_SIZE - margin * 2),
      r: 8,
      kind: Math.random() > 0.5 ? "shield" : "boost",
    });
  };

  const updateLoop = (timestamp: number) => {
    if (!runningRef.current) return;
    if (!lastRef.current) lastRef.current = timestamp;
    const dt = Math.min(0.05, (timestamp - lastRef.current) / 1000);
    lastRef.current = timestamp;
    timeRef.current += dt;
    scoreRef.current += dt * (shieldRef.current > 0 ? 14 : 10);

    const danger = Math.min(6, 1 + timeRef.current / 12);
    const spawnInterval = Math.max(
      difficulty.minSpawn,
      difficulty.startSpawn - timeRef.current * 45
    );
    spawnEnemyRef.current += dt * 1000;
    spawnPickupRef.current += dt * 1000;

    if (spawnEnemyRef.current >= spawnInterval) {
      spawnEnemyRef.current = 0;
      spawnEnemy(difficulty.enemySpeed + danger * 20);
    }
    if (spawnPickupRef.current >= 4200) {
      spawnPickupRef.current = 0;
      spawnPickup();
    }

    const player = playerRef.current;
    const keys = keysRef.current;
    const speed = 220 + danger * 14;
    if (keys.up || keys.down || keys.left || keys.right) {
      const ax = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const ay = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      const len = Math.hypot(ax, ay) || 1;
      player.x += (ax / len) * speed * dt;
      player.y += (ay / len) * speed * dt;
      pointerRef.current = { x: player.x, y: player.y };
    } else {
      const pointer = pointerRef.current;
      const dx = pointer.x - player.x;
      const dy = pointer.y - player.y;
      player.vx = dx * 4;
      player.vy = dy * 4;
      player.x += player.vx * dt;
      player.y += player.vy * dt;
    }
    player.x = Math.max(16, Math.min(ARENA_SIZE - 16, player.x));
    player.y = Math.max(16, Math.min(ARENA_SIZE - 16, player.y));

    enemiesRef.current.forEach((enemy) => {
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
    });

    pickupsRef.current = pickupsRef.current.filter((pickup) => {
      const dist = Math.hypot(player.x - pickup.x, player.y - pickup.y);
      if (dist < player.r + pickup.r + 4) {
        if (pickup.kind === "shield") {
          shieldRef.current = Math.min(6, shieldRef.current + 3.5);
          playShield();
          pulseRef.current.push({
            x: pickup.x,
            y: pickup.y,
            r: 14,
            life: 0.35,
          });
        } else {
          scoreRef.current += 120;
          playBoost();
          pulseRef.current.push({
            x: pickup.x,
            y: pickup.y,
            r: 12,
            life: 0.25,
          });
        }
        return false;
      }
      return true;
    });

    if (shieldRef.current > 0) {
      shieldRef.current = Math.max(0, shieldRef.current - dt);
    }

    flashRef.current = Math.max(0, flashRef.current - dt);
    pulseRef.current = pulseRef.current
      .map((pulse) => ({
        ...pulse,
        r: pulse.r + 120 * dt,
        life: pulse.life - dt,
      }))
      .filter((pulse) => pulse.life > 0);

    for (const enemy of enemiesRef.current) {
      const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      if (dist < player.r + enemy.r) {
        if (shieldRef.current > 0) {
          shieldRef.current = Math.max(0, shieldRef.current - 1.5);
          enemy.x = -200;
          playHit();
          flashRef.current = 0.15;
        } else {
          runningRef.current = false;
          setGameState("over");
          playGameOver();
          flashRef.current = 0.4;
          startCalmMusic();
          const finalScore = Math.floor(scoreRef.current);
          if (finalScore > bestRef.current) {
            bestRef.current = finalScore;
            try {
              localStorage.setItem("survivorBest", String(finalScore));
            } catch {
              // ignore
            }
          }
        }
      }
    }

    enemiesRef.current = enemiesRef.current.filter(
      (enemy) =>
        enemy.x > -40 &&
        enemy.x < ARENA_SIZE + 40 &&
        enemy.y > -40 &&
        enemy.y < ARENA_SIZE + 40
    );

    if (timestamp - hudTickRef.current > 180) {
      hudTickRef.current = timestamp;
      setHud({
        score: Math.floor(scoreRef.current),
        time: Math.floor(timeRef.current),
        best: bestRef.current,
        danger,
        status: shieldRef.current > 0 ? "Shielded" : "Survive",
      });
    }

    drawFrame();
    rafRef.current = requestAnimationFrame(updateLoop);
  };

  const drawFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const size = ARENA_SIZE;
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(12, 14, 24, 0.95)";
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = "rgba(94, 247, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, size - 16, size - 16);

    pickupsRef.current.forEach((pickup) => {
      ctx.beginPath();
      ctx.fillStyle =
        pickup.kind === "shield" ? "#7dffcb" : "rgba(255, 199, 87, 0.9)";
      ctx.arc(pickup.x, pickup.y, pickup.r + 2, 0, Math.PI * 2);
      ctx.fill();
    });

    enemiesRef.current.forEach((enemy) => {
      ctx.beginPath();
      ctx.fillStyle = "rgba(255, 90, 122, 0.9)";
      ctx.arc(enemy.x, enemy.y, enemy.r, 0, Math.PI * 2);
      ctx.fill();
    });

    pulseRef.current.forEach((pulse) => {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(125, 255, 203, ${pulse.life})`;
      ctx.lineWidth = 3;
      ctx.arc(pulse.x, pulse.y, pulse.r, 0, Math.PI * 2);
      ctx.stroke();
    });

    if (shieldRef.current > 0) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(125, 255, 203, 0.6)";
      ctx.lineWidth = 4;
      ctx.arc(playerRef.current.x, playerRef.current.y, 20, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.fillStyle = "rgba(94, 247, 255, 0.95)";
    ctx.arc(playerRef.current.x, playerRef.current.y, playerRef.current.r, 0, Math.PI * 2);
    ctx.fill();

    if (flashRef.current > 0) {
      ctx.fillStyle = `rgba(255, 90, 122, ${flashRef.current})`;
      ctx.fillRect(0, 0, size, size);
    }
  };

  const startGame = () => {
    if (gameState === "running") return;
    resetGame();
    setGameState("running");
    runningRef.current = true;
    lastRef.current = 0;
    hudTickRef.current = 0;
    startActionMusic();
    musicStartedRef.current = true;
    rafRef.current = requestAnimationFrame(updateLoop);
  };

  const stopGame = () => {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  useEffect(() => {
    return () => {
      stopGame();
      stopBackgroundMusic();
    };
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent, pressed: boolean) => {
      const key = event.key.toLowerCase();
      if (key === "w" || key === "arrowup") keysRef.current.up = pressed;
      if (key === "s" || key === "arrowdown") keysRef.current.down = pressed;
      if (key === "a" || key === "arrowleft") keysRef.current.left = pressed;
      if (key === "d" || key === "arrowright") keysRef.current.right = pressed;
    };
    const onKeyDown = (event: KeyboardEvent) => handleKey(event, true);
    const onKeyUp = (event: KeyboardEvent) => handleKey(event, false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const handlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!musicStartedRef.current) {
      startCalmMusic();
      musicStartedRef.current = true;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * ARENA_SIZE;
    const y = ((event.clientY - rect.top) / rect.height) * ARENA_SIZE;
    pointerRef.current = { x, y };
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Survivor Arena</p>
          <h1 className={styles.title}>Void Drift</h1>
          <p className={styles.subtitle}>
            Stay alive, collect orbs, and outrun the swarm. The longer you
            survive, the faster they come.
          </p>
        </div>
        <Wallet />
      </header>

      <section className={styles.layout}>
        <div
          className={styles.arena}
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
        >
          <canvas ref={canvasRef} className={styles.canvas} />
          <div className={styles.hint}>
            Drag to move - WASD/arrow keys also work
          </div>
        </div>

        <aside className={styles.panel}>
          <div className={styles.statCard}>
            <div>
              <p className={styles.statLabel}>Score</p>
              <p className={styles.statValue}>{hud.score}</p>
            </div>
            <div className={styles.statRow}>
              <span>Time</span>
              <span>{hud.time}s</span>
            </div>
            <div className={styles.statRow}>
              <span>Danger</span>
              <span>{hud.danger.toFixed(1)}x</span>
            </div>
            <div className={styles.statRow}>
              <span>Best</span>
              <span>{hud.best}</span>
            </div>
          </div>

          <div className={styles.statusCard}>
            <p className={styles.statusTitle}>{hud.status}</p>
            <p>
              Red cores end the run. Green orbs add shields. Gold orbs add bonus
              score.
            </p>
          </div>

          <div className={styles.actions}>
            <button className={styles.primary} onClick={startGame}>
              {gameState === "running" ? "Running..." : "Start Run"}
            </button>
            <button
              className={styles.secondary}
              onClick={() => {
                stopGame();
                resetGame();
                if (musicStartedRef.current) {
                  startCalmMusic();
                }
              }}
            >
              Reset
            </button>
          </div>
        </aside>
      </section>
    </div>
  );
}

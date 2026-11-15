/**
 * A light canvas starfield for the command-deck backdrop. Static under
 * reduced-motion preferences.
 */
export function initStarfield(canvas) {
  if (!canvas) return () => {};
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let stars = [];
  let raf = 0;
  let last = 0;
  let shooting = null;
  let active = true;
  let random = mulberry32(0x51f15e);

  function mulberry32(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeStars() {
    const count = Math.min(240, Math.max(70, Math.round((width * height) / 11000)));
    stars = Array.from({ length: count }, (_, index) => ({
      x: random() * width,
      y: random() * height,
      r: random() * 1.25 + 0.25,
      a: random() * 0.45 + 0.12,
      speed: random() * 0.012 + 0.002,
      phase: random() * Math.PI * 2,
      tint: index % 17 === 0 ? 'amber' : index % 7 === 0 ? 'cyan' : 'white',
    }));
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    random = mulberry32(0x51f15e);
    makeStars();
    if (reduceMotion) draw(0);
  }

  function draw(t) {
    ctx.clearRect(0, 0, width, height);
    for (const star of stars) {
      const twinkle = 0.72 + Math.sin(t * 0.0008 + star.phase) * 0.28;
      const color = star.tint === 'amber'
        ? `rgba(255, 188, 92, ${star.a * twinkle})`
        : star.tint === 'cyan'
          ? `rgba(112, 228, 255, ${star.a * twinkle})`
          : `rgba(220, 238, 245, ${star.a * twinkle})`;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (shooting) {
      const progress = (t - shooting.start) / shooting.life;
      if (progress >= 1) {
        shooting = null;
      } else {
        const x = shooting.x + shooting.dx * progress;
        const y = shooting.y + shooting.dy * progress;
        const gradient = ctx.createLinearGradient(x, y, x - shooting.dx * 0.16, y - shooting.dy * 0.16);
        gradient.addColorStop(0, 'rgba(160, 240, 255, 0.85)');
        gradient.addColorStop(1, 'rgba(160, 240, 255, 0)');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - shooting.dx * 0.16, y - shooting.dy * 0.16);
        ctx.stroke();
      }
    }
  }

  function frame(t) {
    if (!active) return;
    if (t - last > 32) {
      for (const star of stars) {
        star.y += star.speed;
        if (star.y > height + 2) {
          star.y = -2;
          star.x = random() * width;
        }
      }
      if (!shooting && random() < 0.0018) {
        shooting = {
          x: width * (0.15 + random() * 0.7),
          y: height * (0.08 + random() * 0.3),
          dx: -(120 + random() * 160),
          dy: 70 + random() * 95,
          start: t,
          life: 900 + random() * 500,
        };
      }
      draw(t);
      last = t;
    }
    raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });
  if (!reduceMotion) raf = requestAnimationFrame(frame);

  return () => {
    active = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Leaf } from "lucide-react";
import { getPublicImpactMetrics } from "@/services/metrics";
import type { ImpactMetrics } from "@/types/metrics";
import { useAuth } from "@/lib/auth-context";
import CountUp from "@/components/motion/CountUp";
import { usePrefersReducedMotion } from "@/components/motion/useInView";
import "./home/table.css";

// Close-ups cropped from the shared-table photo (public/background_image.jpeg, 1312×814),
// so every image on the page comes from the same candlelit table.
const PHOTO_W = 1312;
const PHOTO_H = 814;
const crop = (x: number, y: number, w: number, h: number) => ({
  "--z": `${(PHOTO_W / w) * 100}% auto`,
  "--p": `${(x / (PHOTO_W - w)) * 100}% ${(y / (PHOTO_H - h)) * 100}%`,
}) as CSSProperties;

// Burger on white (Hermes Rivera, Unsplash License), hotlinked as Unsplash asks.
const burgerSrc = (w: number) => `https://images.unsplash.com/photo-1543339469-94ba2391431f?w=${w}&h=${w}&fit=crop&crop=focalpoint&fp-x=0.5&fp-y=0.55&fp-z=2.05&auto=format&q=80`;
const BURGER = burgerSrc(1000);
const BURGER_SM = burgerSrc(600);

// Demo listings at restaurants near Vanderbilt (from supabase/seed-data.json).
const ON_THE_BOARD: [string, string, CSSProperties][] = [
  ["Chicken burrito bowls", "Chipotle", crop(220, 400, 130, 130)],
  ["Day-old bread", "Panera", crop(975, 330, 120, 120)],
  ["Vegetable dumplings", "Dumpling House", crop(600, 320, 110, 110)],
  ["Penne marinara", "Amerigo", crop(1150, 360, 130, 130)],
  ["Fresh pomegranates", "Germantown Market", crop(860, 405, 90, 90)],
  ["Cheese pizzas", "Two Boots", crop(1080, 90, 120, 120)],
  ["Vegetable biryani", "Nawabi House", crop(40, 340, 120, 120)],
  ["Hummus & pita", "Taziki's", crop(500, 560, 110, 110)],
];

const STEPS = [
  { title: "Post what's left", text: "Snap a photo of the extra food and set a pick-up-by time, usually when you close.", img: crop(165, 300, 260, 325) },
  { title: "Someone nearby asks", text: "Neighbors find it on the map, sorted by distance and by how soon it needs picking up.", img: crop(830, 290, 220, 275) },
  { title: "Shared, not thrown out", text: "They collect it before the deadline and confirm pickup. You see it marked done.", img: crop(540, 230, 260, 325) },
];

// Floating candle-light bokeh: size, x, duration, delay, sway.
const BOKEH = [
  [70, 8, 19, 0, 40], [34, 18, 15, 4, -30], [110, 27, 24, 2, 60], [26, 38, 13, 7, 20],
  [58, 49, 21, 1, -50], [90, 61, 26, 6, 30], [30, 70, 16, 3, -20], [66, 80, 22, 8, 50],
  [44, 90, 18, 5, -40], [120, 95, 28, 10, -60], [22, 55, 12, 11, 15], [50, 4, 20, 12, 25],
];

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// Pull a button slightly toward the pointer.
const magnetic = {
  onPointerMove: (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--tx", `${(e.clientX - r.left - r.width / 2) * 0.16}px`);
    e.currentTarget.style.setProperty("--ty", `${(e.clientY - r.top - r.height / 2) * 0.28}px`);
  },
  onPointerLeave: (e: PointerEvent<HTMLElement>) => {
    e.currentTarget.style.setProperty("--tx", "0px");
    e.currentTarget.style.setProperty("--ty", "0px");
  },
};

const Index = () => {
  const { user, profile } = useAuth();
  const reducedMotion = usePrefersReducedMotion();
  const [metrics, setMetrics] = useState<ImpactMetrics | null>(null);
  const [lit, setLit] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<HTMLDivElement>(null);
  const darkRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);
  const boardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const closeRef = useRef<HTMLElement>(null);
  // Where the candle should be (target) and where it is (eased), in % of the hero.
  const light = useRef({ tx: 50, ty: 58, x: 50, y: 58, moved: false });

  useEffect(() => {
    let mounted = true;
    getPublicImpactMetrics().then((data) => mounted && setMetrics(data)).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Light the table once the photo is decoded, so the reveal never shows a blank frame.
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.src = "/background_image.jpeg";
    const go = () => !cancelled && setLit(true);
    Promise.race([img.decode(), new Promise((r) => setTimeout(r, 1500))]).then(go, go);
    return () => { cancelled = true; };
  }, []);

  // Soft reveal for blocks below the hero.
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll(".tb-reveal");
    if (!els) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("is-in")),
      { root: rootRef.current, threshold: 0.2 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // One loop for everything that follows scroll or the pointer. It writes transforms straight
  // onto the few elements that move (no page-wide CSS variables, so no full style recalc),
  // reads all geometry before writing, and skips work that is off screen or unchanged.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || reducedMotion) return;
    let frame = 0;
    let lastTop = -1;
    let velocity = 0;
    let direction = 1;
    const offsets = [0, 0];
    const started = performance.now();
    const last: Record<string, string> = {};
    const put = (el: HTMLElement | null, key: string, prop: "transform" | "opacity" | "borderRadius", value: string) => {
      if (!el || last[key] === value) return;
      last[key] = value;
      el.style[prop] = value;
    };

    // Geometry that only changes on resize.
    const size = { vh: 0, sw: 0, sh: 0, heroSpan: 1, rowHalf: [0, 0] };
    const measure = () => {
      size.vh = root.clientHeight;
      const stage = frameRef.current;
      size.sw = stage?.offsetWidth ?? 0;
      size.sh = stage?.offsetHeight ?? 0;
      size.heroSpan = Math.max((heroRef.current?.offsetHeight ?? 0) - size.vh, 1);
      boardRefs.current.forEach((row, i) => { size.rowHalf[i] = row ? row.scrollWidth / 2 : 0; });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    boardRefs.current.forEach((row) => row && ro.observe(row));

    // Only animate the sections that are on screen.
    const visible = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target))),
      { root },
    );
    const steps = Array.from(root.querySelectorAll<HTMLElement>(".tb-step__par"));
    [...steps, closeRef.current, ...boardRefs.current].forEach((el) => el && io.observe(el));

    const tick = (now: number) => {
      // ---- reads ----
      const top = root.scrollTop;
      const { vh } = size;
      const stepRects = steps.map((el) => (visible.has(el) ? el.getBoundingClientRect() : null));
      const close = closeRef.current;
      const closeRect = close && visible.has(close) ? close.getBoundingClientRect() : null;

      // ---- state ----
      const delta = lastTop < 0 ? 0 : top - lastTop;
      lastTop = top;
      velocity = velocity * 0.9 + Math.abs(delta) * 0.1;
      if (delta !== 0) direction = delta > 0 ? 1 : -1;
      const h = clamp(top / size.heroSpan);

      const l = light.current;
      if (!l.moved) {
        const t = (now - started) / 1000;
        l.tx = 50 + Math.sin(t * 0.35) * 22;
        l.ty = 56 + Math.sin(t * 0.5) * 10;
      }
      l.x += (l.tx - l.x) * 0.08;
      l.y += (l.ty - l.y) * 0.08;
      const px = (l.x - 50) / 50;
      const py = (l.y - 50) / 50;

      // ---- writes ----
      if (h < 1 || last.frame !== "done") {
        put(frameRef.current, "frame", "transform", `translate3d(0,0,0) scale(${(1 - h * 0.1).toFixed(4)})`);
        put(frameRef.current, "radius", "borderRadius", `${(h * 36).toFixed(1)}px`);
        put(topRef.current, "top", "transform", `translate3d(0,${(-h * 60).toFixed(1)}px,0)`);
        put(topRef.current, "topO", "opacity", clamp(1 - h * 2.2).toFixed(3));
        put(copyRef.current, "copy", "transform", `translate3d(-50%,${(-h * 90).toFixed(1)}px,0)`);
        put(copyRef.current, "copyO", "opacity", clamp(1 - h * 1.7).toFixed(3));
      }
      if (h < 1) {
        put(darkRef.current, "dark", "transform", `translate3d(${((l.x / 100) * size.sw).toFixed(1)}px,${((l.y / 100) * size.sh).toFixed(1)}px,0) scale(4)`);
        put(panRef.current, "pan", "transform", `translate3d(${(-px * 16).toFixed(2)}px,${(-py * 10 + h * 50).toFixed(2)}px,0)`);
      }

      boardRefs.current.forEach((row, i) => {
        if (!row || !visible.has(row) || !size.rowHalf[i]) return;
        const half = size.rowHalf[i];
        const speed = (0.45 + velocity * 0.3) * direction * (i === 0 ? 1 : -1);
        offsets[i] = (((offsets[i] + speed) % half) + half) % half;
        row.style.transform = `translate3d(${(-offsets[i]).toFixed(2)}px,0,0)`;
      });

      stepRects.forEach((r, i) => {
        if (r) put(steps[i], `step${i}`, "transform", `translate3d(0,${(-((r.top + r.height / 2 - vh / 2) / vh) * 28).toFixed(1)}px,0)`);
      });

      // Closing burger turns as the section scrolls through the screen.
      if (closeRect) {
        const k = clamp(1 - (closeRect.top + closeRect.height / 2) / (vh + closeRect.height / 2));
        put(spinRef.current, "spin", "transform", `translate3d(0,${(40 - k * 60).toFixed(1)}px,0) rotate(${(-38 + k * 76).toFixed(2)}deg)`);
      }

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); ro.disconnect(); io.disconnect(); };
  }, [reducedMotion]);

  const onHeroPointer = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const l = light.current;
    l.moved = true;
    l.tx = ((e.clientX - r.left) / r.width) * 100;
    l.ty = ((e.clientY - r.top) / r.height) * 100;
  };

  const dashboard = profile?.role === "donor" ? "/donor" : "/receiver";
  // Both actions always show; signed-in people go straight to that dashboard, visitors to sign-up.
  const actions = [
    { to: user ? "/donor" : "/signup?role=donor", label: "Donate food" },
    { to: user ? "/receiver" : "/signup?role=receiver", label: "Find food" },
  ];
  const renderActions = (primary: string, secondary: string) =>
    actions.map((a, i) => (
      <Link key={a.to} to={a.to} className={`tb-btn ${i === 0 ? primary : secondary}`} {...magnetic}>{a.label} <ArrowRight aria-hidden="true" /></Link>
    ));
  const words = ["Turning", "abundance", "into"];
  const boardItems = [...ON_THE_BOARD, ...ON_THE_BOARD];

  return (
    <div ref={rootRef} className={`tb ${lit ? "tb-lit" : ""}`}>
      <section ref={heroRef} className="tb-hero" aria-label="Overflow">
        <div className="tb-stage" onPointerMove={onHeroPointer}>
          <div ref={frameRef} className="tb-frame">
            <div className="tb-scene">
              <div ref={panRef} className="tb-pan">
                <div className="tb-drift">
                  <div className="tb-zoom">
                    <img className="tb-photo" src="/background_image.jpeg" alt="Friends passing dishes around a long shared table" draggable={false} decoding="async" />
                    <img className="tb-photo tb-photo--blur" src="/background_image.jpeg" alt="" aria-hidden="true" draggable={false} />
                  </div>
                </div>
              </div>
              <div ref={darkRef} className="tb-dark" aria-hidden="true" />
              <div className="tb-bokeh" aria-hidden="true">
                {BOKEH.map(([s, x, t, d, sway], i) => (
                  <span key={i} style={{ "--s": `${s}px`, "--x": `${x}%`, "--t": `${t}s`, "--d": `${d}s`, "--sway": `${sway}px` } as CSSProperties} />
                ))}
              </div>
              <div className="tb-shade" aria-hidden="true" />
            </div>
            <div className="tb-ember" aria-hidden="true" />
          </div>

          <div ref={topRef} className="tb-topwrap">
          <header className="tb-top">
            <Link to="/" className="tb-logo"><Leaf aria-hidden="true" />Overflow</Link>
            <nav className="tb-nav" aria-label="Account">
              {user ? (
                <Link to={dashboard} className="tb-nav__cta">Dashboard</Link>
              ) : (
                <>
                  <Link to="/login">Log in</Link>
                  <Link to="/signup" className="tb-nav__cta">Sign up</Link>
                </>
              )}
            </nav>
          </header>
          </div>

          <div ref={copyRef} className="tb-copy">
            <span className="tb-eyebrow tb-in" style={{ "--d": "0.95s" } as CSSProperties}>
              <span className="tb-flame" aria-hidden="true" />Surplus food, shared nearby in Nashville
            </span>
            <h1 className="tb-h1">
              {words.map((w, i) => (
                <span key={w}><span className="tb-word" style={{ "--i": i } as CSSProperties}>{w}</span>{" "}</span>
              ))}
              <em className="tb-word" style={{ "--i": 3 } as CSSProperties}>shared meals</em>
            </h1>
            <div className="tb-row">
              <div>
                <p className="tb-lede tb-in" style={{ "--d": "1.75s" } as CSSProperties}>
                  Restaurants, bakeries and neighbors post what's left. People nearby pick it up before it's thrown out.
                </p>
                <span className="tb-hint tb-in" style={{ "--d": "2.6s" } as CSSProperties}>
                  <span className="tb-flame" aria-hidden="true" />Move your cursor to light the table
                </span>
              </div>
              <div className="tb-actions tb-in" style={{ "--d": "1.95s" } as CSSProperties}>
                {renderActions("tb-btn--cream", "tb-btn--glass")}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="tb-board" aria-label="Food on the board near campus">
        {[0, 1].map((row) => (
          <div key={row} ref={(el) => { boardRefs.current[row] = el; }} className={`tb-board__row ${row === 1 ? "tb-board__row--b" : ""}`} aria-hidden={row === 1}>
            {(row === 0 ? boardItems : [...boardItems].reverse()).map(([food, place, img], i) => (
              <span key={i} className="tb-chip"><span className="tb-chip__dot" style={img} /><b>{food}</b><i>{place}</i></span>
            ))}
          </div>
        ))}
      </section>

      <section className="tb-section" aria-labelledby="how">
        <span className="tb-kicker tb-reveal">How it works</span>
        <h2 id="how" className="tb-h2 tb-reveal" style={{ "--d": "0.08s" } as CSSProperties}>From one table <em>to the next</em></h2>
        <div className="tb-steps">
          {STEPS.map((step, i) => (
            <article key={step.title} className="tb-step tb-reveal" style={{ "--d": `${0.12 * i}s` } as CSSProperties}>
              <div className="tb-step__photo">
                <div className="tb-step__par"><div className="tb-step__img" style={step.img} /></div>
                <span className="tb-step__badge" aria-hidden="true">{i + 1}</span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="tb-section" style={{ paddingTop: 0 }} aria-labelledby="so-far">
        <span className="tb-kicker tb-reveal">So far</span>
        <h2 id="so-far" className="tb-h2 tb-reveal" style={{ "--d": "0.08s" } as CSSProperties}>A growing table</h2>
        <div className="tb-stats">
          <div className="tb-stat tb-reveal"><span className="tb-stat__num"><CountUp value={metrics?.totalDonors ?? null} /></span><span className="tb-stat__label">donors posting food</span></div>
          <div className="tb-stat tb-reveal" style={{ "--d": "0.1s" } as CSSProperties}><span className="tb-stat__num"><CountUp value={metrics?.totalRecipients ?? null} /></span><span className="tb-stat__label">neighbors finding food</span></div>
          <div className="tb-stat tb-reveal" style={{ "--d": "0.2s" } as CSSProperties}><span className="tb-stat__num"><CountUp value={metrics?.totalMealsSaved ?? null} /></span><span className="tb-stat__label">meals picked up</span></div>
        </div>
      </section>

      <section ref={closeRef} className="tb-close" aria-labelledby="share">
        <div className="tb-close__copy tb-reveal">
          <span className="tb-kicker">Before it goes in the bin</span>
          <h2 id="share" className="tb-close__title">
            <span>Don't bin it.</span>
            <em>Share it!</em>
          </h2>
          <p>Free for donors and for the people picking up. Post what's left, and someone nearby gets a meal.</p>
          <div className="tb-actions">
            {renderActions("tb-btn--forest", "tb-btn--light")}
          </div>
        </div>
        <div className="tb-burger tb-reveal" style={{ "--d": "0.15s" } as CSSProperties}>
          <div className="tb-burger__shadow" aria-hidden="true" />
          <div ref={spinRef} className="tb-burger__spin">
            <div className="tb-burger__float">
              <img src={BURGER} srcSet={`${BURGER_SM} 600w, ${BURGER} 1000w`} sizes="(max-width: 820px) 80vw, 40vw" alt="A burger with tomato, avocado and greens" loading="lazy" draggable={false} />
            </div>
          </div>
        </div>
      </section>

      <footer className="tb-footer">
        <span>© {new Date().getFullYear()} Overflow · Turning abundance into shared meals</span>
        <span>Burger photo: Hermes Rivera on Unsplash · Made in Nashville</span>
      </footer>
    </div>
  );
};

export default Index;

const shell = document.querySelector("#game-shell");
const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const noop = () => {};
const stubStyle = {};
const stubClassList = { toggle: noop, add: noop, remove: noop };
const stubElement = { style: stubStyle, classList: stubClassList, textContent: "" };
const stubCanvas = {
  width: 160,
  height: 112,
  getContext() {
    return {
      clearRect: noop,
      fillRect: noop,
      beginPath: noop,
      arc: noop,
      fill: noop,
      moveTo: noop,
      lineTo: noop,
      stroke: noop,
    };
  },
};

const missionTitle = document.querySelector("#mission-title") ?? stubElement;
const missionObjective = document.querySelector("#mission-objective") ?? stubElement;
const vehicleStatus = document.querySelector("#vehicle-status") ?? stubElement;
const healthFill = document.querySelector("#health-fill") ?? stubElement;
const dashFill = document.querySelector("#damage-fill") ?? stubElement;
const troubleLabel = document.querySelector("#wanted-label") ?? stubElement;
const dashLabel = document.querySelector("#vehicle-meter-label") ?? stubElement;
const promptBox = document.querySelector("#prompt") ?? stubElement;
const statusPill = document.querySelector("#status-pill") ?? stubElement;
const statusCount = document.querySelector("#status-count") ?? stubElement;
const statusBeer = document.querySelector("#status-beer") ?? stubElement;
const statusPower = document.querySelector("#status-power") ?? stubElement;
const livesPill = document.querySelector("#lives-pill") ?? stubElement;
const livesCount = document.querySelector("#lives-count") ?? stubElement;
const miniMap = document.querySelector("#mini-map") ?? stubCanvas;
const miniCtx = miniMap.getContext("2d");
const targetArrow = document.querySelector("#target-arrow") ?? stubElement;
const arrowGlyph = document.querySelector("#arrow-glyph") ?? stubElement;
const targetDistance = document.querySelector("#target-distance") ?? stubElement;
const storyCard = document.querySelector("#story-card");
const storyKicker = document.querySelector("#story-kicker");
const storyTitle = document.querySelector("#story-title");
const storyCopy = document.querySelector("#story-copy");
const storyButton = document.querySelector("#story-button");
const touchButtons = Array.from(document.querySelectorAll("#touch-controls button"));

function isEmbeddedApp() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function updateInputMode() {
  const embedded = isEmbeddedApp();
  const touchLike =
    embedded ||
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(any-pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0;

  document.documentElement.classList.toggle("embedded-app", embedded);
  document.documentElement.classList.toggle("touch-ui", touchLike);
}

document.addEventListener(
  "selectstart",
  (event) => {
    if (event.target instanceof Element && event.target.closest("#game-shell")) {
      event.preventDefault();
    }
  },
  { passive: false },
);
document.addEventListener("dragstart", (event) => {
  if (event.target instanceof Element && event.target.closest("#game-shell")) {
    event.preventDefault();
  }
});
document.addEventListener("contextmenu", (event) => {
  if (event.target instanceof Element && event.target.closest("#game-shell")) {
    event.preventDefault();
  }
});
updateInputMode();
window.addEventListener("resize", updateInputMode);
window.addEventListener("orientationchange", updateInputMode);

const ACTIONS = {
  left: false,
  right: false,
  jump: false,
  use: false,
  restart: false,
};

const pressed = {
  jump: false,
  use: false,
  restart: false,
};

const VIEW = {
  width: 960,
  height: 540,
};

const PLAYER_SIZE = { w: 24, h: 34 };
const MAX_HEALTH = 100;
const MAX_JUMPS = 2;
const STARTING_LIVES = 5;
const MAX_LIVES = 9;
const MAX_SNAGS = 5;

const state = {
  mode: "title",
  levelIndex: 0,
  time: 0,
  deaths: 0,
  lives: STARTING_LIVES,
  snags: MAX_SNAGS,
  health: MAX_HEALTH,
  message: "",
  messageTimer: 0,
  introShown: false,
  completedLevels: 0,
  checkpointLabel: "Spawn",
};

const camera = { x: 0, y: 0 };

const player = makePlayer();
let level = null;
let lastFrame = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function approach(current, target, maxDelta) {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function syncHealthFromSnags() {
  state.health = Math.round((clamp(state.snags, 0, MAX_SNAGS) / MAX_SNAGS) * MAX_HEALTH);
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function makePlayer() {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    w: PLAYER_SIZE.w,
    h: PLAYER_SIZE.h,
    facing: 1,
    onGround: false,
    ground: null,
    coyote: 0,
    jumpBuffer: 0,
    jumpsUsed: 0,
    wallDir: 0,
    wallGrace: 0,
    beerTime: 0,
    invuln: 0,
    prevX: 0,
    prevY: 0,
    spawnX: 0,
    spawnY: 0,
  };
}

function solid(x, y, w, h, extra = {}) {
  return {
    x,
    y,
    w,
    h,
    kind: "solid",
    oneWay: false,
    ...extra,
  };
}

function ledge(x, y, w, h = 18, extra = {}) {
  return {
    x,
    y,
    w,
    h,
    kind: "ledge",
    oneWay: true,
    ...extra,
  };
}

function hazard(x, y, w, h, kind = "spikes", damage = 20, extra = {}) {
  return {
    x,
    y,
    w,
    h,
    kind: "hazard",
    hazardKind: kind,
    damage,
    active: true,
    ...extra,
  };
}

function collectible(kind, x, y, extra = {}) {
  return {
    kind,
    x,
    y,
    w: extra.w ?? (kind === "beer" ? 18 : kind === "life" ? 22 : 22),
    h: extra.h ?? (kind === "beer" ? 24 : kind === "life" ? 22 : 18),
    value: extra.value ?? (kind === "beer" ? 0 : 1),
    duration: extra.duration ?? (kind === "beer" ? 8 : 0),
    collected: false,
  };
}

function checkpoint(x, y, label = "Checkpoint", spawnX = x, spawnY = y) {
  return {
    x,
    y,
    w: 28,
    h: 44,
    kind: "checkpoint",
    label,
    spawnX,
    spawnY,
    reached: false,
  };
}

function finish(x, y, w, h, label, kind = "flag") {
  return {
    x,
    y,
    w,
    h,
    kind: "finish",
    finishKind: kind,
    label,
  };
}

function mover(x, y, w, h, motion) {
  return {
    x,
    y,
    startX: x,
    startY: y,
    prevX: x,
    prevY: y,
    vx: 0,
    vy: 0,
    w,
    h,
    kind: "mover",
    oneWay: motion.oneWay ?? true,
    style: motion.style ?? "crate",
    axis: motion.axis ?? "x",
    amplitude: motion.amplitude ?? 0,
    speed: motion.speed ?? 1,
    phase: motion.phase ?? 0,
    offset: motion.offset ?? 0,
  };
}

function enemy(type, x, y, bounds, extra = {}) {
  const defaults = {
    kangaroo: { w: 28, h: 24, speed: 92, hopPower: 800, color: "#d9a15f" },
    dingo: { w: 30, h: 22, speed: 110, hopPower: 0, color: "#b07d4f" },
    snake: { w: 34, h: 14, speed: 78, hopPower: 0, color: "#8bb35f" },
    goanna: { w: 36, h: 16, speed: 82, hopPower: 0, color: "#7f8e55" },
    emu: { w: 26, h: 40, speed: 118, hopPower: 0, color: "#76654c" },
    farmdog: { w: 30, h: 22, speed: 116, hopPower: 0, color: "#8e6a48" },
    policeDog: { w: 30, h: 22, speed: 122, hopPower: 0, color: "#4a5057" },
    trooper: { w: 24, h: 34, speed: 92, hopPower: 0, color: "#55729f" },
    cultist: { w: 24, h: 34, speed: 88, hopPower: 0, color: "#72513b" },
    cropguard: { w: 24, h: 34, speed: 94, hopPower: 0, color: "#5e452f" },
    magpie: { w: 28, h: 18, speed: 126, hopPower: 0, color: "#2e3139" },
  }[type] ?? {};
  return {
    type,
    x,
    y,
    prevX: x,
    prevY: y,
    vx: 0,
    vy: 0,
    w: extra.w ?? defaults.w ?? 26,
    h: extra.h ?? defaults.h ?? 24,
    dir: extra.dir ?? 1,
    alive: true,
    health: 1,
    jumpCooldown: extra.jumpCooldown ?? 0,
    patrolLeft: bounds.left,
    patrolRight: bounds.right,
    color: extra.color ?? defaults.color ?? "#d7a56d",
    speed: extra.speed ?? defaults.speed ?? 90,
    hopPower: extra.hopPower ?? defaults.hopPower ?? 760,
  };
}

function boss(type, x, y, arena, extra = {}) {
  const defaults = {
    cop: {
      w: 42,
      h: 52,
      speed: 138,
      hopPower: 920,
      health: 3,
      color: "#385b88",
      accent: "#9cc0f4",
      label: "Senior Constable Bluey",
      introLine: "Senior Constable Bluey has finally caught up.",
      defeatLine: "Bluey drops the act and the road opens up.",
      projectileKind: "ticket",
      projectileColor: "#ffe48a",
      projectileSpeed: 320,
      contactDamage: 22,
    },
    cultist: {
      w: 40,
      h: 54,
      speed: 126,
      hopPower: 860,
      health: 4,
      color: "#7e4d35",
      accent: "#f2a05d",
      label: "Crop Cult Shooter",
      introLine: "The crop cult shooter opens up from the grow patch.",
      defeatLine: "The cult gunman folds and the paddock finally shuts up.",
      projectileKind: "shot",
      projectileColor: "#ffd46f",
      projectileSpeed: 430,
      contactDamage: 20,
    },
    groom: {
      w: 42,
      h: 54,
      speed: 148,
      hopPower: 900,
      health: 4,
      color: "#4d4d59",
      accent: "#f0d8b1",
      label: "Shotgun Groom",
      introLine: "The shotgun groom has decided this is personal.",
      defeatLine: "The groom loses the chase and Barry keeps running.",
      projectileKind: "ring",
      projectileColor: "#f5de76",
      projectileSpeed: 340,
      contactDamage: 22,
    },
    dockcop: {
      w: 44,
      h: 54,
      speed: 142,
      hopPower: 920,
      health: 5,
      color: "#45687d",
      accent: "#85d7df",
      label: "Harbour Cop",
      introLine: "The harbour cop plants himself between Barry and the boat.",
      defeatLine: "The harbour cop wipes out and the dock finally clears.",
      projectileKind: "buoy",
      projectileColor: "#ff7249",
      projectileSpeed: 300,
      contactDamage: 24,
    },
    roo: {
      w: 48,
      h: 58,
      speed: 146,
      hopPower: 980,
      health: 3,
      color: "#b67d45",
      accent: "#f4ddb8",
      label: "Big Red Roo",
      introLine: "The roo remembers exactly what Barry did to the ute.",
      defeatLine: "The roo loses interest and bounds off like Barry was never worth it.",
      projectileKind: "none",
      projectileColor: "#cf9652",
      projectileSpeed: 260,
      contactDamage: 26,
    },
    farmer: {
      w: 42,
      h: 56,
      speed: 132,
      hopPower: 820,
      health: 4,
      color: "#7d5937",
      accent: "#d1b489",
      label: "Angry Farmer",
      introLine: "The farmer clocks Barry and goes absolutely spare.",
      defeatLine: "The farmer finally stops swinging and starts yelling for the cops instead.",
      projectileKind: "shotgun",
      projectileColor: "#ffe6a4",
      projectileSpeed: 420,
      contactDamage: 22,
    },
    sergeant: {
      w: 44,
      h: 56,
      speed: 138,
      hopPower: 860,
      health: 5,
      color: "#405578",
      accent: "#a9c7ea",
      label: "Bush Sergeant",
      introLine: "The local sergeant has decided Barry is absolutely his problem now.",
      defeatLine: "The sergeant slips behind the floodlights and Barry finally gets a gap.",
      projectileKind: "shot",
      projectileColor: "#dbe6ff",
      projectileSpeed: 470,
      contactDamage: 24,
    },
  }[type] ?? {};

  const health = extra.health ?? defaults.health ?? 3;
  return {
    type,
    x,
    y,
    startX: x,
    startY: y,
    prevX: x,
    prevY: y,
    vx: 0,
    vy: 0,
    w: extra.w ?? defaults.w ?? 40,
    h: extra.h ?? defaults.h ?? 50,
    dir: extra.dir ?? -1,
    alive: true,
    active: false,
    onGround: false,
    ground: null,
    health,
    maxHealth: health,
    invuln: 0,
    attackCooldown: extra.attackCooldown ?? 1.1,
    throwCooldown: extra.throwCooldown ?? 1.8,
    patrolLeft: arena.left,
    patrolRight: arena.right,
    arenaLeft: arena.left,
    arenaRight: arena.right,
    color: extra.color ?? defaults.color ?? "#5f5f5f",
    accent: extra.accent ?? defaults.accent ?? "#f4e2c4",
    speed: extra.speed ?? defaults.speed ?? 130,
    hopPower: extra.hopPower ?? defaults.hopPower ?? 880,
    label: extra.label ?? defaults.label ?? "Boss",
    introLine: extra.introLine ?? defaults.introLine ?? "A very bad decision appears.",
    defeatLine: extra.defeatLine ?? defaults.defeatLine ?? "Barry survives the worst of it.",
    projectileKind: extra.projectileKind ?? defaults.projectileKind ?? "junk",
    projectileColor: extra.projectileColor ?? defaults.projectileColor ?? "#f2d47b",
    projectileSpeed: extra.projectileSpeed ?? defaults.projectileSpeed ?? 300,
    contactDamage: extra.contactDamage ?? defaults.contactDamage ?? 20,
  };
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function createBackdrop(seed, width, height, options = {}) {
  const random = mulberry32(seed);
  const clouds = [];
  const hills = [];
  const mesas = [];
  const shrubs = [];
  const gumTrees = [];
  const birds = [];
  const koalas = [];
  const treeScale = options.treeScale ?? 1;
  const treeCount = options.treeCount ?? 18;
  const treeStyles = options.treeStyles ?? ["river", "ghost"];

  for (let i = 0; i < 8; i++) {
    clouds.push({
      x: 180 + random() * (width - 360),
      y: 40 + random() * 120,
      scale: 0.7 + random() * 1.25,
      drift: 10 + random() * 26,
      speed: 0.04 + random() * 0.07,
    });
  }

  for (let i = 0; i < 6; i++) {
    hills.push({
      x: -120 + i * (width / 5.2) + random() * 90,
      y: height - 240 - random() * 70,
      w: 280 + random() * 240,
      h: 140 + random() * 130,
      color: i % 2 === 0 ? "#66734a" : "#50633f",
    });
  }

  for (let i = 0; i < 5; i++) {
    mesas.push({
      x: 90 + i * (width / 5.4) + random() * 140,
      y: height - 340 - random() * 130,
      w: 120 + random() * 120,
      h: 140 + random() * 140,
      layers: 3 + Math.floor(random() * 3),
    });
  }

  for (let i = 0; i < 28; i++) {
    shrubs.push({
      x: random() * width,
      y: height - 118 - random() * 60,
      r: 8 + random() * 12,
      tint: i % 3 === 0 ? "#325d35" : "#486a37",
    });
  }

  for (let i = 0; i < treeCount; i++) {
    const x = 60 + random() * (width - 120);
    const trunkH = (58 + random() * 74) * treeScale;
    const crown = (28 + random() * 24) * treeScale;
    const y = height - 138 - random() * 62;
    const style = treeStyles[Math.floor(random() * treeStyles.length)];
    gumTrees.push({
      x,
      y,
      trunkH,
      trunkW: (8 + random() * 5) * Math.min(treeScale, 1.45),
      crown,
      lean: -0.08 + random() * 0.16,
      tint: i % 2 === 0 ? "#58764b" : "#4d6941",
      style,
    });
    if (random() > 0.72) {
      koalas.push({
        treeIndex: gumTrees.length - 1,
        side: random() > 0.5 ? -1 : 1,
        offsetY: 18 + random() * 22,
      });
    }
  }

  for (let i = 0; i < 9; i++) {
    birds.push({
      x: random() * width,
      y: 60 + random() * 130,
      span: 10 + random() * 10,
      speed: 16 + random() * 20,
      flap: random() * Math.PI * 2,
      scale: 0.8 + random() * 0.7,
    });
  }

  return { clouds, hills, mesas, shrubs, gumTrees, birds, koalas };
}

function buildLevelOne() {
  const width = 3540;
  const height = 900;
  return {
    title: "Roo Strike",
    objective: "Climb out of the wreck and keep moving toward site.",
    legend: "Barry Lawson totalled a ute and king-hit a kangaroo before breakfast.",
    truth: "He hit the roo, wrecked the ute, and immediately had the worst morning of his life.",
    theme: {
      skyTop: "#87c7e8",
      skyBottom: "#ffd08a",
      sun: "#ffe07a",
      hillFar: "#738258",
      hillNear: "#556645",
      ground: "#8c6742",
      groundTop: "#b58757",
      detail: "#2a2218",
      accent: "#f2cc6f",
    },
    spawn: { x: 90, y: 650 },
    checkpoint: { x: 1320, y: 620, label: "Wreck Line" },
    finishZone: finish(3260, 585, 120, 170, "TRACK", "ute"),
    world: { width, height },
    backdrop: createBackdrop(11, width, height, { treeCount: 16, treeScale: 1.28, treeStyles: ["ghost", "river"] }),
    platforms: [
      solid(0, 760, 560, 140),
      solid(760, 760, 410, 140),
      solid(1260, 760, 500, 140),
      solid(1900, 760, 380, 140),
      solid(2520, 760, 1020, 140),
      ledge(870, 640, 180, 18),
      ledge(1470, 580, 170, 18),
      ledge(2140, 660, 160, 18),
      ledge(2760, 610, 170, 18),
    ],
    movers: [
      mover(1730, 655, 110, 18, {
        axis: "y",
        amplitude: 58,
        speed: 1.25,
        phase: 0.35,
        style: "ute",
      }),
    ],
    hazards: [
      hazard(560, 800, 120, 68, "cactus", 22),
      hazard(1780, 782, 100, 48, "mud", 18),
    ],
    enemies: [
      enemy("kangaroo", 980, 724, { left: 810, right: 1170 }),
      enemy("magpie", 1620, 620, { left: 1480, right: 1820 }, { w: 28, h: 18, speed: 126, color: "#2f2f38" }),
      enemy("snake", 2680, 750, { left: 2560, right: 2900 }),
    ],
    checkpoints: [checkpoint(1320, 712, "Wreck Line")],
    collectibles: [
      collectible("snag", 380, 724),
      collectible("life", 1730, 590),
      collectible("snag", 980, 598),
      collectible("beer", 2740, 690, { duration: 8 }),
      collectible("snag", 2500, 632),
    ],
    decor: [
      { kind: "wreck", x: 210, y: 756, scale: 1.25 },
      { kind: "esky", x: 1020, y: 742, scale: 1 },
      { kind: "sign", x: 2450, y: 744, scale: 1.1 },
    ],
    boss: boss("roo", 3060, 702, { left: 2860, right: 3330 }),
    projectiles: [],
  };
}

function buildLevelTwo() {
    const width = 3540;
    const height = 1160;
    return {
      title: "No Bars",
      objective: "Climb the scrub maze, wall-hop the rock cuts, and follow the old bushman out.",
      legend: "Barry vanished into the outback and came back blessed by bush magic.",
      truth: "He got lost, got rescued by an old stockman, and was told to stop being useless.",
    theme: {
      skyTop: "#7ea6bf",
      skyBottom: "#f4d7a0",
      sun: "#ffe18a",
      hillFar: "#68805c",
      hillNear: "#4f6547",
      ground: "#786245",
      groundTop: "#b08b5f",
      detail: "#262016",
      accent: "#8be1cf",
    },
      spawn: { x: 90, y: 818 },
      checkpoint: { x: 1850, y: 614, label: "Bush Camp" },
      finishZone: finish(3200, 356, 110, 200, "RIDGE", "flag"),
      world: { width, height },
      backdrop: createBackdrop(22, width, height, { treeCount: 26, treeScale: 1.56, treeStyles: ["river", "mallee", "ghost"] }),
      platforms: [
        solid(0, 930, 360, 230),
        solid(470, 860, 170, 300),
        solid(760, 720, 120, 440),
        solid(960, 870, 220, 290),
        solid(1300, 710, 130, 450),
        solid(1500, 560, 220, 600),
        solid(1810, 830, 230, 330),
        solid(2140, 650, 120, 510),
        solid(2350, 520, 210, 640),
        solid(2670, 760, 140, 400),
        solid(2910, 610, 140, 550),
        solid(3110, 440, 430, 720),
        ledge(330, 790, 90, 18),
        ledge(655, 770, 70, 18),
        ledge(895, 640, 75, 18),
        ledge(1200, 720, 80, 18),
        ledge(1450, 470, 80, 18),
        ledge(1735, 680, 75, 18),
        ledge(2050, 560, 70, 18),
        ledge(2275, 450, 70, 18),
        ledge(2570, 610, 75, 18),
        ledge(2860, 510, 70, 18),
      ],
      movers: [
        mover(1085, 662, 96, 18, {
          axis: "y",
          amplitude: 84,
          speed: 1.05,
          phase: 0.6,
          style: "crate",
        }),
        mover(2735, 590, 110, 18, {
          axis: "y",
          amplitude: 94,
          speed: 1.18,
          phase: 1.8,
          style: "truck",
        }),
      ],
      hazards: [
      hazard(360, 930, 90, 120, "water", 30),
      hazard(640, 930, 120, 120, "cactus", 24),
      hazard(880, 930, 70, 120, "fire", 22, { pulse: true, pulseSpeed: 3.2, pulsePhase: 0.2 }),
      hazard(1180, 930, 110, 120, "water", 30),
      hazard(1430, 930, 120, 120, "cactus", 22),
      hazard(1720, 930, 80, 120, "fire", 22, { pulse: true, pulseSpeed: 2.8, pulsePhase: 1.2 }),
      hazard(2040, 930, 90, 120, "water", 32),
      hazard(2260, 930, 120, 120, "cactus", 24),
      hazard(2560, 930, 90, 120, "fire", 24, { pulse: true, pulseSpeed: 2.4, pulsePhase: 0.8 }),
      hazard(2810, 930, 90, 120, "water", 32),
      ],
      enemies: [
        enemy("dingo", 520, 828, { left: 480, right: 640 }, { color: "#8a6b43" }),
        enemy("emu", 1540, 518, { left: 1500, right: 1710 }, { color: "#7f6a4f", speed: 124 }),
        enemy("goanna", 2360, 488, { left: 2350, right: 2560 }, { color: "#6a7d47", w: 34, h: 16, speed: 82 }),
        enemy("emu", 3140, 398, { left: 3110, right: 3490 }, { color: "#6d5d49", speed: 126 }),
      ],
      checkpoints: [checkpoint(1850, 614, "Bush Camp", 1850, 624)],
      collectibles: [
        collectible("snag", 336, 756),
        collectible("beer", 1120, 618, { duration: 8 }),
        collectible("life", 1730, 628),
        collectible("snag", 2270, 412),
        collectible("snag", 2850, 470),
      ],
      decor: [
        { kind: "campfire", x: 910, y: 694, scale: 1 },
        { kind: "totem", x: 1650, y: 528, scale: 1.2 },
        { kind: "swag", x: 1885, y: 824, scale: 1.05 },
        { kind: "totem", x: 3210, y: 434, scale: 1.05 },
      ],
      boss: null,
      projectiles: [],
  };
}

function buildLevelThree() {
    const width = 3920;
    const height = 1180;
    return {
      title: "Tomato Patch",
      objective: "Climb through the crop maze, thread the drying racks, and survive the angry farmer.",
    legend: "Barry Lawson infiltrated a criminal crop empire.",
    truth: "He thought the plants were tomatoes and picked the worst possible garden to trespass in.",
    theme: {
      skyTop: "#a0bb95",
      skyBottom: "#f2c58b",
      sun: "#ffe180",
      hillFar: "#64785a",
      hillNear: "#48583f",
      ground: "#72553a",
      groundTop: "#b58a56",
      detail: "#24190f",
      accent: "#8ce069",
    },
      spawn: { x: 80, y: 866 },
      checkpoint: { x: 2140, y: 644, label: "Drying Shed" },
      finishZone: finish(3620, 500, 120, 230, "SHED", "exit"),
      world: { width, height },
      backdrop: createBackdrop(33, width, height, { treeCount: 20, treeScale: 1.36, treeStyles: ["mallee", "river", "dead"] }),
      platforms: [
        solid(0, 980, 310, 200),
        solid(420, 900, 150, 280),
        solid(660, 760, 120, 420),
        solid(850, 910, 200, 270),
        solid(1130, 720, 110, 460),
        solid(1310, 600, 210, 580),
        solid(1610, 860, 170, 320),
        solid(1860, 720, 140, 460),
        solid(2070, 560, 220, 620),
        solid(2360, 860, 170, 320),
        solid(2600, 690, 140, 490),
        solid(2820, 560, 210, 620),
        solid(3080, 860, 150, 320),
        solid(3300, 720, 620, 460),
        ledge(300, 832, 80, 18),
        ledge(590, 822, 65, 18),
        ledge(795, 690, 60, 18),
        ledge(1070, 822, 70, 18),
        ledge(1255, 640, 60, 18),
        ledge(1540, 754, 65, 18),
        ledge(1790, 672, 60, 18),
        ledge(2015, 500, 65, 18),
        ledge(2315, 738, 60, 18),
        ledge(2550, 612, 60, 18),
        ledge(2760, 500, 60, 18),
        ledge(3050, 794, 65, 18),
      ],
      movers: [
        mover(905, 748, 96, 18, {
          axis: "y",
          amplitude: 90,
          speed: 1.05,
          phase: 0.4,
          style: "car",
        }),
        mover(2425, 700, 96, 18, {
          axis: "y",
          amplitude: 104,
          speed: 1.35,
          phase: 2.2,
          style: "truck",
        }),
      ],
      hazards: [
        hazard(320, 980, 120, 120, "cactus", 22),
        hazard(570, 980, 90, 120, "fire", 24, { pulse: true, pulseSpeed: 3.6, pulsePhase: 1.8 }),
        hazard(780, 980, 70, 120, "water", 28),
        hazard(1050, 980, 120, 120, "cactus", 24),
        hazard(1240, 980, 70, 120, "fire", 24, { pulse: true, pulseSpeed: 3.0, pulsePhase: 0.8 }),
        hazard(1520, 980, 90, 120, "water", 30),
        hazard(1780, 980, 120, 120, "cactus", 24),
        hazard(2000, 980, 70, 120, "fire", 22, { pulse: true, pulseSpeed: 2.5, pulsePhase: 0.7 }),
        hazard(2290, 980, 70, 120, "water", 34),
        hazard(2530, 980, 120, 120, "cactus", 24),
        hazard(2740, 980, 80, 120, "fire", 24, { pulse: true, pulseSpeed: 2.2, pulsePhase: 1.3 }),
        hazard(3030, 980, 90, 120, "water", 34),
      ],
      enemies: [
        enemy("farmdog", 450, 872, { left: 420, right: 570 }, { color: "#8e7150", speed: 116 }),
        enemy("cropguard", 1340, 562, { left: 1310, right: 1510 }, { color: "#71563b", speed: 98 }),
        enemy("cropguard", 2080, 522, { left: 2070, right: 2290 }, { color: "#5d412d", speed: 100 }),
        enemy("farmdog", 2840, 522, { left: 2820, right: 3030 }, { color: "#896443", speed: 122 }),
        enemy("cultist", 3340, 682, { left: 3300, right: 3620 }, { color: "#71513a", speed: 92 }),
      ],
      checkpoints: [checkpoint(2140, 644, "Drying Shed", 2140, 654)],
      collectibles: [
        collectible("snag", 330, 798),
        collectible("snag", 1180, 666),
        collectible("beer", 3230, 714, { duration: 9 }),
        collectible("life", 2790, 452),
        collectible("snag", 2410, 692),
      ],
      decor: [
        { kind: "cultPlant", x: 245, y: 980, scale: 1.45 },
        { kind: "cultPlant", x: 704, y: 760, scale: 1.55 },
        { kind: "crate", x: 1230, y: 692, scale: 1.05 },
        { kind: "cultPlant", x: 2145, y: 560, scale: 1.6 },
        { kind: "cultPlant", x: 3020, y: 560, scale: 1.8 },
      ],
      boss: boss("farmer", 3470, 664, { left: 3300, right: 3760 }),
      projectiles: [],
    };
  }

function buildLevelFour() {
  const width = 3880;
  const height = 960;
  return {
    title: "Raid Run",
    objective: "Escape the police raid, dodge the dogs, and stay out of the spotlight.",
    legend: "Barry Lawson slipped a full police operation and vanished into the night.",
    truth: "The raid hit while he was already trying to get out, which somehow made him look even guiltier.",
    theme: {
      skyTop: "#394b73",
      skyBottom: "#7a5d52",
      sun: "#f6c087",
      hillFar: "#414f53",
      hillNear: "#28343a",
      ground: "#4e433f",
      groundTop: "#8a6857",
      detail: "#16181b",
      accent: "#6fc7ff",
    },
    spawn: { x: 70, y: 670 },
    checkpoint: { x: 1730, y: 620, label: "Burn Line" },
    finishZone: finish(3540, 520, 130, 220, "FENCE", "portal"),
    world: { width, height },
    backdrop: createBackdrop(44, width, height, { treeCount: 14, treeScale: 1.42, treeStyles: ["dead", "ghost"] }),
    platforms: [
      solid(0, 780, 360, 180),
      solid(560, 780, 320, 180),
      solid(980, 780, 350, 180),
      solid(1500, 780, 300, 180),
      solid(1980, 780, 300, 180),
      solid(2440, 780, 330, 180),
      solid(2920, 780, 960, 180),
      ledge(360, 640, 140, 18),
      ledge(680, 560, 150, 18),
      ledge(1080, 500, 150, 18),
      ledge(1430, 620, 150, 18),
      ledge(1800, 540, 160, 18),
      ledge(2140, 470, 150, 18),
      ledge(2550, 430, 160, 18),
      ledge(3000, 560, 180, 18),
    ],
    movers: [
      mover(1270, 620, 120, 18, {
        axis: "y",
        amplitude: 90,
        speed: 1.4,
        phase: 0.7,
        style: "boat",
      }),
      mover(2220, 605, 140, 18, {
        axis: "x",
        amplitude: 170,
        speed: 1.0,
        phase: 1.8,
        style: "barge",
      }),
      mover(2810, 590, 120, 18, {
        axis: "y",
        amplitude: 70,
        speed: 1.1,
        phase: 2.7,
        style: "boat",
      }),
    ],
    hazards: [
        hazard(430, 780, 100, 84, "water", 32),
        hazard(840, 780, 120, 84, "water", 32),
        hazard(1330, 780, 100, 84, "water", 34),
      hazard(1870, 780, 180, 120, "cactus", 22),
      hazard(2360, 780, 120, 90, "fire", 24, { pulse: true, pulseSpeed: 2.2, pulsePhase: 0.4 }),
        hazard(3090, 780, 110, 84, "water", 34),
    ],
    enemies: [
      enemy("policeDog", 700, 748, { left: 590, right: 880 }, { color: "#434c52", speed: 120 }),
      enemy("trooper", 1110, 748, { left: 1010, right: 1320 }, { color: "#516b95", speed: 94 }),
      enemy("trooper", 1830, 780, { left: 1770, right: 2050 }, { color: "#4c6589", speed: 96 }),
      enemy("policeDog", 2470, 748, { left: 2410, right: 2650 }, { color: "#40474f", speed: 124 }),
    ],
    checkpoints: [checkpoint(1730, 700, "Burn Line")],
    collectibles: [
      collectible("snag", 440, 752),
      collectible("beer", 2920, 688, { duration: 9 }),
      collectible("snag", 2140, 504),
      collectible("life", 2890, 500),
      collectible("snag", 3080, 746),
    ],
    decor: [
      { kind: "searchlight", x: 540, y: 744, scale: 1.05 },
      { kind: "searchlight", x: 1410, y: 744, scale: 1.15 },
      { kind: "siren", x: 2200, y: 744, scale: 1.08 },
      { kind: "siren", x: 3050, y: 744, scale: 1.08 },
    ],
    boss: boss("sergeant", 3260, 724, { left: 3100, right: 3600 }),
    projectiles: [],
  };
}

const levelFactories = [buildLevelOne, buildLevelTwo, buildLevelThree, buildLevelFour];

function loadLevel(index, showIntro = true) {
  state.levelIndex = index;
  level = levelFactories[index]();
  level.collectibles ??= [];
  level.projectiles ??= [];
  player.x = level.spawn.x;
  player.y = level.spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.facing = 1;
  player.onGround = false;
  player.ground = null;
  player.coyote = 0;
  player.jumpBuffer = 0;
  player.jumpsUsed = 0;
  player.wallDir = 0;
  player.wallGrace = 0;
  player.beerTime = 0;
  player.invuln = 0;
  player.spawnX = level.spawn.x;
  player.spawnY = level.spawn.y;
  syncHealthFromSnags();
  state.message = "";
  state.messageTimer = 0;
  state.introShown = false;
  state.checkpointLabel = "Spawn";
  missionTitle.textContent = level.title;
  missionObjective.textContent = level.objective;
  troubleLabel.textContent = `Trouble ${"!".repeat(index + 1)}`;
  dashLabel.textContent = "Jump";
  vehicleStatus.textContent = "Checkpoint Spawn | Falls 0";
  state.mode = showIntro ? "interlude" : "playing";
  camera.x = clamp(player.x - VIEW.width / 2, 0, Math.max(0, level.world.width - VIEW.width));
  camera.y = clamp(player.y - VIEW.height / 2, 0, Math.max(0, level.world.height - VIEW.height));
  if (showIntro) {
    showStoryCard({
      kicker: index === 0 ? "The Legend" : "Next Mission",
      title: level.title,
      copy: `${level.legend} ${level.truth}`,
      button: index === 0 ? "Start Mission" : "Continue",
    });
  }
  updateHUD();
}

function showStoryCard({ kicker, title, copy, button }) {
  storyKicker.textContent = kicker;
  storyTitle.textContent = title;
  storyCopy.textContent = copy;
  storyButton.textContent = button;
  storyCard.classList.remove("hidden");
  shell.classList.add("story-open");
}

function hideStoryCard() {
  storyCard.classList.add("hidden");
  shell.classList.remove("story-open");
}

function showTitleScreen() {
  loadLevel(0, true);
  state.mode = "title";
  missionTitle.textContent = "GLA: Grand Lap Australia";
  missionObjective.textContent = "Barry is trying to get to work. Australia is not making it easy.";
  vehicleStatus.textContent = "Checkpoint 1 | Falls 0";
  troubleLabel.textContent = "Trouble !";
  dashLabel.textContent = "Jump";
  showStoryCard({
    kicker: "Start Of Swing",
    title: "Barry Lawson is already running late for site.",
    copy: "Barry is a diesel fitter driving out to the mine when he hits a roo, wrecks the ute, gets no reception, and starts walking into the bush. Controls: A/D or arrows move, Space or W jumps twice, and R resets. Barry starts with five snags and loses one every time he gets hit. Boxing roo tokens give extra lives.",
    button: "Start Mission",
  });
}

function startGame() {
  hideStoryCard();
  state.mode = "playing";
  state.time = 0;
  state.deaths = 0;
  state.lives = STARTING_LIVES;
  state.snags = MAX_SNAGS;
  syncHealthFromSnags();
  loadLevel(0, false);
  showMessage("Barry starts with five snags. Each hit costs one.");
}

function advanceLevel() {
  state.completedLevels += 1;
  if (state.levelIndex >= levelFactories.length - 1) {
    state.mode = "victory";
    showStoryCard({
      kicker: "Still Late",
      title: "Barry is nowhere near clocking on.",
      copy: "He survived the wreck, the bush, the hidden farm, and the police raid. He is filthy, rattled, and still somehow trying to make shift.",
      button: "Back To Title",
    });
    return;
  }

  const nextIndex = state.levelIndex + 1;
  state.mode = "interlude";
  loadLevel(nextIndex, true);
}

function restartLevel() {
  if (!level) return;
  player.x = player.spawnX;
  player.y = player.spawnY;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.ground = null;
  player.coyote = 0;
  player.jumpBuffer = 0;
  player.jumpsUsed = 0;
  player.wallDir = 0;
  player.wallGrace = 0;
  player.beerTime = 0;
  player.invuln = 0.3;
  state.snags = MAX_SNAGS;
  syncHealthFromSnags();
  if (level.boss?.alive) {
    level.boss.x = level.boss.startX;
    level.boss.y = level.boss.startY;
    level.boss.prevX = level.boss.startX;
    level.boss.prevY = level.boss.startY;
    level.boss.vx = 0;
    level.boss.vy = 0;
    level.boss.invuln = 0;
    level.boss.attackCooldown = 0.8;
    level.boss.throwCooldown = 1.4;
    level.boss.health = level.boss.maxHealth;
  }
  level.projectiles = [];
  showMessage("Barry resets at the last checkpoint.");
}

function loseLife(reason) {
  state.deaths += 1;
  state.lives = Math.max(0, state.lives - 1);
  if (state.lives <= 0) {
    gameOver(reason);
    return;
  }
  restartLevel();
  showMessage(`${reason} ${state.lives} lives left.`, 1.6);
}

function gameOver(reason) {
  state.mode = "gameover";
  hideStoryCard();
  showStoryCard({
    kicker: "Wasted Lap",
    title: "Barry is out of lives.",
    copy: `${reason} The boxing kangaroo stash is gone and the Hilux is not walking itself home.`,
    button: "Try Again",
  });
}

storyButton.addEventListener("click", () => {
  if (state.mode === "title") {
    startGame();
    return;
  }

  if (state.mode === "victory") {
    state.completedLevels = 0;
    showTitleScreen();
    return;
  }

  if (state.mode === "ending") {
    state.completedLevels = 0;
    showTitleScreen();
    return;
  }

  if (state.mode === "gameover") {
    state.completedLevels = 0;
    startGame();
    return;
  }

  if (state.mode === "interlude") {
    hideStoryCard();
    state.mode = "playing";
    showMessage(level.title);
  }
});

const keyMap = new Map([
  ["KeyA", "left"],
  ["ArrowLeft", "left"],
  ["KeyD", "right"],
  ["ArrowRight", "right"],
  ["KeyW", "jump"],
  ["ArrowUp", "jump"],
  ["Space", "jump"],
  ["KeyE", "use"],
  ["KeyR", "restart"],
]);

window.addEventListener("keydown", (event) => {
  const action = keyMap.get(event.code);
  if (!action) return;
  event.preventDefault();
  if (!ACTIONS[action]) {
    pressed[action] = true;
  }
  ACTIONS[action] = true;
});

window.addEventListener("keyup", (event) => {
  const action = keyMap.get(event.code);
  if (!action) return;
  event.preventDefault();
  ACTIONS[action] = false;
});

function bindTouchButton(button) {
  const action = button.dataset.action;
  const down = (event) => {
    event.preventDefault();
    if (!ACTIONS[action]) {
      pressed[action] = true;
    }
    ACTIONS[action] = true;
    button.setPointerCapture?.(event.pointerId);
  };
  const up = (event) => {
    event.preventDefault();
    ACTIONS[action] = false;
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointerleave", up);
  button.addEventListener("pointercancel", up);
}

touchButtons.forEach(bindTouchButton);

function resizeCanvas() {
  const rect = shell.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  VIEW.width = rect.width;
  VIEW.height = rect.height;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function showMessage(text, duration = 2.2) {
  state.message = text;
  state.messageTimer = duration;
}

function useSnag() {
  showMessage("Snags are Barry's health now. Pick one up to refill.", 1.0);
}

function hurtPlayer(amount, reason, knockback = 220) {
  if (!level || player.invuln > 0 || player.beerTime > 0) {
    return;
  }
  state.snags = clamp(state.snags - 1, 0, MAX_SNAGS);
  syncHealthFromSnags();
  player.invuln = 0.8;
  player.vy = Math.min(player.vy, -160);
  player.vx += -player.facing * knockback * 0.65;
  showMessage(reason, 1.4);
  if (state.snags <= 0) {
    loseLife("Barry burns a life.");
  }
}

function activateCheckpoint(cp) {
  level.checkpoints.forEach((item) => {
    item.reached = item === cp;
  });
  player.spawnX = cp.spawnX ?? cp.x;
  player.spawnY = cp.spawnY ?? (cp.y - player.h + 8);
  state.checkpointLabel = cp.label;
  showMessage(`${cp.label} reached.`);
  vehicleStatus.textContent = `Checkpoint ${cp.label} | Falls ${state.deaths}`;
}

function completeLevel() {
  if (state.mode !== "playing") return;
  hideStoryCard();
  if (state.levelIndex >= levelFactories.length - 1) {
    state.mode = "ending";
    showStoryCard({
      kicker: "The Truth",
      title: "Barry is still not at work.",
      copy: "Barry survives the bush sergeant and the whole rotten lap so far, but he is still dusty, late, and absolutely not done with this country.",
      button: "Back To Title",
    });
    return;
  }

  const nextLevel = state.levelIndex + 1;
  loadLevel(nextLevel, false);
  state.mode = "interlude";
  showStoryCard({
    kicker: "The Legend",
    title: level.title,
    copy: `${level.legend} ${level.truth}`,
    button: "Continue",
  });
}

function updatePlayer(dt) {
  if (pressed.restart) {
    restartLevel();
  }
  if (pressed.use) {
    useSnag();
  }

  player.prevX = player.x;
  player.prevY = player.y;

  player.invuln = Math.max(0, player.invuln - dt);
  player.beerTime = Math.max(0, player.beerTime - dt);
  player.coyote = Math.max(0, player.coyote - dt);
  player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
  player.wallGrace = Math.max(0, player.wallGrace - dt);

  const moveIntent = (ACTIONS.right ? 1 : 0) - (ACTIONS.left ? 1 : 0);
  if (moveIntent !== 0) {
    player.facing = moveIntent;
  }

  if (pressed.jump) {
    player.jumpBuffer = 0.16;
  }

  const maxSpeed = player.onGround ? 240 : 190;
  const accel = player.onGround ? 1800 : 1250;
  const friction = player.onGround ? 2200 : 250;

  const targetVX = moveIntent * maxSpeed;
  if (moveIntent !== 0) {
    player.vx = approach(player.vx, targetVX, accel * dt);
  } else {
    player.vx = approach(player.vx, 0, friction * dt);
  }

  player.vy += 2400 * dt;
  player.vy = clamp(player.vy, -1200, 1000);

  moveEntity(player, dt, level.platforms, level.movers);

  if (player.onGround) {
    player.coyote = 0.11;
    player.jumpsUsed = 0;
    if (player.ground && player.ground.kind === "mover") {
      player.x += player.ground.vx;
      player.y += player.ground.vy;
    }
  }

  if (player.jumpBuffer > 0 && !player.onGround && player.wallGrace > 0 && player.wallDir !== 0) {
    player.vx = -player.wallDir * 320;
    player.vy = -790;
    player.jumpBuffer = 0;
    player.onGround = false;
    player.wallGrace = 0;
    player.jumpsUsed = Math.min(MAX_JUMPS - 1, Math.max(1, player.jumpsUsed));
    showMessage("Barry wall-hops like it's somehow a plan.", 0.9);
  } else if (player.jumpBuffer > 0 && player.jumpsUsed < MAX_JUMPS) {
    player.vy = -840;
    player.jumpBuffer = 0;
    player.coyote = 0;
    player.onGround = false;
    player.jumpsUsed += 1;
    showMessage(randomJumpLine(), 0.95);
  }

  player.x = clamp(player.x, 0, level.world.width - player.w);
  player.y = clamp(player.y, -100, level.world.height + 160);

  if (player.y > level.world.height + 120) {
    loseLife("Barry drops into the void.");
  }

  if (player.jumpBuffer <= 0) {
    player.jumpBuffer = 0;
  }
}

function randomJumpLine() {
  const lines = [
    "Barry goes full send.",
    "This feels legally questionable.",
    "Pure country momentum.",
    "The ute would have hated this.",
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

function moveEntity(entity, dt, platforms, movers) {
  const colliders = [...platforms, ...movers];
  if ("wallDir" in entity) {
    entity.wallDir = 0;
  }

  entity.x += entity.vx * dt;
  entity.y = entity.y;
  resolveHorizontal(entity, colliders);

  entity.y += entity.vy * dt;
  entity.onGround = false;
  entity.ground = null;
  resolveVertical(entity, colliders);
}

function resolveHorizontal(entity, colliders) {
  const current = rectLike(entity);
  for (const collider of colliders) {
    if (collider.oneWay) continue;
    if (!rectsIntersect(current, collider)) continue;
    if (entity.prevX + entity.w <= collider.x && entity.x + entity.w > collider.x) {
      entity.x = collider.x - entity.w;
      entity.vx = Math.min(entity.vx, 0);
      if ("wallDir" in entity) {
        entity.wallDir = 1;
        entity.wallGrace = 0.14;
      }
    } else if (entity.prevX >= collider.x + collider.w && entity.x < collider.x + collider.w) {
      entity.x = collider.x + collider.w;
      entity.vx = Math.max(entity.vx, 0);
      if ("wallDir" in entity) {
        entity.wallDir = -1;
        entity.wallGrace = 0.14;
      }
    }
    current.x = entity.x;
  }
}

function resolveVertical(entity, colliders) {
  const current = rectLike(entity);
  for (const collider of colliders) {
    if (!rectsIntersect(current, collider)) continue;

    if (collider.oneWay) {
      if (entity.vy >= 0 && entity.prevY + entity.h <= collider.y + 8 && entity.y + entity.h >= collider.y) {
        entity.y = collider.y - entity.h;
        entity.vy = 0;
        entity.onGround = true;
        entity.ground = collider;
        current.y = entity.y;
      }
      continue;
    }

    if (entity.prevY + entity.h <= collider.y && entity.y + entity.h > collider.y) {
      entity.y = collider.y - entity.h;
      entity.vy = 0;
      entity.onGround = true;
      entity.ground = collider;
      current.y = entity.y;
    } else if (entity.prevY >= collider.y + collider.h && entity.y < collider.y + collider.h) {
      entity.y = collider.y + collider.h;
      entity.vy = 0;
      current.y = entity.y;
    }
  }
}

function rectLike(entity) {
  return { x: entity.x, y: entity.y, w: entity.w, h: entity.h };
}

function updateMovingPlatforms(dt, timeNow) {
  for (const platform of level.movers) {
    platform.prevX = platform.x;
    platform.prevY = platform.y;
    if (platform.axis === "x") {
      platform.x = platform.startX + Math.sin(timeNow * platform.speed + platform.phase) * platform.amplitude;
      platform.y = platform.startY + platform.offset;
    } else {
      platform.x = platform.startX + platform.offset;
      platform.y = platform.startY + Math.sin(timeNow * platform.speed + platform.phase) * platform.amplitude;
    }
    platform.vx = platform.x - platform.prevX;
    platform.vy = platform.y - platform.prevY;
  }
}

function updateEnemies(dt) {
  for (const foe of level.enemies) {
    if (!foe.alive) continue;

    foe.prevX = foe.x;
    foe.prevY = foe.y;
    foe.jumpCooldown = Math.max(0, foe.jumpCooldown - dt);

    if (foe.type === "kangaroo") {
      if (foe.onGround === undefined) foe.onGround = false;
      const distToPlayer = distance(foe.x, foe.y, player.x, player.y);
      if (foe.onGround && foe.jumpCooldown <= 0 && distToPlayer < 330) {
        foe.dir = player.x > foe.x ? 1 : -1;
        foe.vx = foe.dir * (foe.speed + 50);
        foe.vy = -foe.hopPower;
        foe.jumpCooldown = 0.95;
      } else {
        foe.vx = approach(foe.vx, foe.dir * foe.speed, 900 * dt);
      }
      foe.vy += 2400 * dt;
      if (foe.onGround && wouldWalkOffEdge(foe, 12)) {
        foe.dir *= -1;
        foe.vx = 0;
      }
      moveEntity(foe, dt, level.platforms, level.movers);
      if (foe.onGround && Math.abs(foe.vx) < 5) {
        foe.dir *= -1;
      }
      if (foe.x < foe.patrolLeft) foe.dir = 1;
      if (foe.x + foe.w > foe.patrolRight) foe.dir = -1;
    } else if (foe.type === "dingo" || foe.type === "farmdog" || foe.type === "policeDog") {
      if (foe.x < foe.patrolLeft) foe.dir = 1;
      if (foe.x + foe.w > foe.patrolRight) foe.dir = -1;
      const distToPlayer = distance(foe.x, foe.y, player.x, player.y);
      if (distToPlayer < 260) {
        foe.dir = player.x > foe.x ? 1 : -1;
        foe.vx = approach(foe.vx, foe.dir * (foe.speed + 28), 1200 * dt);
      } else {
        foe.vx = approach(foe.vx, foe.dir * foe.speed, 980 * dt);
      }
      foe.vy += 2400 * dt;
      if (foe.onGround && wouldWalkOffEdge(foe, 10)) {
        foe.dir *= -1;
        foe.vx = 0;
      }
      moveEntity(foe, dt, level.platforms, level.movers);
      if (foe.onGround && Math.random() < 0.01) {
        foe.vy = -120;
      }
    } else if (foe.type === "emu") {
      if (foe.x < foe.patrolLeft) foe.dir = 1;
      if (foe.x + foe.w > foe.patrolRight) foe.dir = -1;
      const distToPlayer = distance(foe.x, foe.y, player.x, player.y);
      foe.dir = distToPlayer < 240 ? (player.x > foe.x ? 1 : -1) : foe.dir;
      foe.vx = approach(foe.vx, foe.dir * (distToPlayer < 240 ? foe.speed + 30 : foe.speed), 1100 * dt);
      foe.vy += 2400 * dt;
      if (foe.onGround && wouldWalkOffEdge(foe, 10)) {
        foe.dir *= -1;
        foe.vx = 0;
      }
      moveEntity(foe, dt, level.platforms, level.movers);
      if (foe.onGround && Math.random() < 0.008) {
        foe.vy = -180;
      }
    } else if (foe.type === "snake" || foe.type === "goanna") {
      if (foe.x < foe.patrolLeft) foe.dir = 1;
      if (foe.x + foe.w > foe.patrolRight) foe.dir = -1;
      foe.vx = approach(foe.vx, foe.dir * foe.speed, 650 * dt);
      foe.vy += 2400 * dt;
      if (foe.onGround && wouldWalkOffEdge(foe, 10)) {
        foe.dir *= -1;
        foe.vx = 0;
      }
      moveEntity(foe, dt, level.platforms, level.movers);
      if (foe.onGround && Math.random() < 0.01) {
        foe.dir *= -1;
      }
    } else if (foe.type === "magpie") {
      if (foe.x < foe.patrolLeft) foe.dir = 1;
      if (foe.x + foe.w > foe.patrolRight) foe.dir = -1;
      foe.vx = approach(foe.vx, foe.dir * foe.speed, 1250 * dt);
      foe.vy = Math.sin(state.time * 8 + foe.x * 0.03) * 40;
      moveEntity(foe, dt, [], []);
      if (Math.random() < 0.01) {
        foe.dir *= -1;
      }
    } else {
      if (foe.x < foe.patrolLeft) foe.dir = 1;
      if (foe.x + foe.w > foe.patrolRight) foe.dir = -1;
      foe.vx = approach(foe.vx, foe.dir * foe.speed, 950 * dt);
      foe.vy += 2400 * dt;
      if (foe.onGround && wouldWalkOffEdge(foe, 10)) {
        foe.dir *= -1;
        foe.vx = 0;
      }
      moveEntity(foe, dt, level.platforms, level.movers);
      if (foe.onGround && Math.random() < 0.004) {
        foe.dir *= -1;
      }
    }

    if (foe.y > level.world.height + 100) {
      foe.alive = false;
      continue;
    }

    handleEnemyPlayerInteraction(foe);
  }
}

function updateBosses(dt) {
  const foe = level.boss;
  if (!foe || !foe.alive) return;

  const arenaTrigger = foe.arenaLeft - 120;
  if (!foe.active && player.x + player.w > arenaTrigger) {
    foe.active = true;
    showMessage(foe.introLine, 1.8);
  }
  if (!foe.active) return;

  foe.prevX = foe.x;
  foe.prevY = foe.y;
  foe.invuln = Math.max(0, foe.invuln - dt);
  foe.attackCooldown = Math.max(0, foe.attackCooldown - dt);
  foe.throwCooldown = Math.max(0, foe.throwCooldown - dt);

  const distToPlayer = distance(foe.x, foe.y, player.x, player.y);
  foe.dir = player.x + player.w / 2 >= foe.x + foe.w / 2 ? 1 : -1;

  if (foe.x < foe.patrolLeft) foe.dir = 1;
  if (foe.x + foe.w > foe.patrolRight) foe.dir = -1;

  const chaseSpeed = distToPlayer < 440 ? foe.speed + 28 : foe.speed * 0.78;
  foe.vx = approach(foe.vx, foe.dir * chaseSpeed, 1120 * dt);

  if (foe.onGround && foe.attackCooldown <= 0) {
    if (foe.type === "roo") {
      foe.vy = -Math.min(foe.hopPower, distToPlayer < 160 ? 780 : foe.hopPower);
      foe.vx = foe.dir * (foe.speed + (distToPlayer < 170 ? 90 : 60));
      foe.attackCooldown = distToPlayer < 170 ? 0.72 : 0.96;
    } else {
      foe.vy = -foe.hopPower;
      foe.vx = foe.dir * (foe.speed + 55);
      foe.attackCooldown = foe.type === "cultist" ? 0.92 : 1.1;
    }
  }

  if (foe.type !== "roo" && foe.throwCooldown <= 0 && distToPlayer < 470) {
    spawnBossProjectile(foe);
    foe.throwCooldown = foe.type === "cultist" ? 1.25 : foe.type === "dockcop" ? 1.45 : 1.6;
  }

  foe.vy += 2400 * dt;
  moveEntity(foe, dt, level.platforms, level.movers);

  foe.x = clamp(foe.x, foe.patrolLeft, foe.patrolRight - foe.w);
  if (foe.y > level.world.height + 120) {
    foe.x = foe.startX;
    foe.y = foe.startY;
    foe.vx = 0;
    foe.vy = 0;
  }

  handleBossPlayerInteraction(foe);
}

function spawnBossProjectile(foe) {
    const straightShot = foe.type === "cultist" || foe.type === "sergeant";
    const flatShot = foe.type === "cop" || foe.type === "dockcop";
    if (foe.type === "farmer") {
      for (const offset of [-5, 0, 5]) {
        level.projectiles.push({
          x: foe.x + (foe.dir > 0 ? foe.w - 2 : -10),
          y: foe.y + 22 + offset,
          w: 6,
          h: 6,
          vx: foe.dir * foe.projectileSpeed,
          vy: 0,
          gravity: 0,
          life: 1.05,
          color: foe.projectileColor,
          kind: foe.projectileKind,
        });
      }
      return;
    }
  level.projectiles.push({
    x: foe.x + (foe.dir > 0 ? foe.w - 6 : -10),
    y: foe.y + 12,
    w: straightShot ? 8 : 16,
    h: straightShot ? 4 : 16,
    vx: foe.dir * foe.projectileSpeed,
    vy: straightShot ? 0 : flatShot ? -60 : -180,
    gravity: straightShot ? 0 : 360,
    life: 4,
    color: foe.projectileColor,
    kind: foe.projectileKind,
  });
}

function updateBossProjectiles(dt) {
  for (const shot of level.projectiles) {
    shot.life -= dt;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.vy += shot.gravity * dt;
    if (rectsIntersect(rectLike(player), shot)) {
      shot.life = 0;
      hurtPlayer(16, bossProjectileLine(shot.kind), 190);
    }
  }
  level.projectiles = level.projectiles.filter(
    (shot) =>
      shot.life > 0 &&
      shot.x + shot.w > -40 &&
      shot.x < level.world.width + 40 &&
      shot.y < level.world.height + 120,
  );
}

function handleBossPlayerInteraction(foe) {
  if (!foe.alive || !foe.active) return;
  if (!rectsIntersect(rectLike(player), rectLike(foe))) return;

  if (player.beerTime > 0) {
    player.vy = -680;
    player.vx += foe.dir * -60;
    if (foe.invuln > 0) {
      return;
    }
    foe.health -= 1;
    foe.invuln = 0.45;
    if (foe.health <= 0) {
      foe.alive = false;
      level.projectiles = [];
      showMessage(foe.defeatLine, 2);
      return;
    }
    showMessage(`${foe.label} takes a hit. ${foe.health} to go.`, 1.1);
    return;
  }

  const stompAllowance =
    foe.type === "roo" ? 24 : foe.type === "farmer" ? 38 : 32;
  const stomp = isStompAttack(foe, stompAllowance, -140);
  if (stomp) {
    if (foe.invuln <= 0) {
      foe.health -= 1;
      foe.invuln = 0.95;
    }
    player.vy = -740;
    player.vx += foe.dir * -40;
    if (foe.health <= 0) {
      foe.alive = false;
      level.projectiles = [];
      showMessage(foe.defeatLine, 2);
      return;
    }
    if (foe.invuln <= 0.94) {
      showMessage(`${foe.label} takes a hit. ${foe.health} to go.`, 1.1);
    }
    return;
  }

  hurtPlayer(foe.contactDamage, bossHitLine(foe.type), 240);
}

function handleEnemyPlayerInteraction(foe) {
  if (!foe.alive) return;
  const playerBox = rectLike(player);
  const foeBox = rectLike(foe);
  if (!rectsIntersect(playerBox, foeBox)) return;

  if (player.beerTime > 0) {
    foe.alive = false;
    player.vy = -680;
    player.vx += foe.dir * -50;
    showMessage(enemyStompLine(foe.type), 1.0);
    return;
  }

  const stomp = isStompAttack(foe, 24, 0);
  if (stomp) {
    foe.alive = false;
    player.vy = -620;
    showMessage(enemyStompLine(foe.type), 1.0);
    return;
  }

  const damage = foe.type === "kangaroo" ? 18 : foe.type === "dingo" ? 16 : 14;
  const knock = foe.type === "dingo" ? 220 : foe.type === "snake" ? 120 : 180;
  hurtPlayer(damage, enemyHitLine(foe.type), knock);
}

function isStompAttack(foe, topAllowance = 16, minVerticalSpeed = 0) {
  if (player.vy <= minVerticalSpeed) return false;
  const playerBottom = player.y + player.h;
  const foeTop = foe.y;
  const withinVerticalWindow =
    player.prevY + player.h <= foeTop + topAllowance && playerBottom >= foeTop - 6;
  const withinHorizontalWindow = player.x + player.w > foe.x + 4 && player.x < foe.x + foe.w - 4;
  return withinVerticalWindow && withinHorizontalWindow;
}

function wouldWalkOffEdge(foe, probe = 10) {
  const direction = foe.dir >= 0 ? 1 : -1;
  const footX = direction > 0 ? foe.x + foe.w + probe : foe.x - probe - 1;
  const footY = foe.y + foe.h + 2;
  const supportProbe = { x: footX, y: footY, w: 2, h: 2 };
  for (const collider of [...level.platforms, ...level.movers]) {
    if (collider.oneWay === false && rectsIntersect(supportProbe, collider)) return false;
    if (collider.oneWay !== false && rectsIntersect(supportProbe, collider)) return false;
  }
  return true;
}

function enemyStompLine(type) {
    if (type === "kangaroo") return "Barry wins that roo argument.";
    if (type === "farmdog" || type === "policeDog") return "Barry hops clean over the dog.";
    if (type === "goanna") return "Barry clears the goanna by a whisker.";
    if (type === "emu") return "Barry somehow out-foots the emu.";
    if (type === "trooper") return "Barry knocks the copper flat and keeps moving.";
    if (type === "cropguard") return "Barry flattens the farm lookout before he can squeal.";
    if (type === "cultist") return "Barry stomps the grow-patch grub into the dirt.";
    if (type === "magpie") return "Barry finally wins one against a magpie.";
    if (type === "dingo") return "Barry sends the dingo packing.";
  if (type === "snake") return "Barry steps clean over the snake.";
  return "Barry slips past the bad news.";
}

function enemyHitLine(type) {
    if (type === "kangaroo") return "The roo disagrees with the plan.";
    if (type === "farmdog") return "The farm dog has Barry lined up as lunch.";
    if (type === "policeDog") return "The police dog absolutely means business.";
    if (type === "goanna") return "The goanna latches on like rent is due.";
    if (type === "emu") return "The emu shoulder-checks Barry like it's 1932.";
    if (type === "trooper") return "A copper gets hands on Barry.";
    if (type === "cropguard") return "The crop guard treats Barry like an unwanted harvest.";
    if (type === "cultist") return "The farm hand treats Barry like evidence.";
    if (type === "magpie") return "The magpie goes straight for the scalp.";
    if (type === "dingo") return "The dingo absolutely means it.";
  if (type === "snake") return "The snake was already having a day.";
  return "Barry gets the worst possible welcome.";
}

function bossHitLine(type) {
  if (type === "roo") return "The roo absolutely belts Barry.";
  if (type === "farmer") return "The farmer swings like he's defending the Ashes.";
  if (type === "sergeant") return "The sergeant tackles first and asks questions never.";
  if (type === "cop") return "The cop lands a very official tackle.";
  if (type === "cultist") return "The cult foreman absolutely hates trespassers.";
  if (type === "groom") return "The groom thinks Barry owes him a reception.";
  if (type === "dockcop") return "The harbour cop turns the dock into a crime scene.";
  return "The boss has a strong opinion about Barry.";
}

function bossProjectileLine(kind) {
    if (kind === "shotgun") return "The farmer cuts loose with the shotgun.";
    if (kind === "shot") return "A small bullet zips straight in.";
    if (kind === "baton") return "A baton comes spinning out of the dark.";
  if (kind === "ticket") return "A flying ticket still hurts.";
  if (kind === "torch") return "The cultist's torch lands exactly where it shouldn't.";
  if (kind === "ring") return "The wedding ring comes in hot.";
  if (kind === "buoy") return "The buoy travels better than it has any right to.";
  return "Something nasty comes flying through the air.";
}

function updateHazards() {
  for (const trap of level.hazards) {
    if (trap.pulse) {
      const wave = Math.sin(state.time * trap.pulseSpeed + trap.pulsePhase);
      trap.activeNow = wave > -0.1;
    } else {
      trap.activeNow = true;
    }

    if (!trap.activeNow) continue;
    if (rectsIntersect(rectLike(player), trap)) {
      const line = hazardLine(trap.hazardKind);
      hurtPlayer(trap.damage, line, trap.hazardKind === "fire" ? 120 : 160);
    }
  }
}

function updateCollectibles() {
  for (const item of level.collectibles) {
    if (item.collected) continue;
    if (!rectsIntersect(rectLike(player), item)) continue;
    item.collected = true;
    if (item.kind === "beer") {
      player.beerTime = Math.max(player.beerTime, item.duration);
      showMessage("Beer grabbed. Barry's untouchable.", 1.2);
    } else if (item.kind === "life") {
      const before = state.lives;
      state.lives = clamp(state.lives + item.value, 0, MAX_LIVES);
      if (before === state.lives) {
        showMessage("Barry pockets the boxing roo token, but he's already full on lives.", 1.2);
      } else {
        showMessage(`Extra life. Barry's up to ${state.lives}.`, 1.25);
      }
    } else {
      if (state.snags < MAX_SNAGS) {
        state.snags += item.value;
        state.snags = clamp(state.snags, 0, MAX_SNAGS);
        syncHealthFromSnags();
        showMessage(`Snag picked up. ${state.snags}/${MAX_SNAGS} health snags.`, 1.0);
      } else {
        showMessage("Barry's already full on snags.", 1.0);
      }
    }
  }
}

function hazardLine(kind) {
  if (kind === "fire") return "Barry chooses the wrong heat source.";
  if (kind === "water") return "The crocs reckon Barry looks tender.";
  if (kind === "cactus") return "The cactus pit is not feeling charitable.";
  if (kind === "mud") return "The mud has opinions.";
  return "The ground just got mean.";
}

function updateCheckpointsAndFinish() {
  for (const cp of level.checkpoints) {
    if (!cp.reached && rectsIntersect(rectLike(player), cp)) {
      activateCheckpoint(cp);
    }
  }

  if (level.boss?.alive && rectsIntersect(rectLike(player), level.finishZone)) {
    showMessage(`Barry needs to beat ${level.boss.label} first.`, 0.9);
    return;
  }

  if (rectsIntersect(rectLike(player), level.finishZone)) {
    completeLevel();
  }
}

function updateCamera() {
  const targetX = player.x + player.w / 2 - VIEW.width / 2;
  const targetY = player.y + player.h / 2 - VIEW.height / 2;
  camera.x = clamp(targetX, 0, Math.max(0, level.world.width - VIEW.width));
  camera.y = clamp(targetY, 0, Math.max(0, level.world.height - VIEW.height));
}

function updateHUD() {
  healthFill.style.width = `${state.health}%`;
  troubleLabel.textContent = `Trouble ${"!".repeat(state.levelIndex + 1)}`;
  dashLabel.textContent = "Jump";
  vehicleStatus.textContent = `Checkpoint ${state.checkpointLabel} | Falls ${state.deaths}`;
  statusCount.textContent = `${state.snags}/${MAX_SNAGS}`;
  livesCount.textContent = `${state.lives}`;
  if (player.beerTime > 0) {
    statusPower.textContent = `${Math.ceil(player.beerTime)}s`;
    statusBeer.style.opacity = "1";
  } else if (level.boss?.alive && level.boss.active) {
    statusPower.textContent = `${level.boss.label} ${level.boss.health}/${level.boss.maxHealth}`;
    statusBeer.style.opacity = "0.78";
  } else {
    statusPower.textContent = "";
    statusBeer.style.opacity = "0.45";
  }
  statusPill.style.opacity = "1";
  livesPill.style.opacity = "1";
  promptBox.classList.toggle("visible", Boolean(state.message));
  promptBox.textContent = state.message || buildPromptText();
  promptBox.classList.toggle("visible", Boolean(promptBox.textContent));

  const finishCenterX = level.finishZone.x + level.finishZone.w / 2;
  const finishCenterY = level.finishZone.y + level.finishZone.h / 2;
  const dist = Math.round(distance(player.x + player.w / 2, player.y + player.h / 2, finishCenterX, finishCenterY));
  targetDistance.textContent = `${dist} m`;
  targetArrow.style.opacity = state.mode === "playing" ? "1" : "0";
  const angle = Math.atan2(finishCenterY - (player.y + player.h / 2), finishCenterX - (player.x + player.w / 2));
  arrowGlyph.style.transform = `rotate(${(angle * 180) / Math.PI + 90}deg)`;
}

function buildPromptText() {
  if (!level || state.mode !== "playing") return "";
  if (level.boss?.alive && player.x > level.boss.arenaLeft - 180) {
    return `Stomp ${level.boss.label} from above. The exit stays locked till then.`;
  }
  if ((state.levelIndex === 1 || state.levelIndex === 2) && player.y < level.spawn.y - 120) {
    return "Stay on the high route. Wall-hop the shafts and use the moving trays.";
  }
  if (player.onGround && player.jumpBuffer <= 0 && player.x < level.spawn.x + 120) {
    return "Double jump is Barry's best idea.";
  }
  if (!player.onGround && player.wallGrace > 0) {
    return "Barry can wall-hop here. Jump again off the wall.";
  }
  if (state.snags <= 2) {
    return `Barry's down to ${state.snags} health snags.`;
  }
  for (const cp of level.checkpoints) {
    if (rectsIntersect(rectLike(player), cp)) {
      return `${cp.label} saved the day.`;
    }
  }
  if (player.jumpsUsed > 0 && !player.onGround) {
    return "One more jump, then Barry's on his own.";
  }
  return "Reach the glowing exit.";
}

function updateMiniMap() {
  miniCtx.clearRect(0, 0, miniMap.width, miniMap.height);
  miniCtx.fillStyle = "#1c2218";
  miniCtx.fillRect(0, 0, miniMap.width, miniMap.height);

  for (const platform of [...level.platforms, ...level.movers]) {
    miniCtx.fillStyle = platform.kind === "mover" ? "#9a8458" : "#6f7c59";
    const x = (platform.x / level.world.width) * miniMap.width;
    const y = (platform.y / level.world.height) * miniMap.height;
    const w = (platform.w / level.world.width) * miniMap.width;
    const h = Math.max(2, (platform.h / level.world.height) * miniMap.height);
    miniCtx.fillRect(x, y, w, h);
  }

  for (const trap of level.hazards) {
    miniCtx.fillStyle = trap.hazardKind === "fire" ? "#ef6b46" : trap.hazardKind === "water" ? "#4da3f0" : "#cfc36d";
    miniCtx.fillRect(
      (trap.x / level.world.width) * miniMap.width,
      (trap.y / level.world.height) * miniMap.height,
      Math.max(2, (trap.w / level.world.width) * miniMap.width),
      Math.max(2, (trap.h / level.world.height) * miniMap.height),
    );
  }

  miniCtx.fillStyle = "#66d77d";
  miniCtx.beginPath();
  miniCtx.arc(
    ((player.x + player.w / 2) / level.world.width) * miniMap.width,
    ((player.y + player.h / 2) / level.world.height) * miniMap.height,
    4,
    0,
    Math.PI * 2,
  );
  miniCtx.fill();

  miniCtx.fillStyle = "#f1d05a";
  miniCtx.beginPath();
  miniCtx.arc(
    ((level.finishZone.x + level.finishZone.w / 2) / level.world.width) * miniMap.width,
    ((level.finishZone.y + level.finishZone.h / 2) / level.world.height) * miniMap.height,
    4,
    0,
    Math.PI * 2,
  );
  miniCtx.fill();

  if (level.boss?.alive) {
    miniCtx.fillStyle = "#ff6e55";
    miniCtx.fillRect(
      (level.boss.x / level.world.width) * miniMap.width,
      (level.boss.y / level.world.height) * miniMap.height,
      Math.max(4, (level.boss.w / level.world.width) * miniMap.width),
      Math.max(4, (level.boss.h / level.world.height) * miniMap.height),
    );
  }

  for (const cp of level.checkpoints) {
    miniCtx.fillStyle = cp.reached ? "#7ce6ff" : "#ffb24f";
    miniCtx.beginPath();
    miniCtx.arc((cp.x / level.world.width) * miniMap.width, (cp.y / level.world.height) * miniMap.height, 3, 0, Math.PI * 2);
    miniCtx.fill();
  }
}

function drawFrame() {
  ctx.clearRect(0, 0, VIEW.width, VIEW.height);
  drawSky();
  drawHills();
  drawAtmosphere();
  drawClouds();
  drawBackdropNature();
  drawBehindGroundDecorations();
  drawCheckpoints();
  drawGround();
  drawDecorations();
  drawCollectibles();
  drawHazards();
  drawMovingPlatforms();
  drawFinish();
  drawBossProjectiles();
  drawEnemies();
  drawBoss();
  drawPlayer();
  drawForegroundDust();
}

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  g.addColorStop(0, level.theme.skyTop);
  g.addColorStop(0.66, level.theme.skyBottom);
  g.addColorStop(1, "#f4c58d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  const sunX = VIEW.width * 0.72;
  const sunY = VIEW.height * 0.16;
  ctx.fillStyle = "rgba(255, 229, 163, 0.18)";
  ctx.beginPath();
  ctx.arc(sunX, sunY, 76, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = level.theme.sun;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, VIEW.height * 0.68, VIEW.width, 2);
}

function drawClouds() {
  ctx.save();
  ctx.translate(-camera.x * 0.2, -camera.y * 0.05);
  for (const cloud of level.backdrop.clouds) {
    const drift = Math.sin((state.time + cloud.x) * cloud.speed) * cloud.drift;
    const x = cloud.x + drift;
    const y = cloud.y;
    ctx.fillStyle = "rgba(105, 117, 131, 0.15)";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(x + i * 20 * cloud.scale, y + 8 + (i % 2) * 4, 18 * cloud.scale, 10 * cloud.scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(x + i * 20 * cloud.scale, y + (i % 2) * 4, 18 * cloud.scale, 10 * cloud.scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawHills() {
  ctx.save();
  ctx.translate(-camera.x * 0.25, -camera.y * 0.12);
  for (const hill of level.backdrop.hills) {
    ctx.fillStyle = hill.color === "#66734a" ? level.theme.hillFar : level.theme.hillNear;
    ctx.beginPath();
    ctx.moveTo(hill.x, level.world.height - 150);
    ctx.quadraticCurveTo(hill.x + hill.w * 0.35, hill.y, hill.x + hill.w, level.world.height - 150);
    ctx.lineTo(hill.x + hill.w, level.world.height);
    ctx.lineTo(hill.x, level.world.height);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 242, 199, 0.08)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hill.x + 24, level.world.height - 146);
    ctx.quadraticCurveTo(hill.x + hill.w * 0.35, hill.y + 20, hill.x + hill.w - 18, level.world.height - 146);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAtmosphere() {
  ctx.save();
  const haze = ctx.createLinearGradient(0, VIEW.height * 0.18, 0, VIEW.height);
  haze.addColorStop(0, "rgba(255,255,255,0)");
  haze.addColorStop(0.58, "rgba(255,229,196,0.12)");
  haze.addColorStop(1, "rgba(20,15,11,0.32)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  ctx.globalAlpha = 0.6;
  ctx.translate(-camera.x * 0.18, -camera.y * 0.08);
  for (const mesa of level.backdrop.mesas ?? []) {
    ctx.fillStyle = "rgba(78, 56, 38, 0.34)";
    ctx.beginPath();
    ctx.moveTo(mesa.x, mesa.y + mesa.h);
    ctx.lineTo(mesa.x + mesa.w * 0.14, mesa.y + 24);
    ctx.lineTo(mesa.x + mesa.w * 0.68, mesa.y);
    ctx.lineTo(mesa.x + mesa.w, mesa.y + mesa.h * 0.24);
    ctx.lineTo(mesa.x + mesa.w, mesa.y + mesa.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(238, 204, 158, 0.08)";
    for (let i = 1; i < mesa.layers; i++) {
      const ly = mesa.y + (mesa.h / (mesa.layers + 1)) * i;
      ctx.fillRect(mesa.x + 8, ly, mesa.w - 16, 3);
    }
  }
  ctx.restore();
}

function drawBackdropNature() {
  ctx.save();
  ctx.translate(-camera.x * 0.32, -camera.y * 0.16);

  for (const bird of level.backdrop.birds) {
    const driftX = ((bird.x + state.time * bird.speed) % (level.world.width + 180)) - 90;
    const wing = Math.sin(state.time * 8 + bird.flap) * 4 * bird.scale;
    ctx.strokeStyle = "rgba(35, 32, 28, 0.42)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(driftX - bird.span, bird.y + wing);
    ctx.quadraticCurveTo(driftX - bird.span * 0.35, bird.y - wing, driftX, bird.y + 1);
    ctx.quadraticCurveTo(driftX + bird.span * 0.35, bird.y - wing, driftX + bird.span, bird.y + wing);
    ctx.stroke();
  }

  for (const tree of level.backdrop.gumTrees) {
    const trunkTopX = tree.x + tree.lean * tree.trunkH;
    const trunkTint = tree.style === "dead" ? "#8e8375" : tree.style === "ghost" ? "#d5cec3" : tree.style === "mallee" ? "#b8a88f" : "#c9c3b5";
    const leafTint = tree.style === "dead" ? "#5e5a50" : tree.style === "ghost" ? "#76906a" : tree.style === "mallee" ? "#6d8753" : tree.tint;
    ctx.strokeStyle = trunkTint;
    ctx.lineWidth = tree.trunkW;
    ctx.beginPath();
    ctx.moveTo(tree.x, tree.y + 76);
    ctx.lineTo(trunkTopX, tree.y + 76 - tree.trunkH);
    ctx.stroke();

    ctx.strokeStyle = tree.style === "dead" ? "#b3a492" : "#ddd4c3";
    ctx.lineWidth = Math.max(2, tree.trunkW * 0.18);
    ctx.beginPath();
    ctx.moveTo(tree.x + 2, tree.y + 62);
    ctx.lineTo(trunkTopX + 2, tree.y + 82 - tree.trunkH);
    ctx.stroke();

    if (tree.style === "dead") {
      ctx.strokeStyle = "#8d8475";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(trunkTopX, tree.y + 84 - tree.trunkH);
      ctx.lineTo(trunkTopX - 18, tree.y + 56 - tree.trunkH);
      ctx.moveTo(trunkTopX - 2, tree.y + 92 - tree.trunkH);
      ctx.lineTo(trunkTopX + 20, tree.y + 64 - tree.trunkH);
      ctx.stroke();
    } else {
      ctx.fillStyle = leafTint;
      const puffs = tree.style === "mallee" ? 6 : 4;
      for (let i = 0; i < puffs; i++) {
        const puffX = trunkTopX + (i % 2 === 0 ? -tree.crown * 0.45 : tree.crown * 0.38) + (i > 3 ? (i - 4) * 8 : 0);
        const puffY = tree.y - tree.trunkH + 38 + (i > 1 ? 12 : 0) + (i > 3 ? 8 : 0);
        ctx.beginPath();
        ctx.arc(puffX, puffY, tree.crown * (0.72 - (i % 4) * 0.06), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(240, 250, 223, 0.09)";
      ctx.fillRect(trunkTopX - tree.crown * 0.35, tree.y - tree.trunkH + 28, tree.crown * 0.7, 3);
    }
  }

  for (const koala of level.backdrop.koalas) {
    const tree = level.backdrop.gumTrees[koala.treeIndex];
    if (!tree) continue;
    const trunkTopX = tree.x + tree.lean * tree.trunkH;
    const koalaX = trunkTopX + koala.side * 10;
    const koalaY = tree.y + 76 - tree.trunkH + koala.offsetY;
    ctx.fillStyle = "#8f959a";
    ctx.beginPath();
    ctx.arc(koalaX, koalaY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b5bcc2";
    ctx.beginPath();
    ctx.arc(koalaX + koala.side * 2, koalaY - 8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#767d82";
    ctx.beginPath();
    ctx.arc(koalaX - 4, koalaY - 12, 2.5, 0, Math.PI * 2);
    ctx.arc(koalaX + 4, koalaY - 12, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const shrub of level.backdrop.shrubs) {
    ctx.fillStyle = shrub.tint;
    ctx.beginPath();
    ctx.arc(shrub.x, shrub.y, shrub.r, 0, Math.PI * 2);
    ctx.arc(shrub.x - shrub.r * 0.7, shrub.y + 2, shrub.r * 0.72, 0, Math.PI * 2);
    ctx.arc(shrub.x + shrub.r * 0.7, shrub.y + 1, shrub.r * 0.66, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawGround() {
  for (const platform of level.platforms) {
    if (!isVisible(platform)) continue;
    const x = platform.x - camera.x;
    const y = platform.y - camera.y;
    if (platform.kind === "ledge") {
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(x + 4, y + 6, platform.w, platform.h);
      ctx.fillStyle = level.theme.groundTop;
      ctx.fillRect(x, y, platform.w, platform.h);
      ctx.fillStyle = "rgba(48, 35, 23, 0.65)";
      ctx.fillRect(x, y, platform.w, 2);
      ctx.fillStyle = "#e8d4a2";
      ctx.fillRect(x + 6, y + 3, platform.w - 12, 3);
      ctx.fillStyle = "rgba(82, 59, 35, 0.26)";
      ctx.fillRect(x + 8, y + 8, platform.w - 16, 5);
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(x + 6, y + 10, platform.w, platform.h);
      ctx.fillStyle = level.theme.ground;
      ctx.fillRect(x, y, platform.w, platform.h);
      ctx.fillStyle = level.theme.groundTop;
      ctx.fillRect(x, y, platform.w, 14);
      ctx.fillStyle = "rgba(44, 29, 19, 0.72)";
      ctx.fillRect(x, y, platform.w, 2);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(x + 12, y + 18, platform.w - 24, 4);
      ctx.fillStyle = "rgba(255, 243, 214, 0.09)";
      for (let i = 0; i < platform.w; i += 26) {
        ctx.fillRect(x + i + 6, y + 32, 10, 3);
      }
      ctx.strokeStyle = "rgba(54, 36, 22, 0.34)";
      ctx.lineWidth = 2;
      for (let i = 18; i < platform.w - 10; i += 34) {
        ctx.beginPath();
        ctx.moveTo(x + i, y + 18);
        ctx.lineTo(x + i - 6, y + platform.h - 6);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(22, 14, 9, 0.16)";
      for (let i = 0; i < platform.w; i += 42) {
        ctx.beginPath();
        ctx.moveTo(x + i + 6, y + platform.h - 10);
        ctx.lineTo(x + i + 18, y + 34);
        ctx.lineTo(x + i + 30, y + platform.h - 10);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

function drawBehindGroundDecorations() {
  if (!level.decor) return;
  for (const item of level.decor) {
    if (item.kind === "cultPlant") {
      drawCultPlant(item);
    }
  }
}

function drawDecorations() {
  if (!level.decor) return;
  for (const item of level.decor) {
    if (item.kind === "cultPlant") {
      continue;
    } else if (item.kind === "wreck") {
      drawWreck(item);
    } else if (item.kind === "sign") {
      drawRoadSign(item);
    } else if (item.kind === "esky") {
      drawEsky(item);
    } else if (item.kind === "campfire") {
      drawCampfire(item);
    } else if (item.kind === "totem") {
      drawTotem(item);
    } else if (item.kind === "swag") {
      drawSwag(item);
    } else if (item.kind === "crate") {
      drawFarmCrate(item);
    } else if (item.kind === "searchlight") {
      drawSearchlight(item);
    } else if (item.kind === "siren") {
      drawSiren(item);
    }
  }
}

function drawCultPlant(item) {
  const w = 28 * item.scale;
  const h = 52 * item.scale;
  const x = item.x - camera.x;
  const baseY = item.y - camera.y;
  const y = baseY - h;
  if (x + w < -30 || x > VIEW.width + 30) return;

  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(x - 5, baseY - 4, w + 10, 7);
  ctx.fillStyle = "#5d3f28";
  ctx.fillRect(x + w * 0.48, y + h * 0.18, 4, h * 0.78);

  const drawLeaf = (cx, cy, scale = 1, tint = "#3f7f33") => {
    ctx.save();
    ctx.translate(x + cx, y + cy);
    ctx.scale(scale, scale);
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(4, -10);
    ctx.lineTo(10, -14);
    ctx.lineTo(8, -6);
    ctx.lineTo(15, -3);
    ctx.lineTo(7, 0);
    ctx.lineTo(10, 8);
    ctx.lineTo(3, 4);
    ctx.lineTo(0, 15);
    ctx.lineTo(-3, 4);
    ctx.lineTo(-10, 8);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-15, -3);
    ctx.lineTo(-8, -6);
    ctx.lineTo(-10, -14);
    ctx.lineTo(-4, -10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#98ea72";
    ctx.fillRect(-1, -14, 2, 24);
    ctx.restore();
  };

  drawLeaf(w * 0.5, h * 0.73, 0.72 * item.scale);
  drawLeaf(w * 0.5, h * 0.5, 0.88 * item.scale, "#428436");
  drawLeaf(w * 0.5, h * 0.27, 0.78 * item.scale, "#4a9440");

  ctx.fillStyle = "#6db24e";
  ctx.beginPath();
  ctx.arc(x + w * 0.5, y + h * 0.08, w * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b4ff8d";
  ctx.fillRect(x + w * 0.45, y + h * 0.05, 2, 2);
  ctx.fillRect(x + w * 0.54, y + h * 0.09, 2, 2);
  ctx.fillStyle = "rgba(135,255,118,0.16)";
  ctx.fillRect(x - 3, y - 3, w + 6, h - 8);
}

function drawWreck(item) {
  const w = 72 * item.scale;
  const h = 28 * item.scale;
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  ctx.fillStyle = "#d9d6cf";
  ctx.beginPath();
  ctx.moveTo(x + 6, y - h + 5);
  ctx.lineTo(x + w * 0.55, y - h + 2);
  ctx.lineTo(x + w - 4, y - h + 10);
  ctx.lineTo(x + w - 10, y - 8);
  ctx.lineTo(x + 12, y - 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#a7a199";
  ctx.fillRect(x + 10, y - h + 10, 20, 7);
  ctx.fillRect(x + 34, y - h + 8, 12, 9);
  ctx.fillStyle = "#7a746d";
  ctx.fillRect(x + 44, y - h + 12, 14, 5);
  ctx.fillStyle = "#5b2016";
  ctx.fillRect(x + w - 16, y - h + 10, 8, 7);
  ctx.fillStyle = "#2b2621";
  ctx.beginPath();
  ctx.arc(x + 18, y - 4, 8, 0, Math.PI * 2);
  ctx.arc(x + w - 18, y - 4, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(x + 6, y - h + 5, 26, 2);
}

function drawRoadSign(item) {
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  ctx.fillStyle = "#5c432e";
  ctx.fillRect(x + 10, y - 30, 4, 30);
  ctx.fillStyle = "#e7c15d";
  ctx.fillRect(x, y - 46, 26, 18);
  ctx.fillStyle = "#6a4620";
  ctx.fillRect(x + 4, y - 40, 18, 2);
}

function drawEsky(item) {
  const w = 24 * item.scale;
  const h = 16 * item.scale;
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  ctx.fillStyle = "#3b76c8";
  ctx.fillRect(x, y - h, w, h);
  ctx.fillStyle = "#f2f6fb";
  ctx.fillRect(x + 2, y - h - 3, w - 4, 4);
}

function drawCampfire(item) {
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  ctx.fillStyle = "#5c3f24";
  ctx.fillRect(x + 2, y - 4, 16, 3);
  ctx.fillRect(x + 4, y - 8, 3, 10);
  ctx.fillRect(x + 12, y - 8, 3, 10);
  ctx.fillStyle = "#ffb554";
  ctx.fillRect(x + 6, y - 14, 6, 8);
  ctx.fillStyle = "#ffe5a2";
  ctx.fillRect(x + 8, y - 12, 2, 4);
}

function drawTotem(item) {
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  const h = 34 * item.scale;
  ctx.fillStyle = "#6d4b2d";
  ctx.fillRect(x + 6, y - h, 8, h);
  ctx.fillStyle = "#e1ba4f";
  ctx.beginPath();
  ctx.arc(x + 10, y - h - 6, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#175ba8";
  ctx.fillRect(x + 6, y - h - 8, 8, 6);
}

function drawSwag(item) {
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  ctx.fillStyle = "#4d6f53";
  ctx.fillRect(x, y - 10, 24, 10);
  ctx.fillStyle = "#2c3e2f";
  ctx.fillRect(x + 2, y - 8, 20, 2);
}

function drawFarmCrate(item) {
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  ctx.fillStyle = "#8a633d";
  ctx.fillRect(x, y - 16, 18, 16);
  ctx.fillStyle = "#c79b5c";
  ctx.fillRect(x + 2, y - 13, 14, 2);
  ctx.fillRect(x + 2, y - 8, 14, 2);
}

function drawSearchlight(item) {
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  ctx.fillStyle = "#404851";
  ctx.fillRect(x + 6, y - 18, 10, 18);
  ctx.fillStyle = "rgba(170, 223, 255, 0.16)";
  ctx.beginPath();
  ctx.moveTo(x + 11, y - 18);
  ctx.lineTo(x - 26, y - 78);
  ctx.lineTo(x + 48, y - 78);
  ctx.closePath();
  ctx.fill();
}

function drawSiren(item) {
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  ctx.fillStyle = "#3c444d";
  ctx.fillRect(x + 4, y - 16, 12, 16);
  ctx.fillStyle = Math.floor(state.time * 6) % 2 === 0 ? "#ef5c4b" : "#6fc7ff";
  ctx.fillRect(x + 5, y - 14, 10, 7);
}

function drawMovingPlatforms() {
  for (const platform of level.movers) {
    if (!isVisible(platform)) continue;
    const x = platform.x - camera.x;
    const y = platform.y - camera.y;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(x + 4, y + 6, platform.w, platform.h);
    ctx.fillStyle = platform.style === "boat" ? "#4f6f7b" : platform.style === "truck" ? "#6c4f3b" : platform.style === "ute" ? "#617864" : "#7a6a56";
    ctx.fillRect(x, y, platform.w, platform.h);
    ctx.fillStyle = "rgba(30, 24, 18, 0.55)";
    ctx.fillRect(x, y, platform.w, 2);
    ctx.fillStyle = "#e9ddb0";
    ctx.fillRect(x + 4, y + 3, platform.w - 8, 3);
    drawMoverDetail(platform, x, y);
  }
}

function drawMoverDetail(platform, x, y) {
  if (platform.style === "boat") {
    ctx.fillStyle = "#f4f1df";
    ctx.fillRect(x + 8, y - 12, platform.w - 16, 12);
    ctx.fillStyle = "#e0a85b";
    ctx.fillRect(x + platform.w * 0.42, y - 20, 18, 8);
  } else if (platform.style === "car" || platform.style === "truck" || platform.style === "ute") {
    ctx.fillStyle = "#2f3534";
    ctx.fillRect(x + 10, y - 8, platform.w - 20, 8);
    ctx.fillStyle = "#d4b56f";
    ctx.fillRect(x + 12, y - 6, 18, 4);
  } else if (platform.style === "barge") {
    ctx.fillStyle = "#dbc488";
    ctx.fillRect(x + 6, y - 8, platform.w - 12, 8);
  }
}

function drawHazards() {
  for (const trap of level.hazards) {
    if (!isVisible(trap)) continue;
    const x = trap.x - camera.x;
    const y = trap.y - camera.y;
    if (trap.hazardKind === "water") {
      const waterInset = Math.max(10, Math.min(24, trap.h * 0.18));
      const waterY = y + waterInset;
      const waterH = trap.h - waterInset;
      const waterTop = ctx.createLinearGradient(0, waterY, 0, waterY + waterH);
      waterTop.addColorStop(0, "rgba(52, 124, 183, 0.96)");
      waterTop.addColorStop(0.5, "rgba(26, 92, 145, 0.98)");
      waterTop.addColorStop(1, "rgba(12, 48, 79, 0.98)");
      ctx.fillStyle = waterTop;
      ctx.fillRect(x, waterY, trap.w, waterH);
      ctx.fillStyle = "rgba(104, 197, 255, 0.28)";
      for (let band = 0; band < 4; band++) {
        const bandY = waterY + 4 + band * Math.max(8, waterH / 5);
        ctx.fillRect(x, bandY, trap.w, 3);
      }
      ctx.fillStyle = "rgba(225, 247, 255, 0.16)";
      ctx.fillRect(x, waterY + 6, trap.w, 4);
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      for (let ripple = 0; ripple < Math.max(2, Math.floor(trap.w / 90)); ripple++) {
        const rx = x + 10 + ripple * 46 + Math.sin(state.time * 3 + ripple) * 8;
        ctx.beginPath();
        ctx.ellipse(rx, waterY + waterH * 0.32, 22, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const crocCount = Math.max(1, Math.floor(trap.w / 74));
      for (let i = 0; i < crocCount; i++) {
        const offset = trap.w * 0.18 + i * (trap.w / crocCount);
        const crocY = waterY + waterH - 26 - (i % 2) * 5;
        const crocDir = i % 2 === 0 ? 1 : -1;
        ctx.save();
        ctx.translate(x + offset, crocY);
        ctx.scale(crocDir, 1);
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.ellipse(18, 18, 26, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#163c24";
        ctx.fillRect(0, 12, 10, 6);
        ctx.fillRect(10, 10, 14, 8);
        ctx.fillRect(24, 8, 14, 9);
        ctx.fillRect(38, 8, 10, 8);
        ctx.fillRect(48, 9, 10, 6);
        ctx.fillRect(58, 10, 12, 4);
        ctx.fillRect(70, 10, 12, 3);
        ctx.fillStyle = "#4d8e46";
        ctx.fillRect(2, 11, 8, 5);
        ctx.fillRect(10, 9, 14, 7);
        ctx.fillRect(24, 7, 14, 8);
        ctx.fillRect(38, 7, 10, 7);
        ctx.fillRect(48, 8, 10, 5);
        ctx.fillRect(58, 9, 12, 3);
        ctx.fillRect(70, 9, 11, 2);
        ctx.fillRect(12, 5, 8, 3);
        ctx.fillRect(24, 4, 5, 3);
        ctx.fillRect(31, 5, 4, 2);
        ctx.fillRect(43, 5, 3, 2);
        ctx.fillStyle = "#79ca4b";
        ctx.fillRect(26, 9, 9, 2);
        ctx.fillRect(40, 8, 5, 2);
        ctx.fillRect(60, 9, 7, 1);
        ctx.fillStyle = "#2f5f34";
        ctx.fillRect(16, 15, 6, 4);
        ctx.fillRect(28, 15, 6, 4);
        ctx.fillRect(8, 16, 4, 3);
        ctx.fillStyle = "#f1efdc";
        ctx.fillRect(71, 8, 2, 2);
        ctx.fillStyle = "#1a1612";
        ctx.fillRect(72, 8, 1, 1);
        ctx.fillStyle = "#f5f1df";
        ctx.fillRect(74, 12, 5, 1);
        ctx.fillRect(75, 13, 4, 1);
        ctx.fillRect(76, 14, 3, 1);
        ctx.restore();
      }
      continue;
    }

    if (trap.hazardKind === "fire") {
      const pulse = trap.activeNow ? 1 : 0.35;
      const flicker = 8 + Math.sin(state.time * 18 + x) * 5;
      ctx.fillStyle = `rgba(255, ${120 + pulse * 50}, ${35 + pulse * 40}, 0.92)`;
      ctx.fillRect(x + 2, y + 12, trap.w - 4, trap.h - 12);
      ctx.beginPath();
      ctx.moveTo(x + trap.w * 0.1, y + 12);
      ctx.lineTo(x + trap.w * 0.28, y + 2 - flicker);
      ctx.lineTo(x + trap.w * 0.48, y + 16 - flicker * 0.45);
      ctx.lineTo(x + trap.w * 0.68, y + 3 - flicker);
      ctx.lineTo(x + trap.w * 0.9, y + 14);
      ctx.closePath();
      ctx.fill();
      continue;
    }

    if (trap.hazardKind === "mud") {
      ctx.fillStyle = "rgba(69, 49, 32, 0.92)";
      ctx.fillRect(x, y + 10, trap.w, trap.h - 10);
      ctx.fillStyle = "rgba(105, 82, 53, 0.75)";
      ctx.fillRect(x + 10, y + 6, trap.w - 20, 4);
      continue;
    }

    if (trap.hazardKind === "cactus") {
      const floorHeight = Math.min(20, Math.max(12, trap.h * 0.28));
      ctx.fillStyle = "#6c5036";
      ctx.fillRect(x, y + trap.h - floorHeight, trap.w, floorHeight);
      const cactusCount = Math.max(2, Math.floor(trap.w / 36));
      for (let i = 0; i < cactusCount; i++) {
        const px = x + 8 + i * (trap.w / cactusCount);
        const stemH = Math.max(28, trap.h * (0.58 + (i % 2) * 0.12));
        const stemW = 12;
        const armW = 7;
        const armH = Math.max(10, stemH * 0.24);
        const stemTop = y + trap.h - stemH;
        ctx.fillStyle = i % 2 === 0 ? "#4e8d3f" : "#5a9b49";
        ctx.fillRect(px, stemTop, stemW, stemH);
        ctx.fillRect(px - armW, stemTop + stemH * 0.4, armW, armH);
        ctx.fillRect(px + stemW, stemTop + stemH * 0.5, armW, armH);
        ctx.fillStyle = "#2f6f31";
        ctx.fillRect(px + 4, stemTop, 2, stemH);
        ctx.fillStyle = "#d8e29a";
        ctx.fillRect(px + 3, stemTop + 8, 1, Math.max(6, stemH - 16));
        ctx.fillRect(px + 8, stemTop + 10, 1, Math.max(6, stemH - 20));
        ctx.fillStyle = "#b9d06d";
        ctx.fillRect(px + 5, stemTop + stemH * 0.55, 2, 7);
      }
      continue;
    }

    ctx.fillStyle = "#55412d";
    ctx.fillRect(x, y + 8, trap.w, trap.h - 8);
    ctx.fillStyle = "#d5c36b";
    for (let i = 0; i < 5; i++) {
      const px = x + (i / 4) * trap.w;
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px + 10, y + 16);
      ctx.lineTo(px - 10, y + 16);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawCheckpoints() {
  for (const cp of level.checkpoints) {
    if (!isVisible(cp)) continue;
    const x = cp.x - camera.x;
    const y = cp.y - camera.y;
    ctx.fillStyle = cp.reached ? "#7ce6ff" : "#f1bb52";
    ctx.fillRect(x + 11, y - 22, 6, 46);
    ctx.fillStyle = cp.reached ? "#7ce6ff" : "#f3d77b";
    ctx.beginPath();
    ctx.moveTo(x + 17, y - 18);
    ctx.lineTo(x + 40, y - 10);
    ctx.lineTo(x + 17, y - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(x + 9, y + 18, 10, 6);
  }
}

function drawFinish() {
  const zone = level.finishZone;
  if (!isVisible(zone)) return;
  const x = zone.x - camera.x;
  const y = zone.y - camera.y;

  ctx.save();
  const locked = Boolean(level.boss?.alive);
  ctx.globalAlpha = locked ? 0.14 : 0.25;
  ctx.fillStyle = locked ? "#b64b39" : level.theme.accent;
  ctx.fillRect(x, y, zone.w, zone.h);
  ctx.globalAlpha = 1;

  if (zone.finishKind === "ute") {
    drawFinishVehicle(x, y, zone.w, zone.h);
  } else if (zone.finishKind === "boat") {
    drawFinishBoat(x, y, zone.w, zone.h);
  } else if (zone.finishKind === "exit") {
    drawFinishPortal(x, y, zone.w, zone.h);
  } else if (zone.finishKind === "portal") {
    drawFinishPortal(x, y, zone.w, zone.h);
  } else {
    drawFinishFlag(x, y, zone.w, zone.h);
  }

  if (locked) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x + 10, y + zone.h * 0.42, zone.w - 20, 18);
    ctx.fillStyle = "#ffd8b5";
    ctx.fillRect(x + 14, y + zone.h * 0.42 + 6, zone.w - 28, 6);
  }

  ctx.restore();
}

function drawFinishFlag(x, y, w, h) {
  ctx.fillStyle = "#f2d663";
  ctx.fillRect(x + 10, y - 36, 5, h + 36);
  ctx.fillStyle = "#ffcf64";
  ctx.beginPath();
  ctx.moveTo(x + 15, y - 30);
  ctx.lineTo(x + w - 2, y - 18);
  ctx.lineTo(x + 15, y - 6);
  ctx.closePath();
  ctx.fill();
}

function drawFinishGate(x, y, w, h) {
  ctx.fillStyle = "#2c241d";
  ctx.fillRect(x + 6, y - 24, 8, h + 24);
  ctx.fillRect(x + w - 14, y - 24, 8, h + 24);
  ctx.fillStyle = "#7ef0ff";
  ctx.fillRect(x + 12, y - 24, w - 24, 8);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillRect(x + 18, y + h - 14, w - 36, 8);
}

function drawFinishPortal(x, y, w, h) {
  const cx = x + w / 2;
  const top = y - 20;
  ctx.save();
  ctx.fillStyle = "rgba(255, 223, 135, 0.12)";
  ctx.beginPath();
  ctx.ellipse(cx, y + h * 0.38, w * 0.46, h * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
  const ring = ctx.createLinearGradient(cx - w * 0.34, top, cx + w * 0.34, y + h);
  ring.addColorStop(0, "#f7d87e");
  ring.addColorStop(0.5, "#8be7ff");
  ring.addColorStop(1, "#f7d87e");
  ctx.strokeStyle = ring;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(x + 14, top, w - 28, h + 28, 18);
  ctx.stroke();
  ctx.fillStyle = "rgba(10, 10, 14, 0.72)";
  ctx.beginPath();
  ctx.roundRect(x + 20, top + 6, w - 40, h + 16, 14);
  ctx.fill();
  const pulse = 0.6 + Math.sin(state.time * 6) * 0.18;
  const glow = ctx.createRadialGradient(cx, y + h * 0.5, 6, cx, y + h * 0.5, w * 0.42);
  glow.addColorStop(0, `rgba(130, 235, 255, ${0.65 * pulse})`);
  glow.addColorStop(0.5, `rgba(66, 180, 255, ${0.35 * pulse})`);
  glow.addColorStop(1, "rgba(66, 180, 255, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(cx, y + h * 0.5, w * 0.34, h * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d6f7ff";
  ctx.fillRect(x + 24, y + 20, w - 48, 6);
  ctx.fillRect(x + 24, y + h - 8, w - 48, 6);
  ctx.fillStyle = "#ffcf63";
  ctx.fillRect(cx - 5, y + 8, 10, h - 8);
  ctx.fillStyle = "#f8f7ee";
  ctx.fillRect(cx - 10, y + 12, 20, 8);
  ctx.restore();
}

function drawFinishVehicle(x, y, w, h) {
  ctx.fillStyle = "#d7d5ce";
  ctx.beginPath();
  ctx.moveTo(x + 12, y + h - 34);
  ctx.lineTo(x + w * 0.38, y + h - 60);
  ctx.lineTo(x + w * 0.7, y + h - 60);
  ctx.lineTo(x + w - 12, y + h - 42);
  ctx.lineTo(x + w - 6, y + h - 20);
  ctx.lineTo(x + 8, y + h - 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f3f8fb";
  ctx.fillRect(x + w * 0.4, y + h - 55, w * 0.22, 15);
  ctx.fillStyle = "#9fb9c6";
  ctx.fillRect(x + w * 0.41, y + h - 53, w * 0.2, 11);
  ctx.fillStyle = "#4a4034";
  ctx.fillRect(x + 10, y + h - 22, w - 20, 4);
  ctx.fillStyle = "#8b847b";
  ctx.fillRect(x + 14, y + h - 19, w - 28, 6);
  ctx.fillStyle = "#e5cf87";
  ctx.fillRect(x + w - 20, y + h - 36, 8, 5);
  ctx.fillStyle = "#3a3632";
  ctx.beginPath();
  ctx.arc(x + 24, y + h - 12, 9, 0, Math.PI * 2);
  ctx.arc(x + w - 24, y + h - 12, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#141312";
  ctx.beginPath();
  ctx.arc(x + 24, y + h - 12, 4, 0, Math.PI * 2);
  ctx.arc(x + w - 24, y + h - 12, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(x + 20, y + h - 48, w * 0.26, 3);
}

function drawFinishBoat(x, y, w, h) {
  ctx.fillStyle = "#39434a";
  ctx.beginPath();
  ctx.moveTo(x + 4, y + h - 18);
  ctx.lineTo(x + w - 6, y + h - 18);
  ctx.lineTo(x + w - 18, y + h - 4);
  ctx.lineTo(x + 18, y + h - 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#d9d1bb";
  ctx.fillRect(x + 18, y + 20, w - 34, 14);
  ctx.fillStyle = "#82d9e7";
  ctx.fillRect(x + w * 0.44, y + 10, 18, 10);
}

function drawEnemies() {
    for (const foe of level.enemies) {
      if (!foe.alive) continue;
      if (!isVisible(foe)) continue;
      if (foe.type === "kangaroo") {
        drawKangaroo(foe);
      } else if (foe.type === "dingo" || foe.type === "farmdog" || foe.type === "policeDog") {
        drawDingo(foe);
      } else if (foe.type === "snake" || foe.type === "goanna") {
        drawSnake(foe);
      } else if (foe.type === "trooper" || foe.type === "cultist" || foe.type === "cropguard") {
        drawTrooper(foe);
      } else if (foe.type === "emu") {
        drawEmu(foe);
      } else if (foe.type === "magpie") {
        drawMagpie(foe);
      } else {
        drawKangaroo(foe);
      }
  }
}

function drawBossProjectiles() {
  for (const shot of level.projectiles) {
    if (!isVisible(shot)) continue;
    const x = shot.x - camera.x;
    const y = shot.y - camera.y;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(x + 2, y + 3, shot.w, shot.h);
  ctx.fillStyle = shot.color;
  if (shot.kind === "shot") {
    ctx.fillRect(x + 1, y + 5, 6, 2);
    ctx.fillStyle = "#fff8d5";
    ctx.fillRect(x + 6, y + 4, 2, 3);
  } else if (shot.kind === "shotgun") {
    ctx.beginPath();
    ctx.arc(x + 5, y + 5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff8d5";
    ctx.fillRect(x + 2, y + 2, 2, 2);
  } else if (shot.kind === "baton") {
      ctx.fillRect(x + 4, y + 2, 5, 12);
      ctx.fillStyle = "#444d58";
      ctx.fillRect(x + 9, y + 5, 3, 6);
    } else if (shot.kind === "dirt") {
      ctx.beginPath();
      ctx.arc(x + 8, y + 8, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (shot.kind === "ring") {
      ctx.fillRect(x + 2, y + 2, 12, 12);
      ctx.fillStyle = "#f6efcf";
      ctx.fillRect(x + 5, y + 5, 6, 6);
    } else if (shot.kind === "torch") {
      ctx.fillRect(x + 5, y + 4, 6, 10);
      ctx.fillStyle = "#ffe28a";
      ctx.fillRect(x + 4, y, 8, 6);
    } else if (shot.kind === "buoy") {
      ctx.fillRect(x + 3, y + 2, 10, 12);
      ctx.fillStyle = "#fff1d2";
      ctx.fillRect(x + 5, y + 6, 6, 2);
    } else {
      ctx.fillRect(x + 2, y + 3, 12, 10);
      ctx.fillStyle = "#5d4a2f";
      ctx.fillRect(x + 4, y + 5, 8, 2);
    }
  }
}

function drawBoss() {
  const foe = level.boss;
  if (!foe || !foe.alive || !isVisible(foe)) return;
  const x = foe.x - camera.x;
  const y = foe.y - camera.y;
  const bob = foe.onGround ? Math.sin(state.time * 8) * 1.4 : 0;

  ctx.save();
  if (foe.invuln > 0 && Math.floor(state.time * 16) % 2 === 0) {
    ctx.globalAlpha = 0.55;
  }
  ctx.translate(x + foe.w / 2, y + foe.h / 2);
  ctx.scale(foe.dir, 1);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(0, foe.h / 2 + 4, 17, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = foe.color;
  ctx.fillRect(-12, -8 + bob, 24, 24);
  ctx.fillStyle = foe.accent;
  ctx.fillRect(-9, -24 + bob, 18, 14);
  ctx.fillStyle = "#bb8d62";
  ctx.fillRect(-6, -21 + bob, 12, 10);
  ctx.fillStyle = "#1d1711";
  ctx.fillRect(-6, -20 + bob, 2, 2);
  ctx.fillRect(4, -20 + bob, 2, 2);
  ctx.fillStyle = "#2b241f";
  ctx.fillRect(-13, 16 + bob, 7, 12);
  ctx.fillRect(6, 16 + bob, 7, 12);

  if (foe.type === "cop" || foe.type === "dockcop" || foe.type === "sergeant") {
    ctx.fillStyle = foe.type === "dockcop" ? "#f08b49" : "#274365";
    ctx.fillRect(-12, -8 + bob, 24, 13);
    ctx.fillStyle = "#20344d";
    ctx.fillRect(-9, -28 + bob, 18, 6);
    ctx.fillStyle = "#9cc0f4";
    ctx.fillRect(-5, -6 + bob, 10, 10);
    if (foe.type === "sergeant") {
      ctx.fillStyle = "#ef5c4b";
      ctx.fillRect(9, -3 + bob, 7, 3);
    }
    } else if (foe.type === "cultist") {
      ctx.fillStyle = "#5d311f";
      ctx.fillRect(-13, -6 + bob, 26, 18);
      ctx.fillStyle = "#ff9a53";
      ctx.fillRect(10, -4 + bob, 4, 10);
    } else if (foe.type === "cropguard") {
      ctx.fillStyle = "#554030";
      ctx.fillRect(-12, -8 + bob, 24, 18);
      ctx.fillStyle = "#7fd85f";
      ctx.fillRect(-6, -6 + bob, 12, 4);
      ctx.fillStyle = "#3a2b1c";
      ctx.fillRect(9, -6 + bob, 8, 3);
    } else if (foe.type === "farmer") {
      ctx.fillStyle = "#7a5030";
      ctx.fillRect(-12, -8 + bob, 24, 18);
      ctx.fillStyle = "#d1b489";
      ctx.fillRect(-6, -24 + bob, 12, 4);
      ctx.fillStyle = "#5a422e";
      ctx.fillRect(-2, -4 + bob, 8, 5);
      ctx.fillStyle = "#2d2f31";
      ctx.fillRect(4, -5 + bob, 18, 3);
      ctx.fillRect(18, -6 + bob, 5, 2);
      ctx.fillStyle = "#8b6a45";
      ctx.fillRect(-7, -1 + bob, 7, 4);
      ctx.fillRect(-4, 2 + bob, 3, 7);
      ctx.fillStyle = "#cab28a";
      ctx.fillRect(19, -4 + bob, 2, 1);
  } else if (foe.type === "roo") {
      ctx.fillStyle = "#9c6539";
      ctx.beginPath();
      ctx.ellipse(-1, 1 + bob, 12, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#b67d45";
      ctx.fillRect(-6, -24 + bob, 12, 16);
      ctx.fillStyle = "#f4ddb8";
      ctx.fillRect(-4, -19 + bob, 8, 8);
      ctx.fillRect(-3, 3 + bob, 6, 8);
      ctx.fillStyle = "#8a5c35";
      ctx.beginPath();
      ctx.moveTo(-7, -24 + bob);
      ctx.lineTo(-12, -39 + bob);
      ctx.lineTo(-8, -40 + bob);
      ctx.lineTo(-3, -26 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(7, -24 + bob);
      ctx.lineTo(12, -39 + bob);
      ctx.lineTo(8, -40 + bob);
      ctx.lineTo(3, -26 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#cf3a33";
      ctx.beginPath();
      ctx.arc(-14, -2 + bob, 6, 0, Math.PI * 2);
      ctx.arc(14, -1 + bob, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f4f0e6";
      ctx.fillRect(-18, -4 + bob, 3, 2);
      ctx.fillRect(11, -3 + bob, 3, 2);
      ctx.fillStyle = "#7d4f32";
      ctx.fillRect(8, 6 + bob, 17, 4);
      ctx.fillRect(-10, 14 + bob, 5, 14);
      ctx.fillRect(4, 14 + bob, 5, 14);
      ctx.fillStyle = "#1d1711";
      ctx.fillRect(-3, -18 + bob, 2, 2);
      ctx.fillRect(2, -18 + bob, 2, 2);
    } else if (foe.type === "groom") {
    ctx.fillStyle = "#2f313a";
    ctx.fillRect(-12, -8 + bob, 24, 18);
    ctx.fillStyle = "#f3e5bf";
    ctx.fillRect(-2, -8 + bob, 4, 18);
    ctx.fillStyle = "#8b5f39";
    ctx.fillRect(10, -4 + bob, 8, 4);
  }
  ctx.restore();

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x - 8, y - 18, 90, 10);
  ctx.fillStyle = "#ffdf8c";
  ctx.fillRect(x - 6, y - 16, 86 * (foe.health / foe.maxHealth), 6);
  ctx.fillStyle = "#f7f1dc";
  ctx.font = "900 11px Trebuchet MS";
  ctx.fillText(foe.label, x - 6, y - 24);
}

function drawTrooper(foe) {
  const x = foe.x - camera.x;
  const y = foe.y - camera.y;
  const bob = Math.sin(state.time * 8 + foe.x * 0.06) * 1.3;
  ctx.save();
  ctx.translate(x + foe.w / 2, y + foe.h / 2);
  ctx.scale(foe.dir, 1);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(0, foe.h / 2 + 4, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a2018";
  ctx.fillRect(-8, -9 + bob, 16, 20);
  ctx.fillStyle = foe.color;
  ctx.fillRect(-7, -8 + bob, 14, 18);
  ctx.fillStyle = "#bc9166";
  ctx.fillRect(-5, -18 + bob, 10, 10);
  ctx.fillStyle = foe.type === "trooper" ? "#a8c3e6" : foe.type === "cropguard" ? "#9be570" : "#8fcd62";
  ctx.fillRect(-6, -6 + bob, 12, 3);
  ctx.fillStyle = "#f2efe8";
  ctx.fillRect(-3, -15 + bob, 2, 2);
  ctx.fillRect(1, -15 + bob, 2, 2);
  ctx.fillStyle = "#263246";
  ctx.fillRect(-6, 10 + bob, 4, 10);
  ctx.fillRect(2, 10 + bob, 4, 10);
  ctx.fillStyle = "#d2b487";
  ctx.fillRect(-10, -3 + bob, 4, 8);
  ctx.fillRect(6, -2 + bob, 4, 8);
  if (foe.type === "cropguard") {
    ctx.fillStyle = "#4b3421";
    ctx.fillRect(9, -4 + bob, 8, 2);
    ctx.fillRect(13, -8 + bob, 2, 18);
  } else {
    ctx.fillStyle = "#273241";
    ctx.fillRect(8, -4 + bob, 9, 3);
  }
  ctx.restore();
}

  function drawEmu(foe) {
    const x = foe.x - camera.x;
    const y = foe.y - camera.y;
    ctx.save();
    ctx.translate(x + foe.w / 2, y + foe.h / 2);
    ctx.scale(foe.dir, 1);
    const bob = Math.sin(state.time * 12 + foe.x * 0.04) * 2;
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(0, foe.h / 2 + 4, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = foe.color;
    ctx.beginPath();
    ctx.ellipse(-2, -2 + bob, 10, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(2, -18 + bob, 4, 16);
    ctx.fillStyle = "#3d2f24";
    ctx.beginPath();
    ctx.arc(5, -20 + bob, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d8c4ab";
    ctx.fillRect(7, -21 + bob, 5, 2);
    ctx.fillStyle = "#2d2119";
    ctx.fillRect(-4, 8 + bob, 3, 14);
    ctx.fillRect(3, 8 + bob, 3, 14);
    ctx.restore();
  }

function drawMagpie(foe) {
  const x = foe.x - camera.x;
  const y = foe.y - camera.y;
  ctx.save();
  ctx.translate(x + foe.w / 2, y + foe.h / 2);
  const flap = Math.sin(state.time * 16 + foe.x * 0.04) * 5;
  ctx.fillStyle = "#121418";
  ctx.beginPath();
  ctx.moveTo(-13, -1);
  ctx.lineTo(-2, -7 - flap * 0.2);
  ctx.lineTo(13, flap);
  ctx.lineTo(0, 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f0f2f5";
  ctx.beginPath();
  ctx.moveTo(-3, -2);
  ctx.lineTo(3, -2);
  ctx.lineTo(5, 3);
  ctx.lineTo(-4, 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#d7dee7";
  ctx.fillRect(8, -1, 4, 2);
  ctx.fillStyle = "#1b1a18";
  ctx.fillRect(3, -3, 2, 2);
  ctx.restore();
}

function drawKangaroo(foe) {
  const x = foe.x - camera.x;
  const y = foe.y - camera.y;
  ctx.save();
  ctx.translate(x + foe.w / 2, y + foe.h / 2);
  ctx.scale(foe.dir, 1);
  const hop = Math.sin((state.time * 10 + foe.x) * 0.08) * 2;
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(0, foe.h / 2 + 3, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5b3620";
  ctx.fillRect(-9, -8 + hop, 18, 14);
  ctx.fillStyle = foe.color;
  ctx.fillRect(-8, -16 + hop, 16, 12);
  ctx.fillStyle = "#d7b08d";
  ctx.fillRect(-5, -14 + hop, 10, 6);
  ctx.fillStyle = "#1f1711";
  ctx.fillRect(-4, -13 + hop, 2, 2);
  ctx.fillRect(2, -13 + hop, 2, 2);
  ctx.fillStyle = "#593821";
  ctx.beginPath();
  ctx.moveTo(-8, -17 + hop);
  ctx.lineTo(-12, -27 + hop);
  ctx.lineTo(-8, -28 + hop);
  ctx.lineTo(-4, -18 + hop);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(8, -17 + hop);
  ctx.lineTo(12, -27 + hop);
  ctx.lineTo(8, -28 + hop);
  ctx.lineTo(4, -18 + hop);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(8, -2 + hop, 14, 4);
  ctx.fillRect(-14, 1 + hop, 10, 3);
  ctx.fillStyle = "#a26d42";
  ctx.fillRect(-6, -5 + hop, 12, 3);
  ctx.restore();
}

function drawDingo(foe) {
  const x = foe.x - camera.x;
  const y = foe.y - camera.y;
  ctx.save();
  ctx.translate(x + foe.w / 2, y + foe.h / 2);
  ctx.scale(foe.dir, 1);
  const bob = Math.sin(state.time * 10 + foe.x * 0.05) * 1.1;
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.beginPath();
  ctx.ellipse(0, foe.h / 2 + 4, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4a3426";
  ctx.beginPath();
  ctx.ellipse(-1, 0 + bob, 15, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = foe.color;
  ctx.beginPath();
  ctx.ellipse(-1, -1 + bob, 14, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = foe.type === "policeDog" ? "#86a9c6" : "#f1d8b6";
  ctx.fillRect(4, -4 + bob, 6, 4);
  ctx.fillStyle = "#6c4c33";
  ctx.beginPath();
  ctx.moveTo(-8, -5 + bob);
  ctx.lineTo(-4, -11 + bob);
  ctx.lineTo(0, -5 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(6, -5 + bob);
  ctx.lineTo(10, -10 + bob);
  ctx.lineTo(13, -4 + bob);
  ctx.closePath();
  ctx.fill();
  if (foe.type === "farmdog") {
    ctx.fillStyle = "#c53f2d";
    ctx.fillRect(-1, -8 + bob, 4, 2);
  } else if (foe.type === "policeDog") {
    ctx.fillStyle = "#4b678d";
    ctx.fillRect(-6, -8 + bob, 12, 3);
  }
  ctx.fillStyle = "#2f2118";
  ctx.fillRect(6, -2 + bob, 2, 2);
  ctx.fillRect(-10, 2 + bob, 5, 10);
  ctx.fillRect(1, 2 + bob, 5, 10);
  ctx.fillRect(10, -2 + bob, 6, 3);
  ctx.restore();
}

function drawSnake(foe) {
  const x = foe.x - camera.x;
  const y = foe.y - camera.y;
  ctx.save();
  ctx.translate(x + foe.w / 2, y + foe.h / 2);
  ctx.scale(foe.dir, 1);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(0, foe.h / 2 + 2, 12, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  const sway = Math.sin(state.time * 10 + foe.x * 0.05) * 2;
  const colors = ["#4b69ff", "#7f4bff", "#d34ae8", "#f35c73", "#ff9a3d", "#ffd84f", "#67d56c", "#3ac9d7"];
  const bodyX = foe.type === "goanna" ? -16 : -15;
  const bodyW = foe.type === "goanna" ? 32 : 30;
  const bodyH = foe.type === "goanna" ? 12 : 10;
  ctx.fillStyle = "#251b16";
  ctx.beginPath();
  ctx.moveTo(-14, -2 + sway * 0.2);
  ctx.quadraticCurveTo(-4, -12 - sway * 0.3, 8, -7 + sway * 0.25);
  ctx.quadraticCurveTo(16, -4 + sway * 0.12, 16, 2 + sway * 0.18);
  ctx.quadraticCurveTo(8, 8 + sway * 0.28, -2, 6 + sway * 0.18);
  ctx.quadraticCurveTo(-12, 4 + sway * 0.12, -14, -2 + sway * 0.2);
  ctx.fill();
  ctx.fillStyle = foe.type === "goanna" ? "#40514b" : "#4a5e33";
  ctx.fillRect(bodyX, -4 + sway * 0.15, bodyW, bodyH);
  for (let i = 0; i < colors.length; i++) {
    ctx.fillStyle = colors[i];
    ctx.globalAlpha = 0.9;
    ctx.fillRect(bodyX + 1 + i * (bodyW / colors.length), -3 + sway * 0.15, Math.max(2, bodyW / colors.length - 1), bodyH - 1);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#f6f0d7";
  ctx.fillRect(8, -7 + sway * 0.16, 6, 3);
  ctx.fillStyle = "#161310";
  ctx.fillRect(11, -6 + sway * 0.16, 2, 2);
  ctx.fillStyle = "#f0b23e";
  ctx.fillRect(13, -1 + sway * 0.16, 6, 2);
  ctx.fillStyle = "#2d2118";
  ctx.fillRect(-15, 0 + sway * 0.1, 8, 3);
  ctx.fillStyle = "rgba(255,255,255,0.24)";
  ctx.fillRect(-8, -3 + sway * 0.12, 20, 1);
  if (foe.type === "goanna") {
    ctx.fillStyle = "#2d382e";
    ctx.fillRect(-10, 6 + sway * 0.12, 4, 4);
    ctx.fillRect(-1, 6 + sway * 0.12, 4, 4);
  }
  ctx.restore();
}

function drawPlayer() {
  if (player.invuln > 0 && Math.floor(state.time * 20) % 2 === 0) return;
  const x = player.x - camera.x;
  const y = player.y - camera.y;
  ctx.save();
  ctx.translate(x + player.w / 2, y + player.h / 2);
  ctx.scale(player.facing, 1);
  const runBob = player.onGround ? Math.sin(state.time * 14 + Math.abs(player.vx) * 0.04) * 2 : 0;
  const legSwing = player.onGround ? Math.sin(state.time * 14 + Math.abs(player.vx) * 0.03) * 2 : 0;

  if (player.beerTime > 0) {
    ctx.save();
    const pulse = 1 + Math.sin(state.time * 12) * 0.05;
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.76;
    const aura = ctx.createRadialGradient(0, -12 + runBob, 4, 0, -12 + runBob, 34);
    aura.addColorStop(0, "rgba(255, 255, 225, 0.98)");
    aura.addColorStop(0.18, "rgba(255, 214, 96, 0.96)");
    aura.addColorStop(0.45, "rgba(255, 132, 28, 0.72)");
    aura.addColorStop(0.72, "rgba(255, 74, 20, 0.36)");
    aura.addColorStop(1, "rgba(255, 74, 20, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.ellipse(0, 6 + runBob, 16 * pulse, 22 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.62;
    const flameColors = ["#fff4bf", "#ffd256", "#ff9a22", "#ff5e1d"];
    for (let i = 0; i < 5; i++) {
      const sway = Math.sin(state.time * 4 + i * 1.7) * 3;
      const rise = 14 + i * 3;
      ctx.fillStyle = flameColors[Math.min(i, flameColors.length - 1)];
      ctx.beginPath();
      ctx.moveTo(-10 + i * 4 - sway * 0.3, 14 + runBob);
      ctx.quadraticCurveTo(-16 + i * 3 - sway, 2 + runBob - rise, -6 + i * 2, -18 + runBob - rise);
      ctx.quadraticCurveTo(2 + i * 2 + sway, -4 + runBob - rise * 0.6, 8 + i * 2 + sway * 0.4, 10 + runBob);
      ctx.quadraticCurveTo(0 + i, 18 + runBob + sway * 0.2, -10 + i * 4 - sway * 0.3, 14 + runBob);
      ctx.fill();
    }
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#fff5cf";
    ctx.beginPath();
    ctx.arc(0, -8 + runBob, 8 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.beginPath();
  ctx.ellipse(0, player.h / 2 + 6, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1f1711";
  ctx.fillRect(-8, -8 + runBob, 16, 24);
  ctx.fillStyle = "#d29e6b";
  ctx.beginPath();
  ctx.arc(0, -13 + runBob, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7c5a3a";
  ctx.fillRect(-1, -10 + runBob, 2, 4);
  ctx.fillStyle = "#f0c496";
  ctx.fillRect(-4, -15 + runBob, 8, 2);

  ctx.fillStyle = "#f4f6f8";
  ctx.beginPath();
  ctx.moveTo(-9, -16 + runBob);
  ctx.quadraticCurveTo(-4, -22 + runBob, 3, -22 + runBob);
  ctx.quadraticCurveTo(10, -21 + runBob, 11, -15 + runBob);
  ctx.quadraticCurveTo(9, -12 + runBob, 0, -12 + runBob);
  ctx.quadraticCurveTo(-8, -12 + runBob, -9, -16 + runBob);
  ctx.fill();
  ctx.fillStyle = "#dde3e7";
  ctx.beginPath();
  ctx.arc(0, -17 + runBob, 6, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#cfd6db";
  ctx.fillRect(-8, -13 + runBob, 16, 3);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillRect(-5, -19 + runBob, 8, 1);

  ctx.fillStyle = "#b75a16";
  ctx.fillRect(-7, -8 + runBob, 14, 14);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-6, -1 + runBob, 12, 2);
  ctx.fillStyle = "#8f430f";
  ctx.fillRect(-7, -8 + runBob, 14, 2);
  ctx.fillRect(-7, 4 + runBob, 14, 2);

  ctx.fillStyle = "#d29e6b";
  ctx.fillRect(-9, -1 + runBob, 4, 8);
  ctx.fillRect(5, -1 + runBob, 4, 8);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-10, 1 + runBob, 3, 3);
  ctx.fillRect(7, 1 + runBob, 3, 3);

  ctx.fillStyle = "#1c3f77";
  ctx.fillRect(-7, 6 + runBob, 14, 8);
  ctx.fillStyle = "#2b558f";
  ctx.fillRect(-6, 7 + runBob, 12, 2);
  ctx.fillStyle = "#16355f";
  ctx.fillRect(-7, 9 + runBob, 3, 6);
  ctx.fillRect(4, 9 + runBob, 3, 6);

  ctx.fillStyle = "#16355f";
  ctx.fillRect(-6, 14 + runBob + legSwing, 4, 6);
  ctx.fillRect(2, 14 + runBob - legSwing, 4, 6);
  ctx.fillStyle = "#2c2a28";
  ctx.fillRect(-8, 18 + runBob + legSwing, 8, 2);
  ctx.fillRect(0, 18 + runBob - legSwing, 8, 2);
  ctx.fillStyle = "#ead6a8";
  ctx.fillRect(-5, 19 + runBob + legSwing, 3, 1);
  ctx.fillRect(3, 19 + runBob - legSwing, 3, 1);

  ctx.fillStyle = "#1f1711";
  ctx.fillRect(-5, -14 + runBob, 2, 2);
  ctx.fillRect(3, -14 + runBob, 2, 2);
  ctx.fillRect(-1, -11 + runBob, 2, 1);
  ctx.fillStyle = "rgba(30, 22, 16, 0.42)";
  ctx.fillRect(-8, -8 + runBob, 1, 28);
  ctx.fillRect(7, -8 + runBob, 1, 28);
  ctx.restore();
}

function drawCollectibles() {
  for (const item of level.collectibles) {
    if (item.collected || !isVisible(item)) continue;
    const x = item.x - camera.x;
    const y = item.y - camera.y;
    if (item.kind === "beer") {
      ctx.save();
      ctx.translate(x + 11, y + 12);
      ctx.rotate(-0.04);
      ctx.fillStyle = "rgba(255, 216, 90, 0.16)";
      ctx.beginPath();
      ctx.ellipse(0, 2, 15, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1d211d";
      ctx.beginPath();
      ctx.roundRect(-6, -10, 13, 24, 4);
      ctx.fill();
      ctx.fillStyle = "#19a738";
      ctx.beginPath();
      ctx.roundRect(-5, -9, 11, 22, 4);
      ctx.fill();
      ctx.fillStyle = "#f3f6f1";
      ctx.beginPath();
      ctx.moveTo(-3, -7);
      ctx.lineTo(7, -1);
      ctx.lineTo(6, 1);
      ctx.lineTo(-4, -5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f7d84f";
      ctx.beginPath();
      ctx.moveTo(-2, -2);
      ctx.lineTo(8, 4);
      ctx.lineTo(7, 6);
      ctx.lineTo(-3, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ef4b86";
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(4, 0);
      ctx.lineTo(6, 4);
      ctx.lineTo(2, 6);
      ctx.lineTo(-2, 4);
      ctx.lineTo(-4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f7c86f";
      ctx.fillRect(-5, -13, 11, 3);
      ctx.fillStyle = "#fff7ea";
      ctx.fillRect(-4, -12, 9, 1);
      ctx.fillStyle = "#ffe5a0";
      ctx.fillRect(-4, -10, 9, 2);
      ctx.fillStyle = "#f3ece0";
      ctx.fillRect(-5, 13, 11, 1);
      ctx.fillStyle = "#404040";
      ctx.fillRect(-1, -12, 1, 2);
      ctx.fillRect(2, -12, 1, 2);
      ctx.restore();
    } else if (item.kind === "life") {
      const shimmer = 0.76 + Math.sin(state.time * 7 + item.x * 0.04) * 0.2;
      ctx.save();
      ctx.globalAlpha = shimmer;
      ctx.fillStyle = "#ffef96";
      ctx.beginPath();
      ctx.arc(x + 11, y + 11, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d7a837";
      ctx.beginPath();
      ctx.arc(x + 11, y + 11, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#175ba8";
      ctx.fillRect(x + 7, y + 8, 8, 6);
      ctx.fillRect(x + 12, y + 6, 3, 10);
      ctx.fillRect(x + 5, y + 13, 5, 3);
      ctx.fillRect(x + 13, y + 13, 5, 3);
      ctx.fillRect(x + 15, y + 10, 3, 3);
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.86)";
      ctx.fillRect(x + 5, y + 3, 4, 2);
      ctx.fillRect(x + 15, y + 6, 2, 2);
    } else {
      ctx.save();
      ctx.translate(x + 11, y + 11);
      ctx.rotate(-0.45);
      ctx.fillStyle = "rgba(255, 219, 150, 0.18)";
      ctx.beginPath();
      ctx.ellipse(0, 1, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f6d9aa";
      ctx.beginPath();
      ctx.moveTo(-14, 5);
      ctx.lineTo(-2, -11);
      ctx.lineTo(12, 5);
      ctx.lineTo(-14, 5);
      ctx.fill();
      ctx.fillStyle = "#e8c58d";
      ctx.beginPath();
      ctx.moveTo(-13, 4);
      ctx.lineTo(-2, -9);
      ctx.lineTo(10, 4);
      ctx.lineTo(-13, 4);
      ctx.fill();
      ctx.fillStyle = "#7f4b22";
      ctx.beginPath();
      ctx.ellipse(-12, 5, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(12, 5, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5b3015";
      ctx.beginPath();
      ctx.ellipse(-12, 5, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(12, 5, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#a33a29";
      ctx.fillRect(-11, 3, 22, 2);
      ctx.fillStyle = "#f0e2c5";
      ctx.beginPath();
      ctx.moveTo(-11, 4);
      ctx.lineTo(-1, -9);
      ctx.lineTo(9, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawForegroundDust() {
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#ffefd0";
  for (let i = 0; i < 16; i++) {
    const x = ((i * 143 + Math.floor(state.time * 30)) % (VIEW.width + 180)) - 90;
    const y = VIEW.height - 34 - ((i * 17) % 12);
    ctx.fillRect(x, y, 4, 2);
  }
  ctx.restore();
}

function isVisible(rect) {
  return rect.x + rect.w >= camera.x - 50 && rect.x <= camera.x + VIEW.width + 50 && rect.y + rect.h >= camera.y - 50 && rect.y <= camera.y + VIEW.height + 50;
}

function tick(now) {
  if (!lastFrame) lastFrame = now;
  const dt = Math.min(0.033, (now - lastFrame) / 1000);
  lastFrame = now;

  if (!level) {
    loadLevel(0, true);
  }

  state.time += dt;
  if (state.messageTimer > 0) {
    state.messageTimer -= dt;
    if (state.messageTimer <= 0) state.message = "";
  }

  if (state.mode === "playing") {
    updateMovingPlatforms(dt, state.time);
    updatePlayer(dt);
    updateEnemies(dt);
    updateBosses(dt);
    updateBossProjectiles(dt);
    updateCollectibles();
    updateHazards();
    updateCheckpointsAndFinish();
    updateCamera();
    updateHUD();
  } else {
    updateMovingPlatforms(dt, state.time);
    updateCamera();
    updateHUD();
  }

  drawFrame();
  updateMiniMap();

  pressed.jump = false;
  pressed.restart = false;

  requestAnimationFrame(tick);
}

showTitleScreen();
updateHUD();
drawFrame();
updateMiniMap();
requestAnimationFrame(tick);

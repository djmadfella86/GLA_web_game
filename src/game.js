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
const storyPrimary = document.querySelector("#story-primary");
const storySecondary = document.querySelector("#story-secondary");
const levelPicker = document.querySelector("#level-picker");
const pauseButton = document.querySelector("#pause-button");
const pauseCard = document.querySelector("#pause-card");
const pauseResume = document.querySelector("#pause-resume");
const pauseRestart = document.querySelector("#pause-restart");
const pauseQuit = document.querySelector("#pause-quit");
const continueCard = document.querySelector("#continue-card");
const continueCopy = document.querySelector("#continue-copy");
const continueButton = document.querySelector("#continue-button");
const continueQuit = document.querySelector("#continue-quit");
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
  left: false,
  right: false,
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
const MAX_CONTINUES = 1;

const state = {
  mode: "title",
  levelIndex: 0,
  time: 0,
  deaths: 0,
  lives: STARTING_LIVES,
  continues: MAX_CONTINUES,
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

const campaignLevels = [
  { title: "Roo Strike", factory: buildLevelOne },
  { title: "No Bars", factory: buildLevelTwo },
  { title: "Tomato Patch", factory: buildLevelThree },
  { title: "Raid Run", factory: buildLevelFour },
  { title: "Country Pub Brawl", factory: buildLevelFive },
  { title: "Rail Yard", factory: buildLevelSix },
  { title: "Showgrounds", factory: buildLevelSeven },
  { title: "Bull Paddock", factory: buildLevelEight },
  { title: "Crocodile River", factory: buildLevelNine },
  { title: "Roadhouse Chaos", factory: buildLevelTen },
  { title: "Mine Gate", factory: buildLevelEleven },
  { title: "Wrong-Way Haul Truck", factory: buildLevelTwelve },
  { title: "Superintendent Showdown", factory: buildLevelThirteen },
];

const levelFactories = campaignLevels.map((entry) => entry.factory);

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
    runnerLaneIndex: 1,
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
    travelDir: motion.travelDir ?? 0,
    travelSpeed: motion.travelSpeed ?? 0,
    loopPadding: motion.loopPadding ?? 420,
    loopDistance: motion.loopDistance ?? 0,
  };
}

function enemy(type, x, y, bounds, extra = {}) {
  const defaults = {
    kangaroo: { w: 28, h: 24, speed: 92, hopPower: 800, color: "#d9a15f" },
    dingo: { w: 30, h: 22, speed: 110, hopPower: 0, color: "#b07d4f" },
    snake: { w: 34, h: 14, speed: 78, hopPower: 0, color: "#8bb35f" },
    goanna: { w: 36, h: 16, speed: 82, hopPower: 0, color: "#7f8e55" },
    emu: { w: 26, h: 40, speed: 118, hopPower: 0, color: "#76654c" },
    bikie: { w: 22, h: 26, speed: 120, hopPower: 0, color: "#4b3f49" },
    farmdog: { w: 30, h: 22, speed: 116, hopPower: 0, color: "#8e6a48" },
    policeDog: { w: 30, h: 22, speed: 122, hopPower: 0, color: "#4a5057" },
    trooper: { w: 24, h: 34, speed: 92, hopPower: 0, color: "#55729f" },
    cultist: { w: 24, h: 34, speed: 88, hopPower: 0, color: "#72513b" },
    cropguard: { w: 24, h: 34, speed: 94, hopPower: 0, color: "#5e452f" },
    bull: { w: 40, h: 28, speed: 118, hopPower: 0, color: "#6d4a2f" },
    croc: { w: 42, h: 18, speed: 88, hopPower: 0, color: "#5b8f42" },
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
    bikie: {
      w: 70,
      h: 78,
      speed: 162,
      hopPower: 980,
      health: 6,
      color: "#47353f",
      accent: "#6f5563",
      label: "Bikie King",
      introLine: "The bikies decide Barry has wandered into the wrong sort of pub.",
      defeatLine: "The bikie king tumbles out the back alley and the noise finally dies down.",
      projectileKind: "bottle",
      projectileColor: "#5cbf71",
      projectileSpeed: 380,
      contactDamage: 28,
    },
    bull: {
      w: 56,
      h: 44,
      speed: 124,
      hopPower: 0,
      health: 4,
      color: "#67402a",
      accent: "#d4b18a",
      label: "Paddock Bull",
      introLine: "The paddock bull lowers its head and picks Barry as the target.",
      defeatLine: "The bull snorts, loses the argument, and storms off through the fence line.",
      projectileKind: "none",
      projectileColor: "#d4b18a",
      projectileSpeed: 260,
      contactDamage: 26,
    },
    croc: {
      w: 62,
      h: 26,
      speed: 112,
      hopPower: 0,
      health: 4,
      color: "#3d6c39",
      accent: "#a9d88d",
      label: "River Croc",
      introLine: "A river croc drags itself up to block the crossing.",
      defeatLine: "The croc gives up its spot and sinks back under the water.",
      projectileKind: "none",
      projectileColor: "#a9d88d",
      projectileSpeed: 260,
      contactDamage: 24,
    },
    superintendent: {
      w: 46,
      h: 56,
      speed: 136,
      hopPower: 900,
      health: 6,
      color: "#4c5565",
      accent: "#f0f7fd",
      label: "Site Superintendent",
      introLine: "The superintendent finally catches Barry at the gate.",
      defeatLine: "The superintendent runs out of paperwork and Barry gets one last opening.",
      projectileKind: "ticket",
      projectileColor: "#ffe48a",
      projectileSpeed: 360,
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
  const kind = options.kind ?? "nature";
  const clouds = [];
  const hills = [];
  const mesas = [];
  const shrubs = [];
  const gumTrees = [];
  const birds = [];
  const koalas = [];
  const railSheds = [];
  const railGantries = [];
  const railPoles = [];
  const railStacks = [];
  const railLights = [];
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

  if (kind === "railyard") {
    for (let i = 0; i < 7; i++) {
      railSheds.push({
        x: -120 + i * (width / 6.2) + random() * 120,
        y: height - 250 - random() * 80,
        w: 140 + random() * 160,
        h: 70 + random() * 75,
        roofs: 1 + Math.floor(random() * 3),
      });
    }

    for (let i = 0; i < 10; i++) {
      railGantries.push({
        x: 140 + i * (width / 9.4) + random() * 100,
        y: height - 405 - random() * 45,
        w: 130 + random() * 110,
        h: 120 + random() * 70,
      });
    }

    for (let i = 0; i < 18; i++) {
      railPoles.push({
        x: random() * width,
        y: height - 178 - random() * 30,
        h: 84 + random() * 36,
      });
    }

    for (let i = 0; i < 14; i++) {
      railStacks.push({
        x: random() * width,
        y: height - 124 - random() * 22,
        w: 34 + random() * 48,
        h: 22 + random() * 22,
        tint: i % 3 === 0 ? "#5c6871" : i % 2 === 0 ? "#8d6a37" : "#667f8d",
      });
    }

    for (let i = 0; i < 8; i++) {
      railLights.push({
        x: 90 + random() * (width - 180),
        y: height - 184 - random() * 42,
        r: 7 + random() * 4,
      });
    }
  } else {
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
  }

  return {
    kind,
    clouds,
    hills,
    mesas,
    shrubs,
    gumTrees,
    birds,
    koalas,
    railSheds,
    railGantries,
    railPoles,
    railStacks,
    railLights,
  };
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

function buildLevelFive() {
  const width = 4280;
  const height = 1040;
  return {
    title: "Country Pub Brawl",
    objective: "Fight through the pub, climb the roof line, and escape the bikies.",
    legend: "Barry walked into a pub and cleaned out an entire bikie crew.",
    truth: "Barry ordered one beer, got blamed for everything, and had to sprint for the back lane.",
    theme: {
      skyTop: "#3f425f",
      skyBottom: "#8c5c52",
      sun: "#f5c27d",
      hillFar: "#3f5647",
      hillNear: "#27382e",
      ground: "#4d3b33",
      groundTop: "#7f6557",
      detail: "#171310",
      accent: "#6fc7ff",
    },
    spawn: { x: 72, y: 744 },
    checkpoint: { x: 1600, y: 520, label: "Beer Garden" },
    finishZone: finish(3960, 300, 120, 120, "BACK LANE", "portal"),
    world: { width, height },
    backdrop: createBackdrop(55, width, height, { treeCount: 12, treeScale: 1.08, treeStyles: ["ghost", "dead"] }),
    platforms: [
      solid(0, 800, 980, 240),
      solid(1100, 800, 260, 240),
      solid(1460, 700, 180, 340),
      solid(1720, 620, 170, 420),
      solid(1980, 740, 220, 300),
      solid(2320, 620, 180, 420),
      solid(2600, 540, 200, 500),
      solid(2940, 760, 220, 280),
      solid(3320, 620, 420, 420),
      solid(3820, 420, 460, 620),
      ledge(180, 700, 110, 18),
      ledge(420, 620, 100, 18),
      ledge(680, 560, 110, 18),
      ledge(940, 660, 100, 18),
      ledge(1280, 560, 92, 18),
      ledge(1600, 520, 90, 18),
      ledge(1880, 600, 110, 18),
      ledge(2160, 560, 88, 18),
      ledge(2440, 470, 94, 18),
      ledge(2760, 700, 92, 18),
      ledge(3100, 600, 90, 18),
      ledge(3420, 520, 94, 18),
      ledge(3880, 420, 100, 18),
    ],
    movers: [
      mover(1540, 640, 110, 18, { axis: "y", amplitude: 62, speed: 1.12, phase: 0.5, style: "truck" }),
      mover(2780, 620, 120, 18, { axis: "x", amplitude: 110, speed: 1.35, phase: 1.8, style: "car" }),
    ],
    hazards: [
      hazard(460, 800, 150, 120, "mud", 18),
      hazard(980, 720, 130, 180, "fire", 22, { pulse: true, pulseSpeed: 2.8, pulsePhase: 0.6 }),
      hazard(1320, 800, 120, 120, "water", 28),
      hazard(1880, 700, 150, 190, "fire", 22, { pulse: true, pulseSpeed: 2.4, pulsePhase: 0.2 }),
      hazard(2440, 640, 140, 220, "water", 30),
      hazard(2860, 760, 130, 160, "fire", 22, { pulse: true, pulseSpeed: 3.1, pulsePhase: 1.2 }),
      hazard(3560, 760, 140, 180, "water", 30),
    ],
    enemies: [
      enemy("bikie", 430, 768, { left: 360, right: 620 }),
      enemy("bikie", 880, 688, { left: 820, right: 1040 }),
      enemy("bikie", 1500, 610, { left: 1460, right: 1640 }),
      enemy("bikie", 2040, 648, { left: 1980, right: 2220 }),
      enemy("magpie", 2480, 454, { left: 2400, right: 2660 }),
      enemy("bikie", 2820, 688, { left: 2760, right: 2960 }),
      enemy("bikie", 3360, 588, { left: 3280, right: 3480 }),
      enemy("bikie", 3920, 508, { left: 3840, right: 4060 }),
    ],
    checkpoints: [checkpoint(1600, 520, "Beer Garden", 1600, 530)],
    collectibles: [
      collectible("beer", 360, 744, { duration: 8 }),
      collectible("snag", 760, 588),
      collectible("life", 1580, 564),
      collectible("snag", 2800, 640),
      collectible("beer", 3740, 506, { duration: 9 }),
    ],
    decor: [
      { kind: "pubInterior", x: 140, y: 800, scale: 1.4 },
      { kind: "pub", x: 290, y: 798, scale: 1.15 },
      { kind: "harley", x: 520, y: 800, scale: 1.08 },
      { kind: "harley", x: 1260, y: 800, scale: 0.92 },
      { kind: "sign", x: 1660, y: 742, scale: 1.1 },
      { kind: "fence", x: 2300, y: 540, scale: 1.0 },
      { kind: "harley", x: 3280, y: 660, scale: 1.0 },
      { kind: "esky", x: 3720, y: 758, scale: 1.1 },
      { kind: "sign", x: 3840, y: 500, scale: 1.1 },
    ],
    boss: boss("bikie", 3460, 542, { left: 3340, right: 3740 }),
    projectiles: [],
  };
}

function buildLevelSix() {
  const width = 14280;
  const height = 640;
  return {
    title: "Rail Yard",
    objective: "Run the rail lanes, swap tracks, and hop the barriers before the freight yard closes in.",
    legend: "Barry blasted through the rail yard like he owned the timetable.",
    truth: "He just kept changing tracks, jumping barriers, and dodging trains until the exit appeared.",
    theme: {
      skyTop: "#44505c",
      skyBottom: "#7a6657",
      sun: "#f3c377",
      hillFar: "#2f343a",
      hillNear: "#1f2328",
      ground: "#493e37",
      groundTop: "#79634f",
      detail: "#101214",
      accent: "#f5d15f",
    },
    spawn: { x: 70, y: 266 },
    runner: {
      enabled: true,
      speed: 272,
      lanes: [150, 270, 390],
      spawnLane: 1,
      cameraY: 0,
    },
    checkpoint: { x: 7180, y: 236, label: "Freight Midpoint" },
    finishZone: finish(13420, 114, 760, 330, "YARD EXIT", "portal"),
    world: { width, height },
    backdrop: createBackdrop(66, width, height, { kind: "railyard", treeCount: 0, treeScale: 1, treeStyles: [] }),
    platforms: [
      solid(0, 150, width, 34),
      solid(0, 270, width, 34),
      solid(0, 390, width, 34),
    ],
    movers: [
      mover(960, 108, 282, 42, { axis: "x", style: "train", travelDir: -1, travelSpeed: 118, loopPadding: 460, loopDistance: width + 960, phase: 0.2 }),
      mover(1700, 228, 276, 42, { axis: "x", style: "train", travelDir: -1, travelSpeed: 126, loopPadding: 460, loopDistance: width + 960, phase: 1.1 }),
      mover(2480, 348, 288, 42, { axis: "x", style: "train", travelDir: -1, travelSpeed: 112, loopPadding: 460, loopDistance: width + 960, phase: 2.0 }),
      mover(3300, 108, 296, 42, { axis: "x", style: "train", travelDir: -1, travelSpeed: 132, loopPadding: 460, loopDistance: width + 960, phase: 0.6 }),
      mover(4140, 228, 282, 42, { axis: "x", style: "train", travelDir: -1, travelSpeed: 122, loopPadding: 460, loopDistance: width + 960, phase: 2.3 }),
      mover(5060, 348, 290, 42, { axis: "x", style: "train", travelDir: -1, travelSpeed: 136, loopPadding: 460, loopDistance: width + 960, phase: 1.7 }),
      mover(5920, 108, 300, 42, { axis: "x", style: "train", travelDir: -1, travelSpeed: 120, loopPadding: 460, loopDistance: width + 960, phase: 0.4 }),
      mover(6860, 228, 286, 42, { axis: "x", style: "train", travelDir: -1, travelSpeed: 128, loopPadding: 460, loopDistance: width + 960, phase: 2.1 }),
      mover(7780, 348, 292, 42, { axis: "x", style: "train", travelDir: -1, travelSpeed: 134, loopPadding: 460, loopDistance: width + 960, phase: 1.4 }),
      mover(8680, 108, 300, 42, { axis: "x", style: "train", travelDir: -1, travelSpeed: 116, loopPadding: 460, loopDistance: width + 960, phase: 0.9 }),
      mover(9600, 228, 284, 42, { axis: "x", style: "train", travelDir: -1, travelSpeed: 130, loopPadding: 460, loopDistance: width + 960, phase: 1.8 }),
      mover(10540, 348, 292, 42, { axis: "x", style: "train", travelDir: -1, travelSpeed: 138, loopPadding: 460, loopDistance: width + 960, phase: 0.1 }),
      mover(11460, 108, 294, 42, { axis: "x", style: "train", travelDir: -1, travelSpeed: 118, loopPadding: 460, loopDistance: width + 960, phase: 2.4 }),
      mover(12380, 228, 286, 42, { axis: "x", style: "train", travelDir: -1, travelSpeed: 127, loopPadding: 460, loopDistance: width + 960, phase: 1.0 }),
      mover(13220, 348, 294, 42, { axis: "x", style: "train", travelDir: -1, travelSpeed: 135, loopPadding: 460, loopDistance: width + 960, phase: 2.2 }),
    ],
    hazards: [
      hazard(520, 126, 74, 40, "barrier", 24),
      hazard(760, 246, 74, 40, "barrier", 24),
      hazard(1080, 366, 74, 40, "barrier", 24),
      hazard(1540, 126, 74, 40, "barrier", 24),
      hazard(1810, 246, 74, 40, "barrier", 24),
      hazard(2140, 366, 74, 40, "barrier", 24),
      hazard(2500, 126, 74, 40, "barrier", 24),
      hazard(2860, 246, 74, 40, "barrier", 24),
      hazard(3200, 366, 74, 40, "barrier", 24),
      hazard(3600, 126, 74, 40, "barrier", 24),
      hazard(3960, 246, 74, 40, "barrier", 24),
      hazard(4300, 366, 74, 40, "barrier", 24),
      hazard(4680, 126, 74, 40, "barrier", 24),
      hazard(5060, 246, 74, 40, "barrier", 24),
      hazard(5460, 366, 74, 40, "barrier", 24),
      hazard(5900, 126, 74, 40, "barrier", 24),
      hazard(6300, 246, 74, 40, "barrier", 24),
      hazard(6720, 366, 74, 40, "barrier", 24),
      hazard(7140, 126, 74, 40, "barrier", 24),
      hazard(7540, 246, 74, 40, "barrier", 24),
      hazard(7960, 366, 74, 40, "barrier", 24),
      hazard(8400, 126, 74, 40, "barrier", 24),
      hazard(8820, 246, 74, 40, "barrier", 24),
      hazard(9240, 366, 74, 40, "barrier", 24),
      hazard(9680, 126, 74, 40, "barrier", 24),
      hazard(10100, 246, 74, 40, "barrier", 24),
      hazard(10540, 366, 74, 40, "barrier", 24),
      hazard(11000, 126, 74, 40, "barrier", 24),
      hazard(11420, 246, 74, 40, "barrier", 24),
      hazard(11860, 366, 74, 40, "barrier", 24),
      hazard(12320, 126, 74, 40, "barrier", 24),
      hazard(12740, 246, 74, 40, "barrier", 24),
      hazard(13180, 366, 74, 40, "barrier", 24),
    ],
    enemies: [],
    checkpoints: [checkpoint(7180, 266, "Freight Midpoint", 7180, 266)],
    collectibles: [
      collectible("snag", 300, 116),
      collectible("beer", 1340, 236, { duration: 8 }),
      collectible("snag", 2580, 356),
      collectible("beer", 3820, 116, { duration: 8 }),
      collectible("life", 5100, 236),
      collectible("snag", 6420, 356),
      collectible("beer", 7860, 116, { duration: 9 }),
      collectible("snag", 9140, 236),
      collectible("life", 10460, 356),
      collectible("beer", 11820, 116, { duration: 9 }),
      collectible("snag", 13120, 236),
    ],
    decor: [
      { kind: "rail", x: 250, y: 112, scale: 1.15 },
      { kind: "rail", x: 990, y: 232, scale: 1.1 },
      { kind: "rail", x: 1730, y: 352, scale: 1.1 },
      { kind: "rail", x: 2470, y: 112, scale: 1.15 },
      { kind: "rail", x: 3210, y: 232, scale: 1.1 },
      { kind: "rail", x: 3950, y: 352, scale: 1.15 },
      { kind: "rail", x: 4690, y: 112, scale: 1.1 },
      { kind: "rail", x: 5430, y: 232, scale: 1.1 },
      { kind: "rail", x: 6170, y: 352, scale: 1.15 },
      { kind: "rail", x: 6910, y: 112, scale: 1.1 },
      { kind: "rail", x: 7650, y: 232, scale: 1.1 },
      { kind: "rail", x: 8390, y: 352, scale: 1.15 },
      { kind: "rail", x: 9130, y: 112, scale: 1.1 },
      { kind: "rail", x: 9870, y: 232, scale: 1.1 },
      { kind: "rail", x: 10610, y: 352, scale: 1.15 },
      { kind: "rail", x: 11350, y: 112, scale: 1.1 },
      { kind: "rail", x: 12090, y: 232, scale: 1.1 },
      { kind: "rail", x: 12830, y: 352, scale: 1.15 },
      { kind: "sign", x: 560, y: 86, scale: 0.95 },
      { kind: "sign", x: 2080, y: 206, scale: 1.05 },
      { kind: "sign", x: 3520, y: 326, scale: 1.05 },
      { kind: "sign", x: 6240, y: 86, scale: 1.05 },
      { kind: "sign", x: 9180, y: 206, scale: 1.05 },
      { kind: "sign", x: 12220, y: 326, scale: 1.05 },
    ],
    projectiles: [],
  };
}

function buildLevelSeven() {
  const width = 3820;
  const height = 1040;
  return {
    title: "Country Showgrounds",
    objective: "Cross the sideshow and reach the grandstand without getting pinned down.",
    legend: "Barry tore through a country show like a one-man riot.",
    truth: "He was just trying to leave the showgrounds before the next round of rumours started.",
    theme: {
      skyTop: "#78b4d2",
      skyBottom: "#f7c984",
      sun: "#ffe082",
      hillFar: "#68866b",
      hillNear: "#445947",
      ground: "#6d5740",
      groundTop: "#aa855c",
      detail: "#241c15",
      accent: "#ffcc58",
    },
    spawn: { x: 60, y: 760 },
    checkpoint: { x: 1650, y: 560, label: "Sideshow" },
    finishZone: finish(3520, 470, 120, 210, "GRANDSTAND", "flag"),
    world: { width, height },
    backdrop: createBackdrop(77, width, height, { treeCount: 16, treeScale: 1.18, treeStyles: ["river", "mallee", "ghost"] }),
    platforms: [
      solid(0, 860, 360, 180),
      solid(540, 860, 300, 180),
      solid(980, 760, 170, 280),
      solid(1240, 650, 190, 390),
      solid(1510, 540, 200, 500),
      solid(1820, 700, 220, 340),
      solid(2140, 600, 180, 440),
      solid(2430, 500, 200, 540),
      solid(2740, 680, 190, 360),
      solid(3020, 560, 210, 480),
      solid(3320, 470, 500, 570),
      ledge(320, 740, 82, 18),
      ledge(850, 720, 72, 18),
      ledge(1120, 610, 70, 18),
      ledge(1400, 500, 70, 18),
      ledge(1700, 620, 72, 18),
      ledge(2060, 520, 70, 18),
      ledge(2370, 420, 70, 18),
      ledge(2680, 620, 72, 18),
      ledge(2950, 500, 70, 18),
      ledge(3230, 430, 70, 18),
    ],
    movers: [
      mover(930, 670, 110, 18, { axis: "y", amplitude: 84, speed: 1.06, phase: 0.9, style: "truck" }),
      mover(2460, 560, 120, 18, { axis: "x", amplitude: 110, speed: 1.15, phase: 1.4, style: "car" }),
    ],
    hazards: [
      hazard(410, 860, 110, 100, "cactus", 22),
      hazard(760, 860, 100, 100, "mud", 18),
      hazard(1160, 860, 120, 100, "fire", 22, { pulse: true, pulseSpeed: 2.7, pulsePhase: 0.4 }),
      hazard(1900, 860, 120, 100, "water", 28),
      hazard(2330, 860, 120, 100, "cactus", 22),
      hazard(2920, 860, 110, 100, "fire", 22, { pulse: true, pulseSpeed: 3.0, pulsePhase: 1.5 }),
    ],
    enemies: [
      enemy("emu", 720, 728, { left: 540, right: 880 }),
      enemy("kangaroo", 1380, 502, { left: 1280, right: 1610 }),
      enemy("magpie", 1910, 544, { left: 1820, right: 2220 }),
      enemy("dingo", 2860, 648, { left: 2740, right: 3070 }),
    ],
    checkpoints: [checkpoint(1650, 560, "Sideshow", 1650, 570)],
    collectibles: [
      collectible("snag", 430, 716),
      collectible("life", 1190, 576),
      collectible("beer", 2240, 464, { duration: 8 }),
      collectible("snag", 2770, 590),
      collectible("snag", 3380, 400),
    ],
    decor: [
      { kind: "showground", x: 360, y: 846, scale: 1.1 },
      { kind: "showground", x: 1440, y: 590, scale: 1.2 },
      { kind: "fence", x: 1970, y: 850, scale: 1.2 },
      { kind: "showground", x: 3040, y: 526, scale: 1.3 },
    ],
    boss: boss("groom", 3290, 674, { left: 3160, right: 3540 }),
    projectiles: [],
  };
}

function buildLevelEight() {
  const width = 3980;
  const height = 1080;
  return {
    title: "Bull Paddock",
    objective: "Climb the fence lines and get around the bull before it stamps a stop into the day.",
    legend: "Barry took on a paddock bull and somehow won.",
    truth: "He got chased through a maze of fences and only survived because the bull got tired first.",
    theme: {
      skyTop: "#98c7cf",
      skyBottom: "#f2c27f",
      sun: "#ffe28d",
      hillFar: "#6f8456",
      hillNear: "#4a5f41",
      ground: "#78573d",
      groundTop: "#b48c5d",
      detail: "#1f1710",
      accent: "#f1cf63",
    },
    spawn: { x: 70, y: 760 },
    checkpoint: { x: 1750, y: 600, label: "Fence Maze" },
    finishZone: finish(3620, 540, 130, 190, "PEN EXIT", "exit"),
    world: { width, height },
    backdrop: createBackdrop(88, width, height, { treeCount: 18, treeScale: 1.25, treeStyles: ["river", "mallee", "dead"] }),
    platforms: [
      solid(0, 860, 400, 220),
      solid(560, 860, 280, 220),
      solid(980, 760, 190, 320),
      solid(1260, 640, 190, 440),
      solid(1550, 560, 180, 520),
      solid(1830, 720, 220, 360),
      solid(2160, 600, 180, 480),
      solid(2440, 520, 180, 560),
      solid(2720, 700, 210, 380),
      solid(3050, 620, 200, 460),
      solid(3360, 540, 620, 540),
      ledge(330, 740, 78, 18),
      ledge(840, 720, 76, 18),
      ledge(1100, 600, 72, 18),
      ledge(1410, 500, 72, 18),
      ledge(1700, 680, 72, 18),
      ledge(2030, 560, 70, 18),
      ledge(2310, 480, 70, 18),
      ledge(2630, 660, 74, 18),
      ledge(2960, 560, 70, 18),
      ledge(3250, 480, 70, 18),
    ],
    movers: [
      mover(1020, 700, 130, 18, { axis: "y", amplitude: 82, speed: 1.2, phase: 0.3, style: "ute" }),
      mover(2260, 540, 110, 18, { axis: "x", amplitude: 100, speed: 1.2, phase: 1.3, style: "truck" }),
    ],
    hazards: [
      hazard(420, 860, 110, 120, "mud", 18),
      hazard(760, 860, 120, 120, "cactus", 22),
      hazard(1180, 860, 100, 120, "water", 30),
      hazard(1780, 860, 120, 120, "fire", 24, { pulse: true, pulseSpeed: 2.4, pulsePhase: 1.0 }),
      hazard(2340, 860, 120, 120, "mud", 18),
      hazard(2890, 860, 120, 120, "cactus", 22),
      hazard(3250, 860, 120, 120, "water", 30),
    ],
    enemies: [
      enemy("bull", 820, 720, { left: 560, right: 1040 }),
      enemy("bull", 1490, 542, { left: 1260, right: 1700 }),
      enemy("emu", 2080, 548, { left: 2030, right: 2420 }),
      enemy("dingo", 2920, 648, { left: 2840, right: 3160 }),
    ],
    checkpoints: [checkpoint(1750, 600, "Fence Maze", 1750, 610)],
    collectibles: [
      collectible("snag", 350, 716),
      collectible("life", 1140, 580),
      collectible("beer", 2140, 514, { duration: 8 }),
      collectible("snag", 2860, 610),
      collectible("snag", 3460, 500),
    ],
    decor: [
      { kind: "fence", x: 220, y: 844, scale: 1.5 },
      { kind: "fence", x: 1330, y: 624, scale: 1.3 },
      { kind: "fence", x: 2240, y: 624, scale: 1.3 },
      { kind: "fence", x: 3160, y: 544, scale: 1.4 },
    ],
    boss: boss("bull", 3400, 694, { left: 3260, right: 3730 }),
    projectiles: [],
  };
}

function buildLevelNine() {
  const width = 4080;
  const height = 1060;
  return {
    title: "Crocodile River",
    objective: "Use the river crossings and keep the crocs from closing the gap.",
    legend: "Barry made it through croc country with his boots still on.",
    truth: "The river was full of hungry crocs and he had to dance over the worst of it.",
    theme: {
      skyTop: "#5f8798",
      skyBottom: "#d0ba83",
      sun: "#ffd07b",
      hillFar: "#587263",
      hillNear: "#32483f",
      ground: "#625143",
      groundTop: "#9c7d5b",
      detail: "#201913",
      accent: "#6ad5ff",
    },
    spawn: { x: 60, y: 720 },
    checkpoint: { x: 1840, y: 560, label: "River Bend" },
    finishZone: finish(3760, 470, 120, 220, "RIVERBANK", "portal"),
    world: { width, height },
    backdrop: createBackdrop(99, width, height, { treeCount: 20, treeScale: 1.22, treeStyles: ["river", "dead", "ghost"] }),
    platforms: [
      solid(0, 840, 360, 220),
      solid(540, 760, 180, 300),
      solid(830, 640, 160, 420),
      solid(1080, 760, 180, 300),
      solid(1360, 620, 160, 440),
      solid(1600, 520, 210, 540),
      solid(1920, 720, 200, 340),
      solid(2230, 600, 180, 460),
      solid(2510, 500, 220, 560),
      solid(2840, 700, 180, 360),
      solid(3110, 560, 200, 500),
      solid(3410, 470, 670, 590),
      ledge(290, 700, 76, 18),
      ledge(680, 590, 72, 18),
      ledge(980, 710, 70, 18),
      ledge(1240, 590, 70, 18),
      ledge(1500, 470, 74, 18),
      ledge(1820, 660, 72, 18),
      ledge(2140, 520, 72, 18),
      ledge(2440, 420, 70, 18),
      ledge(2780, 620, 72, 18),
      ledge(3050, 500, 72, 18),
      ledge(3340, 430, 70, 18),
    ],
    movers: [
      mover(950, 686, 120, 18, { axis: "y", amplitude: 70, speed: 1.2, phase: 1.2, style: "boat" }),
      mover(2170, 570, 130, 18, { axis: "x", amplitude: 110, speed: 1.3, phase: 0.6, style: "boat" }),
      mover(2980, 640, 120, 18, { axis: "y", amplitude: 68, speed: 1.1, phase: 2.4, style: "boat" }),
    ],
    hazards: [
      hazard(360, 840, 170, 180, "water", 30),
      hazard(670, 840, 130, 180, "water", 34),
      hazard(1020, 840, 150, 180, "water", 34),
      hazard(1280, 840, 130, 180, "water", 34),
      hazard(1700, 840, 170, 180, "water", 34),
      hazard(2080, 840, 140, 180, "water", 34),
      hazard(2380, 840, 160, 180, "water", 34),
      hazard(2720, 840, 150, 180, "water", 34),
      hazard(3200, 840, 120, 180, "water", 34),
    ],
    enemies: [
      enemy("croc", 720, 790, { left: 360, right: 1260 }),
      enemy("snake", 1470, 586, { left: 1360, right: 1700 }),
      enemy("croc", 2320, 664, { left: 2080, right: 2800 }),
      enemy("magpie", 3260, 430, { left: 3160, right: 3560 }),
    ],
    checkpoints: [checkpoint(1840, 560, "River Bend", 1840, 570)],
    collectibles: [
      collectible("snag", 260, 690),
      collectible("beer", 1180, 630, { duration: 8 }),
      collectible("life", 2440, 390),
      collectible("snag", 2970, 564),
      collectible("snag", 3600, 404),
    ],
    decor: [
      { kind: "fence", x: 180, y: 836, scale: 1.2 },
      { kind: "fence", x: 1960, y: 718, scale: 1.2 },
      { kind: "fence", x: 3140, y: 558, scale: 1.3 },
    ],
    boss: boss("croc", 3560, 686, { left: 3440, right: 3850 }),
    projectiles: [],
  };
}

function buildLevelTen() {
  const width = 3980;
  const height = 1020;
  return {
    title: "Roadhouse Chaos",
    objective: "Run the servo gauntlet, dodge the lanterns, and get out before the rumours spread again.",
    legend: "Barry survived a roadhouse attack and left the place in ruins.",
    truth: "He stopped for fuel, got blamed for a mess he didn't make, and had to run through the chaos.",
    theme: {
      skyTop: "#546d7e",
      skyBottom: "#bb8461",
      sun: "#ffd48e",
      hillFar: "#5a6350",
      hillNear: "#344036",
      ground: "#665042",
      groundTop: "#a47d58",
      detail: "#221710",
      accent: "#ffcf63",
    },
    spawn: { x: 60, y: 720 },
    checkpoint: { x: 1900, y: 560, label: "Servo Roof" },
    finishZone: finish(3680, 500, 120, 200, "BACK ROAD", "exit"),
    world: { width, height },
    backdrop: createBackdrop(110, width, height, { treeCount: 12, treeScale: 1.1, treeStyles: ["ghost", "dead", "mallee"] }),
    platforms: [
      solid(0, 840, 380, 180),
      solid(540, 760, 180, 260),
      solid(820, 660, 180, 360),
      solid(1100, 760, 220, 260),
      solid(1450, 620, 180, 400),
      solid(1740, 540, 210, 480),
      solid(2060, 720, 190, 300),
      solid(2360, 600, 180, 420),
      solid(2640, 500, 190, 520),
      solid(2940, 680, 190, 340),
      solid(3240, 560, 220, 460),
      solid(3540, 500, 440, 520),
      ledge(300, 700, 72, 18),
      ledge(650, 590, 74, 18),
      ledge(930, 650, 70, 18),
      ledge(1220, 560, 72, 18),
      ledge(1560, 500, 70, 18),
      ledge(1900, 660, 72, 18),
      ledge(2220, 540, 70, 18),
      ledge(2520, 420, 70, 18),
      ledge(2860, 620, 72, 18),
      ledge(3160, 500, 70, 18),
      ledge(3460, 440, 70, 18),
    ],
    movers: [
      mover(1260, 720, 120, 18, { axis: "x", amplitude: 140, speed: 1.25, phase: 0.5, style: "truck" }),
      mover(2540, 560, 120, 18, { axis: "y", amplitude: 76, speed: 1.2, phase: 1.9, style: "barge" }),
    ],
    hazards: [
      hazard(420, 840, 120, 100, "mud", 18),
      hazard(730, 840, 120, 100, "fire", 22, { pulse: true, pulseSpeed: 2.5, pulsePhase: 0.8 }),
      hazard(1050, 840, 120, 100, "water", 30),
      hazard(1540, 840, 130, 100, "cactus", 22),
      hazard(2180, 840, 120, 100, "mud", 18),
      hazard(2740, 840, 130, 100, "fire", 22, { pulse: true, pulseSpeed: 2.8, pulsePhase: 1.7 }),
      hazard(3320, 840, 120, 100, "water", 30),
    ],
    enemies: [
      enemy("cultist", 760, 620, { left: 650, right: 950 }),
      enemy("cropguard", 1600, 490, { left: 1450, right: 1780 }),
      enemy("dingo", 2380, 620, { left: 2280, right: 2700 }),
      enemy("magpie", 3130, 440, { left: 3040, right: 3400 }),
    ],
    checkpoints: [checkpoint(1900, 560, "Servo Roof", 1900, 570)],
    collectibles: [
      collectible("snag", 250, 684),
      collectible("beer", 940, 590, { duration: 8 }),
      collectible("life", 2500, 404),
      collectible("snag", 3010, 604),
      collectible("snag", 3560, 444),
    ],
    decor: [
      { kind: "roadhouse", x: 250, y: 832, scale: 1.2 },
      { kind: "sign", x: 1440, y: 750, scale: 1.3 },
      { kind: "fence", x: 2180, y: 836, scale: 1.3 },
      { kind: "esky", x: 3040, y: 760, scale: 1.1 },
    ],
    boss: boss("cultist", 3380, 684, { left: 3260, right: 3660 }),
    projectiles: [],
  };
}

function buildLevelEleven() {
  const width = 4160;
  const height = 1120;
  return {
    title: "Mine Gate",
    objective: "Cross the site gate, climb the permit stack, and get inside before security locks it down.",
    legend: "Barry stormed the mine gate and fought his way inside.",
    truth: "He was still trying to clock on while the whole site treated him like an intruder.",
    theme: {
      skyTop: "#50647b",
      skyBottom: "#b58b67",
      sun: "#f4c47f",
      hillFar: "#576a5c",
      hillNear: "#34463d",
      ground: "#64524a",
      groundTop: "#9b7458",
      detail: "#171513",
      accent: "#8be0ff",
    },
    spawn: { x: 70, y: 792 },
    checkpoint: { x: 1860, y: 612, label: "Permit Stack" },
    finishZone: finish(3840, 530, 120, 210, "GATEHOUSE", "portal"),
    world: { width, height },
    backdrop: createBackdrop(121, width, height, { treeCount: 12, treeScale: 1.0, treeStyles: ["dead", "ghost"] }),
    platforms: [
      solid(0, 900, 380, 220),
      solid(560, 820, 220, 300),
      solid(900, 720, 180, 400),
      solid(1180, 610, 190, 510),
      solid(1480, 780, 220, 340),
      solid(1810, 660, 190, 460),
      solid(2100, 560, 190, 560),
      solid(2400, 760, 210, 360),
      solid(2720, 640, 190, 480),
      solid(3000, 540, 210, 580),
      solid(3330, 740, 200, 380),
      solid(3650, 610, 510, 510),
      ledge(320, 760, 72, 18),
      ledge(710, 690, 72, 18),
      ledge(1030, 600, 70, 18),
      ledge(1330, 500, 70, 18),
      ledge(1660, 700, 72, 18),
      ledge(1970, 580, 70, 18),
      ledge(2270, 480, 70, 18),
      ledge(2590, 680, 72, 18),
      ledge(2880, 560, 70, 18),
      ledge(3180, 460, 70, 18),
      ledge(3500, 700, 72, 18),
    ],
    movers: [
      mover(1120, 660, 120, 18, { axis: "y", amplitude: 86, speed: 1.2, phase: 0.3, style: "truck" }),
      mover(2460, 700, 130, 18, { axis: "x", amplitude: 140, speed: 1.12, phase: 1.4, style: "barge" }),
      mover(3290, 660, 120, 18, { axis: "y", amplitude: 92, speed: 1.25, phase: 2.1, style: "truck" }),
    ],
    hazards: [
      hazard(430, 900, 120, 120, "mud", 18),
      hazard(820, 900, 120, 120, "fire", 22, { pulse: true, pulseSpeed: 2.4, pulsePhase: 0.2 }),
      hazard(1400, 900, 130, 120, "water", 32),
      hazard(1960, 900, 120, 120, "cactus", 22),
      hazard(2600, 900, 120, 120, "fire", 22, { pulse: true, pulseSpeed: 3.0, pulsePhase: 1.2 }),
      hazard(3160, 900, 120, 120, "mud", 18),
    ],
    enemies: [
      enemy("trooper", 760, 748, { left: 560, right: 1020 }),
      enemy("policeDog", 1520, 748, { left: 1400, right: 1710 }),
      enemy("magpie", 2140, 516, { left: 2060, right: 2360 }),
      enemy("trooper", 3160, 688, { left: 3000, right: 3360 }),
    ],
    checkpoints: [checkpoint(1860, 612, "Permit Stack", 1860, 622)],
    collectibles: [
      collectible("snag", 300, 734),
      collectible("beer", 1270, 574, { duration: 8 }),
      collectible("life", 2320, 444),
      collectible("snag", 3060, 642),
      collectible("snag", 3720, 574),
    ],
    decor: [
      { kind: "mine", x: 280, y: 894, scale: 1.4 },
      { kind: "mine", x: 1590, y: 786, scale: 1.2 },
      { kind: "mine", x: 2740, y: 646, scale: 1.2 },
      { kind: "mine", x: 3560, y: 606, scale: 1.4 },
    ],
    boss: boss("cop", 3460, 708, { left: 3340, right: 3730 }),
    projectiles: [],
  };
}

function buildLevelTwelve() {
  const width = 4320;
  const height = 980;
  return {
    title: "Wrong-Way Haul Truck",
    objective: "Ride the truck, cling to the route, and survive the worst trip of the swing.",
    legend: "Barry jumped onto a haul truck and used it to beat the mine road.",
    truth: "He got stuck on the wrong truck and had to use every wall and jump to get it back under control.",
    theme: {
      skyTop: "#4c5e70",
      skyBottom: "#ab8161",
      sun: "#f4c07e",
      hillFar: "#4d5d54",
      hillNear: "#283530",
      ground: "#5d4d44",
      groundTop: "#94745a",
      detail: "#161515",
      accent: "#8adfff",
    },
    spawn: { x: 70, y: 706 },
    checkpoint: { x: 2100, y: 500, label: "Truck Bed" },
    finishZone: finish(4000, 420, 120, 210, "SHIFT ROAD", "portal"),
    world: { width, height },
    backdrop: createBackdrop(132, width, height, { treeCount: 10, treeScale: 0.98, treeStyles: ["dead", "ghost"] }),
    platforms: [
      solid(0, 800, 320, 180),
      solid(520, 740, 180, 240),
      solid(820, 660, 180, 320),
      solid(1100, 580, 180, 400),
      solid(1390, 520, 200, 460),
      solid(1700, 680, 180, 300),
      solid(1960, 560, 190, 420),
      solid(2260, 460, 220, 520),
      solid(2580, 680, 190, 300),
      solid(2880, 540, 190, 440),
      solid(3180, 420, 220, 560),
      solid(3510, 620, 190, 360),
      solid(3810, 500, 180, 480),
      solid(4070, 420, 250, 560),
      ledge(260, 680, 70, 18),
      ledge(610, 620, 68, 18),
      ledge(930, 540, 68, 18),
      ledge(1210, 470, 68, 18),
      ledge(1540, 650, 70, 18),
      ledge(1850, 520, 68, 18),
      ledge(2140, 420, 68, 18),
      ledge(2470, 620, 70, 18),
      ledge(2780, 500, 68, 18),
      ledge(3070, 380, 68, 18),
      ledge(3420, 580, 70, 18),
      ledge(3740, 460, 68, 18),
    ],
    movers: [
      mover(1000, 600, 140, 18, { axis: "y", amplitude: 68, speed: 1.3, phase: 0.8, style: "truck" }),
      mover(2300, 500, 140, 18, { axis: "x", amplitude: 160, speed: 1.05, phase: 1.1, style: "truck" }),
      mover(3520, 520, 150, 18, { axis: "y", amplitude: 72, speed: 1.2, phase: 1.9, style: "truck" }),
    ],
    hazards: [
      hazard(360, 800, 120, 120, "water", 30),
      hazard(700, 800, 120, 120, "cactus", 22),
      hazard(1040, 800, 120, 120, "fire", 22, { pulse: true, pulseSpeed: 2.4, pulsePhase: 0.7 }),
      hazard(1460, 800, 110, 120, "water", 30),
      hazard(1840, 800, 110, 120, "mud", 18),
      hazard(2410, 800, 130, 120, "fire", 22, { pulse: true, pulseSpeed: 3.2, pulsePhase: 1.1 }),
      hazard(2890, 800, 120, 120, "water", 30),
      hazard(3340, 800, 120, 120, "cactus", 22),
      hazard(3920, 800, 120, 120, "mud", 18),
    ],
    enemies: [
      enemy("kangaroo", 740, 646, { left: 520, right: 980 }),
      enemy("emu", 1540, 510, { left: 1390, right: 1700 }),
      enemy("bull", 2670, 646, { left: 2480, right: 2960 }),
      enemy("croc", 3600, 612, { left: 3480, right: 3860 }),
    ],
    checkpoints: [checkpoint(2100, 500, "Truck Bed", 2100, 510)],
    collectibles: [
      collectible("snag", 280, 664),
      collectible("beer", 1180, 500, { duration: 8 }),
      collectible("life", 2450, 392),
      collectible("snag", 3200, 360),
      collectible("snag", 3840, 424),
    ],
    decor: [
      { kind: "haulTruck", x: 320, y: 792, scale: 1.2 },
      { kind: "haulTruck", x: 1880, y: 692, scale: 1.3 },
      { kind: "haulTruck", x: 3400, y: 612, scale: 1.4 },
    ],
    boss: null,
    projectiles: [],
  };
}

function buildLevelThirteen() {
  const width = 3920;
  const height = 1080;
  return {
    title: "Superintendent Showdown",
    objective: "Beat the superintendent, break the gate, and get Barry one step closer to work.",
    legend: "Barry took down the big boss and finally cleared the mine gate.",
    truth: "He made it through the whole rotten lap and had one last fight with the bloke who runs the place.",
    theme: {
      skyTop: "#3f536a",
      skyBottom: "#8c6a5f",
      sun: "#efc17f",
      hillFar: "#445562",
      hillNear: "#23303a",
      ground: "#514645",
      groundTop: "#87685a",
      detail: "#141416",
      accent: "#94e0ff",
    },
    spawn: { x: 70, y: 748 },
    checkpoint: { x: 1780, y: 560, label: "Gate Control" },
    finishZone: finish(3580, 470, 130, 220, "EXIT", "portal"),
    world: { width, height },
    backdrop: createBackdrop(143, width, height, { treeCount: 10, treeScale: 1.0, treeStyles: ["dead", "ghost"] }),
    platforms: [
      solid(0, 860, 420, 220),
      solid(580, 760, 200, 320),
      solid(900, 660, 190, 420),
      solid(1210, 560, 210, 520),
      solid(1530, 720, 180, 360),
      solid(1820, 620, 190, 460),
      solid(2120, 500, 210, 580),
      solid(2430, 720, 180, 360),
      solid(2710, 620, 200, 460),
      solid(3020, 540, 190, 540),
      solid(3320, 640, 220, 440),
      solid(3650, 520, 270, 560),
      ledge(340, 720, 72, 18),
      ledge(720, 620, 70, 18),
      ledge(1040, 520, 70, 18),
      ledge(1370, 440, 70, 18),
      ledge(1670, 680, 72, 18),
      ledge(1980, 560, 70, 18),
      ledge(2290, 460, 70, 18),
      ledge(2580, 660, 72, 18),
      ledge(2920, 520, 70, 18),
      ledge(3210, 440, 70, 18),
      ledge(3500, 620, 72, 18),
    ],
    movers: [
      mover(1260, 600, 120, 18, { axis: "y", amplitude: 82, speed: 1.25, phase: 0.7, style: "truck" }),
      mover(2270, 520, 120, 18, { axis: "y", amplitude: 92, speed: 1.15, phase: 1.8, style: "barge" }),
      mover(3140, 600, 120, 18, { axis: "x", amplitude: 120, speed: 1.08, phase: 0.6, style: "truck" }),
    ],
    hazards: [
      hazard(450, 860, 120, 120, "mud", 18),
      hazard(820, 860, 120, 120, "water", 30),
      hazard(1160, 860, 110, 120, "cactus", 22),
      hazard(1550, 860, 120, 120, "fire", 22, { pulse: true, pulseSpeed: 2.2, pulsePhase: 0.3 }),
      hazard(2070, 860, 130, 120, "water", 30),
      hazard(2500, 860, 120, 120, "mud", 18),
      hazard(2970, 860, 120, 120, "fire", 22, { pulse: true, pulseSpeed: 3.0, pulsePhase: 1.1 }),
      hazard(3430, 860, 120, 120, "water", 30),
    ],
    enemies: [
      enemy("trooper", 760, 728, { left: 580, right: 1080 }),
      enemy("policeDog", 1510, 668, { left: 1410, right: 1690 }),
      enemy("magpie", 2230, 470, { left: 2120, right: 2440 }),
      enemy("trooper", 3140, 588, { left: 3020, right: 3340 }),
    ],
    checkpoints: [checkpoint(1780, 560, "Gate Control", 1780, 570)],
    collectibles: [
      collectible("snag", 340, 694),
      collectible("beer", 1290, 500, { duration: 8 }),
      collectible("life", 2330, 420),
      collectible("snag", 2970, 560),
      collectible("snag", 3520, 500),
    ],
    decor: [
      { kind: "mine", x: 260, y: 854, scale: 1.2 },
      { kind: "mine", x: 1510, y: 746, scale: 1.2 },
      { kind: "mine", x: 2750, y: 626, scale: 1.3 },
      { kind: "mine", x: 3490, y: 526, scale: 1.4 },
    ],
    boss: boss("superintendent", 3360, 686, { left: 3240, right: 3640 }),
    projectiles: [],
  };
}

function syncOverlayState() {
  const storyOpen = storyCard && !storyCard.classList.contains("hidden");
  const pauseOpen = pauseCard && !pauseCard.classList.contains("hidden");
  const continueOpen = continueCard && !continueCard.classList.contains("hidden");
  shell.classList.toggle("story-open", storyOpen);
  shell.classList.toggle("modal-open", storyOpen || pauseOpen || continueOpen);
}

function clearTransientInputs() {
  ACTIONS.left = false;
  ACTIONS.right = false;
  ACTIONS.jump = false;
  ACTIONS.use = false;
  ACTIONS.restart = false;
  pressed.left = false;
  pressed.right = false;
  pressed.jump = false;
  pressed.use = false;
  pressed.restart = false;
}

function renderLevelPicker() {
  if (!levelPicker) return;
  levelPicker.innerHTML = "";
  campaignLevels.forEach((entry, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${index + 1}. ${entry.title}`;
    button.addEventListener("click", () => {
      hideLevelPicker();
      loadLevel(index, true);
      state.mode = "interlude";
    });
    levelPicker.appendChild(button);
  });
}

function showLevelPicker() {
  if (!levelPicker) return;
  renderLevelPicker();
  levelPicker.classList.add("active");
  levelPicker.classList.remove("hidden");
  storySecondary?.classList.add("secondary-active");
  syncOverlayState();
}

function hideLevelPicker() {
  if (!levelPicker) return;
  levelPicker.classList.remove("active");
  levelPicker.classList.add("hidden");
  storySecondary?.classList.remove("secondary-active");
  syncOverlayState();
}

function setPauseVisible(visible) {
  if (!pauseCard) return;
  pauseCard.classList.toggle("hidden", !visible);
  syncOverlayState();
}

function setContinueVisible(visible) {
  if (!continueCard) return;
  continueCard.classList.toggle("hidden", !visible);
  syncOverlayState();
}

function hidePauseMenu() {
  setPauseVisible(false);
  clearTransientInputs();
}

function openPauseMenu() {
  if (state.mode !== "playing") return;
  state.mode = "paused";
  clearTransientInputs();
  setPauseVisible(true);
}

function resumeFromPause() {
  if (state.mode !== "paused") return;
  setPauseVisible(false);
  state.mode = "playing";
  clearTransientInputs();
}

function hideContinueMenu() {
  setContinueVisible(false);
  clearTransientInputs();
}

function loadLevel(index, showIntro = true) {
  state.levelIndex = index;
  level = levelFactories[index]();
  level.collectibles ??= [];
  level.projectiles ??= [];
  const runner = level.runner?.enabled ? level.runner : null;
  const spawnLaneIndex = runner ? clamp(runner.spawnLane ?? 1, 0, runner.lanes.length - 1) : 0;
  const spawnY = runner ? runner.lanes[spawnLaneIndex] - player.h : level.spawn.y;
  player.x = level.spawn.x;
  player.y = spawnY;
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
  player.spawnY = spawnY;
  player.runnerLaneIndex = runner ? spawnLaneIndex : 1;
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
      primary: index === 0 ? "Start Mission" : "Continue",
    });
  }
  updateHUD();
}

function showStoryCard({ kicker, title, copy, primary, secondary, showPicker = false }) {
  storyKicker.textContent = kicker;
  storyTitle.textContent = title;
  storyCopy.textContent = copy;
  if (storyPrimary) {
    storyPrimary.textContent = primary ?? "Continue";
  }
  if (storySecondary) {
    const visibleSecondary = Boolean(secondary);
    storySecondary.textContent = secondary ?? "";
    storySecondary.classList.toggle("hidden", !visibleSecondary);
  }
  if (showPicker) {
    showLevelPicker();
  } else {
    hideLevelPicker();
  }
  storyCard.classList.remove("hidden");
  syncOverlayState();
}

function hideStoryCard() {
  storyCard.classList.add("hidden");
  hideLevelPicker();
  syncOverlayState();
}

function showTitleScreen() {
  hidePauseMenu();
  hideContinueMenu();
  loadLevel(0, true);
  state.mode = "title";
  state.lives = STARTING_LIVES;
  state.continues = MAX_CONTINUES;
  state.snags = MAX_SNAGS;
  state.time = 0;
  state.deaths = 0;
  state.completedLevels = 0;
  syncHealthFromSnags();
  missionTitle.textContent = "GLA: Grand Lap Australia";
  missionObjective.textContent = "Barry is trying to get to work. Australia is not making it easy.";
  vehicleStatus.textContent = "Checkpoint 1 | Falls 0";
  troubleLabel.textContent = "Trouble !";
  dashLabel.textContent = "Jump";
  showStoryCard({
    kicker: "Start Of Swing",
    title: "Barry Lawson is already running late for site.",
    copy: "Barry is a diesel fitter driving out to the mine when he hits a roo, wrecks the ute, gets no reception, and starts walking into the bush. Controls: A/D or arrows move, Space or W jumps twice, and R resets. Barry starts with five snags and loses one every time he gets hit. Boxing roo tokens give extra lives.",
    primary: "Start Mission",
    secondary: "Test Levels",
    showPicker: false,
  });
}

function startGame() {
  hideStoryCard();
  hidePauseMenu();
  hideContinueMenu();
  state.mode = "playing";
  state.time = 0;
  state.deaths = 0;
  state.completedLevels = 0;
  state.lives = STARTING_LIVES;
  state.continues = MAX_CONTINUES;
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
      kicker: "The Truth",
      title: "Barry still isn't at work.",
      copy: "He survived the wreck, the bush, the pub brawl, the rail yard, the river, the mine gate, and the superintendent. He is filthy, rattled, and somehow still late.",
      primary: "Back To Title",
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
    if (state.continues > 0) {
      showContinueCard(reason);
    } else {
      gameOver(reason);
    }
    return;
  }
  restartLevel();
  showMessage(`${reason} ${state.lives} lives left.`, 1.6);
}

function showContinueCard(reason) {
  hideStoryCard();
  hidePauseMenu();
  state.mode = "continue";
  if (continueCopy) {
    continueCopy.textContent = `${reason} Use one continue to keep going from the last checkpoint. ${state.continues} continue${state.continues === 1 ? "" : "s"} left.`;
  }
  setContinueVisible(true);
}

function gameOver(reason) {
  state.mode = "gameover";
  hideStoryCard();
  hidePauseMenu();
  hideContinueMenu();
  showStoryCard({
    kicker: "Wasted Lap",
    title: "Barry is out of lives.",
    copy: `${reason} The boxing kangaroo stash is gone and the Hilux is not walking itself home.`,
    primary: "Try Again",
    secondary: "Back To Title",
  });
}

storyPrimary?.addEventListener("click", () => {
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

storySecondary?.addEventListener("click", () => {
  if (state.mode === "title") {
    if (levelPicker?.classList.contains("hidden")) {
      showLevelPicker();
      storySecondary.textContent = "Hide Levels";
    } else {
      hideLevelPicker();
      storySecondary.textContent = "Test Levels";
    }
    return;
  }

  if (state.mode === "gameover" || state.mode === "victory" || state.mode === "ending") {
    state.completedLevels = 0;
    showTitleScreen();
  }
});

pauseButton?.addEventListener("click", () => {
  if (state.mode === "playing") {
    openPauseMenu();
  } else if (state.mode === "paused") {
    resumeFromPause();
  }
});

pauseResume?.addEventListener("click", resumeFromPause);
pauseRestart?.addEventListener("click", () => {
  hidePauseMenu();
  restartLevel();
  state.mode = "playing";
});
pauseQuit?.addEventListener("click", () => {
  hidePauseMenu();
  state.completedLevels = 0;
  showTitleScreen();
});

continueButton?.addEventListener("click", () => {
  if (state.continues <= 0) {
    hideContinueMenu();
    gameOver("No continues left.");
    return;
  }
  state.continues -= 1;
  hideContinueMenu();
  state.lives = STARTING_LIVES;
  state.snags = MAX_SNAGS;
  syncHealthFromSnags();
  restartLevel();
  state.mode = "playing";
  showMessage("Continue used. Barry keeps trucking.");
});

continueQuit?.addEventListener("click", () => {
  hideContinueMenu();
  state.completedLevels = 0;
  showTitleScreen();
});

window.addEventListener("keydown", (event) => {
  if (event.code !== "Escape" && event.code !== "KeyP") return;
  event.preventDefault();
  if (state.mode === "playing") {
    openPauseMenu();
  } else if (state.mode === "paused") {
    resumeFromPause();
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
  if (level.runner?.enabled) {
    player.vx = Math.max(player.vx, level.runner.speed * 0.78);
    player.vx += -player.facing * knockback * 0.12;
  } else {
    player.vx += -player.facing * knockback * 0.65;
  }
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
      title: "Barry still isn't at work.",
      copy: "He survived the wreck, the bush, the pub brawl, the rail yard, the river, the mine gate, and the superintendent. Barry is filthy, rattled, and somehow still late for site.",
      primary: "Back To Title",
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
    primary: "Continue",
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

  if (pressed.jump) {
    player.jumpBuffer = 0.16;
  }

  const runner = level?.runner?.enabled ? level.runner : null;
  if (runner) {
    const laneShift = (pressed.right ? 1 : 0) - (pressed.left ? 1 : 0);
    if (laneShift !== 0) {
      player.runnerLaneIndex = clamp(player.runnerLaneIndex + laneShift, 0, runner.lanes.length - 1);
      player.y = runner.lanes[player.runnerLaneIndex] - player.h;
      player.vy = 0;
      player.onGround = true;
      player.ground = null;
      player.coyote = 0.1;
      showMessage(laneShift > 0 ? "Barry swaps to the next rail." : "Barry cuts back a lane.", 0.85);
    }
    pressed.left = false;
    pressed.right = false;
    player.facing = 1;
    player.vx = runner.speed;
  } else {
    const moveIntent = (ACTIONS.right ? 1 : 0) - (ACTIONS.left ? 1 : 0);
    if (moveIntent !== 0) {
      player.facing = moveIntent;
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
  }

  player.vy += 2400 * dt;
  player.vy = clamp(player.vy, -1200, 1000);

  moveEntity(player, dt, level.platforms, level.movers);

  if (runner) {
    for (const train of level.movers) {
      if (train.style !== "train") continue;
      if (!rectsIntersect(rectLike(player), train)) continue;
      hurtPlayer(24, "The train slams Barry sideways.", 260);
      break;
    }
  }

  if (player.onGround) {
    player.coyote = 0.11;
    player.jumpsUsed = 0;
    if (runner) {
      const laneY = runner.lanes[player.runnerLaneIndex] - player.h;
      player.y = laneY;
    }
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
    if (platform.style === "train") {
      const dir = platform.travelDir ?? -1;
      const speed = platform.travelSpeed ?? 130;
      platform.x += dir * speed * dt;
      platform.y = platform.startY + platform.offset;
      const wrapPadding = platform.loopPadding ?? 420;
      const wrapDistance = platform.loopDistance ?? (level.world.width + 920);
      if (dir < 0 && platform.x + platform.w < -wrapPadding) {
        platform.x += wrapDistance;
      } else if (dir > 0 && platform.x > level.world.width + wrapPadding) {
        platform.x -= wrapDistance;
      }
    } else if (platform.axis === "x") {
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
    } else if (foe.type === "snake" || foe.type === "goanna" || foe.type === "croc") {
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

  if (foe.projectileKind !== "none" && foe.throwCooldown <= 0 && distToPlayer < 470) {
    spawnBossProjectile(foe);
    foe.throwCooldown = foe.type === "cultist" ? 1.25 : foe.type === "dockcop" ? 1.45 : foe.type === "bikie" ? 1.05 : 1.6;
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
    if (foe.projectileKind === "bottle") {
      level.projectiles.push({
        x: foe.x + (foe.dir > 0 ? foe.w - 4 : -14),
        y: foe.y + 6,
        w: 8,
        h: 16,
        vx: foe.dir * foe.projectileSpeed,
        vy: -120,
        gravity: 360,
        life: 3.6,
        color: foe.projectileColor,
        kind: foe.projectileKind,
      });
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
    foe.type === "roo" ? 24 : foe.type === "farmer" ? 38 : foe.type === "bull" ? 34 : foe.type === "croc" ? 28 : foe.type === "superintendent" ? 34 : 32;
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
    if (type === "bikie") return "Barry knocks the bikie off his line.";
    if (type === "bull") return "Barry bounces clean over the bull.";
    if (type === "croc") return "Barry hops the croc and keeps moving.";
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
    if (type === "bikie") return "The bikie swings like the pub owes him money.";
    if (type === "bull") return "The bull treats Barry like a fence post.";
    if (type === "croc") return "The croc snaps from the bank.";
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
  if (type === "bikie") return "The bikie boss throws a wild punch.";
  if (type === "bull") return "The bull boss lowers the head and commits.";
  if (type === "croc") return "The croc boss launches from the waterline.";
  if (type === "superintendent") return "The superintendent is sick of Barry already.";
  return "The boss has a strong opinion about Barry.";
}

function bossProjectileLine(kind) {
    if (kind === "shotgun") return "The farmer cuts loose with the shotgun.";
    if (kind === "shot") return "A small bullet zips straight in.";
    if (kind === "baton") return "A baton comes spinning out of the dark.";
    if (kind === "bottle") return "A bottle comes flying off the pub floor.";
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
  if (kind === "barrier") return "The rail barrier has no interest in Barry's schedule.";
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
  camera.x = clamp(targetX, 0, Math.max(0, level.world.width - VIEW.width));
  if (level?.runner?.enabled) {
    camera.y = level.runner.cameraY ?? 0;
  } else {
    const targetY = player.y + player.h / 2 - VIEW.height / 2;
    camera.y = clamp(targetY, 0, Math.max(0, level.world.height - VIEW.height));
  }
}

function updateHUD() {
  healthFill.style.width = `${state.health}%`;
  troubleLabel.textContent = `Trouble ${"!".repeat(state.levelIndex + 1)}`;
  dashLabel.textContent = level?.runner?.enabled ? "Rail Run" : "Jump";
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
  if (level.runner?.enabled) {
    return "Barry runs by himself. Use left and right to change lanes, then jump over barriers and trains.";
  }
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

  if (level.backdrop.kind === "railyard") {
    drawRailYardBackdrop();
    ctx.restore();
    return;
  }

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

function drawRailYardBackdrop() {
  ctx.save();
  ctx.translate(-camera.x * 0.12, -camera.y * 0.05);

  const yardGlow = ctx.createLinearGradient(0, VIEW.height * 0.1, 0, VIEW.height);
  yardGlow.addColorStop(0, "rgba(255,255,255,0)");
  yardGlow.addColorStop(0.54, "rgba(178, 214, 224, 0.08)");
  yardGlow.addColorStop(1, "rgba(16, 18, 24, 0.28)");
  ctx.fillStyle = yardGlow;
  ctx.fillRect(0, 0, level.world.width, level.world.height);

  ctx.fillStyle = "rgba(27, 30, 36, 0.55)";
  ctx.fillRect(-120, level.world.height - 210, level.world.width + 240, 16);
  ctx.fillRect(-120, level.world.height - 170, level.world.width + 240, 8);

  for (const shed of level.backdrop.railSheds ?? []) {
    const x = shed.x;
    const y = shed.y;
    ctx.fillStyle = "rgba(28, 30, 34, 0.78)";
    ctx.fillRect(x, y, shed.w, shed.h);
    ctx.fillStyle = "rgba(246, 207, 96, 0.08)";
    for (let i = 0; i < shed.roofs; i++) {
      const ry = y - 10 - i * 6;
      ctx.beginPath();
      ctx.moveTo(x + 10 + i * 6, ry + 2);
      ctx.lineTo(x + shed.w * 0.5, ry - 12);
      ctx.lineTo(x + shed.w - 12 - i * 6, ry + 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "rgba(219, 188, 116, 0.12)";
    ctx.fillRect(x + 8, y + 6, shed.w - 16, 3);
  }

  for (const stack of level.backdrop.railStacks ?? []) {
    ctx.fillStyle = stack.tint;
    ctx.fillRect(stack.x, stack.y - stack.h, stack.w, stack.h);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(stack.x + 3, stack.y - stack.h + 3, stack.w - 6, 2);
    ctx.fillRect(stack.x + 3, stack.y - stack.h + 10, stack.w - 6, 2);
  }

  for (const pole of level.backdrop.railPoles ?? []) {
    ctx.fillStyle = "rgba(34, 37, 42, 0.92)";
    ctx.fillRect(pole.x, pole.y - pole.h, 4, pole.h);
    ctx.fillRect(pole.x - 8, pole.y - pole.h + 8, 20, 3);
    ctx.fillRect(pole.x - 12, pole.y - pole.h + 28, 28, 2);
    ctx.strokeStyle = "rgba(98, 103, 114, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pole.x + 2, pole.y - pole.h + 8);
    ctx.lineTo(pole.x + 24, pole.y - pole.h - 18);
    ctx.stroke();
  }

  for (const gantry of level.backdrop.railGantries ?? []) {
    const top = gantry.y;
    const left = gantry.x;
    ctx.fillStyle = "rgba(22, 25, 30, 0.94)";
    ctx.fillRect(left, top - gantry.h, 10, gantry.h);
    ctx.fillRect(left + gantry.w - 10, top - gantry.h, 10, gantry.h);
    ctx.fillRect(left + 10, top - gantry.h + 10, gantry.w - 20, 8);
    ctx.strokeStyle = "rgba(115, 121, 132, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left + 10, top - gantry.h + 20);
    ctx.lineTo(left + gantry.w - 10, top - gantry.h + 20);
    ctx.stroke();
    ctx.strokeStyle = "rgba(90, 96, 106, 0.35)";
    ctx.beginPath();
    ctx.moveTo(left + 18, top - gantry.h + 10);
    ctx.lineTo(left + gantry.w - 18, top - gantry.h + 10);
    ctx.stroke();
  }

  for (const light of level.backdrop.railLights ?? []) {
    ctx.fillStyle = "rgba(38, 40, 45, 0.9)";
    ctx.fillRect(light.x, light.y - 34, 4, 34);
    ctx.beginPath();
    ctx.arc(light.x + 2, light.y - 38, light.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 230, 160, 0.32)";
    ctx.fill();
    ctx.fillStyle = "#f3d67a";
    ctx.beginPath();
    ctx.arc(light.x + 2, light.y - 38, light.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 7; i++) {
    const x = 120 + i * 1800 - (camera.x * 0.02 % 1800);
    const baseY = level.world.height - 108 - (i % 2) * 12;
    ctx.fillStyle = "rgba(27, 29, 33, 0.88)";
    ctx.fillRect(x, baseY, 240, 32);
    ctx.fillStyle = "rgba(242, 208, 108, 0.1)";
    ctx.fillRect(x + 12, baseY + 6, 64, 4);
    ctx.fillRect(x + 92, baseY + 6, 48, 4);
    ctx.fillRect(x + 154, baseY + 6, 64, 4);
    ctx.fillStyle = "rgba(87, 93, 101, 0.22)";
    ctx.fillRect(x + 28, baseY - 44, 12, 44);
    ctx.fillRect(x + 202, baseY - 44, 12, 44);
  }

  ctx.strokeStyle = "rgba(70, 72, 80, 0.36)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-100, level.world.height - 82);
  ctx.lineTo(level.world.width + 100, level.world.height - 82);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-100, level.world.height - 66);
  ctx.lineTo(level.world.width + 100, level.world.height - 66);
  ctx.stroke();

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
    } else if (item.kind === "pubInterior") {
      drawPubInterior(item);
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
    } else if (item.kind === "pub") {
      drawPub(item);
    } else if (item.kind === "harley") {
      drawHarley(item);
    } else if (item.kind === "rail") {
      drawRailYard(item);
    } else if (item.kind === "showground") {
      drawShowground(item);
    } else if (item.kind === "fence") {
      drawFenceLine(item);
    } else if (item.kind === "roadhouse") {
      drawRoadhouse(item);
    } else if (item.kind === "mine") {
      drawMine(item);
    } else if (item.kind === "haulTruck") {
      drawHaulTruck(item);
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

function drawPub(item) {
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  const w = 78 * (item.scale ?? 1);
  const h = 46 * (item.scale ?? 1);
  ctx.fillStyle = "#4b3226";
  ctx.fillRect(x, y - h, w, h);
  ctx.fillStyle = "#d7c08f";
  ctx.fillRect(x + 6, y - h + 8, w - 12, 8);
  ctx.fillStyle = "#8b5c34";
  ctx.fillRect(x + 12, y - h + 18, w - 24, h - 24);
  ctx.fillStyle = "#f3e0b0";
  ctx.fillRect(x + 20, y - h + 23, 20, 14);
  ctx.fillRect(x + 46, y - h + 23, 14, 14);
}

function drawPubInterior(item) {
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  const scale = item.scale ?? 1;
  const w = 92 * scale;
  const h = 58 * scale;
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.fillRect(x + 8, y - h + 12, w, h);
  ctx.fillStyle = "#6a4b36";
  ctx.fillRect(x, y - h, w, h);
  ctx.fillStyle = "#d7bc7a";
  ctx.fillRect(x + 10, y - h + 6, w - 20, 8);
  ctx.fillStyle = "#3a2518";
  ctx.fillRect(x + 12, y - h + 16, w - 24, 8);
  ctx.fillStyle = "#8f6d48";
  ctx.fillRect(x + 16, y - h + 26, w - 32, 20);
  ctx.fillStyle = "#f4dfad";
  ctx.fillRect(x + 22, y - h + 30, 14, 8);
  ctx.fillRect(x + 40, y - h + 30, 14, 8);
  ctx.fillRect(x + 58, y - h + 30, 14, 8);
  ctx.fillStyle = "#2a1d17";
  ctx.fillRect(x + 18, y - h + 48, w - 36, 4);
  ctx.fillStyle = "#4a3326";
  ctx.fillRect(x + 12, y - h + 52, w - 24, 4);
}

function drawHarley(item) {
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  const scale = item.scale ?? 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(24, 4, 26, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2c2b30";
  ctx.beginPath();
  ctx.arc(12, 4, 7, 0, Math.PI * 2);
  ctx.arc(44, 4, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d6c2a1";
  ctx.fillRect(14, -14, 8, 10);
  ctx.fillRect(22, -6, 18, 5);
  ctx.fillRect(36, -14, 8, 10);
  ctx.fillStyle = "#50392c";
  ctx.fillRect(18, -8, 18, 4);
  ctx.fillStyle = "#aa2f3a";
  ctx.fillRect(26, -16, 10, 4);
  ctx.fillStyle = "#6f7f91";
  ctx.fillRect(12, -8, 6, 3);
  ctx.fillRect(42, -8, 6, 3);
  ctx.restore();
}

function drawRailYard(item) {
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  const w = 96 * (item.scale ?? 1);
  ctx.fillStyle = "#4d4b49";
  ctx.fillRect(x, y - 14, w, 14);
  ctx.fillStyle = "#7e633f";
  ctx.fillRect(x + 4, y - 24, 10, 24);
  ctx.fillRect(x + w - 14, y - 24, 10, 24);
  ctx.strokeStyle = "#cab47d";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 10, y - 8);
  ctx.lineTo(x + w - 10, y - 8);
  ctx.stroke();
}

function drawShowground(item) {
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  const scale = item.scale ?? 1;
  ctx.fillStyle = "#5d7a53";
  ctx.fillRect(x, y - 16 * scale, 92 * scale, 16 * scale);
  ctx.fillStyle = "#d7b050";
  ctx.beginPath();
  ctx.arc(x + 18 * scale, y - 22 * scale, 12 * scale, 0, Math.PI * 2);
  ctx.arc(x + 38 * scale, y - 22 * scale, 12 * scale, 0, Math.PI * 2);
  ctx.arc(x + 58 * scale, y - 22 * scale, 12 * scale, 0, Math.PI * 2);
  ctx.fill();
}

function drawFenceLine(item) {
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  const w = 84 * (item.scale ?? 1);
  ctx.fillStyle = "#7f5f3b";
  ctx.fillRect(x + 6, y - 26, 4, 26);
  ctx.fillRect(x + w - 10, y - 26, 4, 26);
  ctx.fillStyle = "#c9ab77";
  ctx.fillRect(x, y - 18, w, 4);
  ctx.fillRect(x, y - 8, w, 4);
}

function drawRoadhouse(item) {
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  const scale = item.scale ?? 1;
  ctx.fillStyle = "#53414d";
  ctx.fillRect(x, y - 42 * scale, 88 * scale, 42 * scale);
  ctx.fillStyle = "#f0c05c";
  ctx.fillRect(x + 6, y - 50 * scale, 76 * scale, 10 * scale);
  ctx.fillStyle = "#db5c4d";
  ctx.fillRect(x + 18, y - 30 * scale, 18 * scale, 20 * scale);
  ctx.fillRect(x + 44, y - 30 * scale, 18 * scale, 20 * scale);
}

function drawMine(item) {
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  const scale = item.scale ?? 1;
  ctx.fillStyle = "#434046";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 22 * scale, y - 46 * scale);
  ctx.lineTo(x + 44 * scale, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c9b08a";
  ctx.fillRect(x + 16 * scale, y - 8 * scale, 12 * scale, 8 * scale);
}

function drawHaulTruck(item) {
  const x = item.x - camera.x;
  const y = item.y - camera.y;
  const scale = item.scale ?? 1;
  ctx.fillStyle = "#7a5a33";
  ctx.fillRect(x, y - 18 * scale, 62 * scale, 18 * scale);
  ctx.fillStyle = "#d3ac5a";
  ctx.fillRect(x + 8 * scale, y - 28 * scale, 24 * scale, 12 * scale);
  ctx.fillStyle = "#2d2a2f";
  ctx.beginPath();
  ctx.arc(x + 14 * scale, y, 8 * scale, 0, Math.PI * 2);
  ctx.arc(x + 48 * scale, y, 8 * scale, 0, Math.PI * 2);
  ctx.fill();
}

function drawMovingPlatforms() {
  for (const platform of level.movers) {
    if (!isVisible(platform)) continue;
    const x = platform.x - camera.x;
    const y = platform.y - camera.y;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(x + 4, y + 6, platform.w, platform.h);
    ctx.fillStyle =
      platform.style === "boat"
        ? "#4f6f7b"
        : platform.style === "truck"
          ? "#6c4f3b"
          : platform.style === "ute"
            ? "#617864"
            : platform.style === "train"
              ? "#f0c92c"
              : "#7a6a56";
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
  } else if (platform.style === "train") {
    const facingLeft = (platform.travelDir ?? -1) < 0;
    ctx.save();
    if (!facingLeft) {
      ctx.translate(x + platform.w, y);
      ctx.scale(-1, 1);
      x = 0;
      y = 0;
    }

    const roofY = y - 16;
    const bodyY = y - 6;
    const bodyH = platform.h + 12;
    const cabW = Math.max(26, Math.min(44, platform.w * 0.18));
    const windowCount = Math.max(2, Math.floor((platform.w - 70) / 50));

    ctx.fillStyle = "#2b2e34";
    ctx.fillRect(x + 8, y + platform.h - 2, platform.w - 16, 8);
    ctx.fillStyle = "#1a1c21";
    ctx.fillRect(x + 10, y + platform.h + 4, platform.w - 20, 3);

    ctx.fillStyle = "#f0c92c";
    ctx.fillRect(x + 8, bodyY, platform.w - 16, bodyH);
    ctx.fillStyle = "#e4b923";
    ctx.fillRect(x + 8, bodyY + 4, platform.w - 16, 8);

    ctx.fillStyle = "#414651";
    ctx.fillRect(x + 14, roofY, platform.w - 28, 10);
    ctx.fillRect(x + 20, roofY - 4, platform.w - 40, 4);

    ctx.fillStyle = "#f7efe0";
    ctx.fillRect(x + 18, bodyY + 11, platform.w - 36, 4);

    ctx.fillStyle = "#121419";
    for (let i = 0; i < windowCount; i++) {
      const px = x + 34 + i * 50;
      if (px + 24 > x + platform.w - 22) break;
      ctx.fillRect(px, bodyY + 10, 24, 14);
      ctx.fillStyle = "#6eb7ff";
      ctx.fillRect(px + 3, bodyY + 13, 9, 7);
      ctx.fillStyle = "#121419";
    }

    ctx.fillStyle = "#d0ad29";
    ctx.beginPath();
    ctx.moveTo(x + 2, bodyY + 1);
    ctx.lineTo(x + cabW, bodyY - 12);
    ctx.lineTo(x + cabW, bodyY + bodyH - 4);
    ctx.lineTo(x + 6, bodyY + bodyH - 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#f6f2dd";
    ctx.fillRect(x + 8, bodyY + 16, platform.w - 32, 3);
    ctx.fillStyle = "#9db3c0";
    ctx.fillRect(x + 24, bodyY + 14, 22, 10);
    ctx.fillRect(x + platform.w * 0.45, bodyY + 14, 24, 10);

    ctx.fillStyle = "#ffeaa0";
    ctx.fillRect(x + 12, bodyY + 18, 7, 5);
    ctx.fillStyle = "#fff3bf";
    ctx.fillRect(x + 14, bodyY + 4, 7, 5);

    const wheelYs = [y + platform.h + 1, y + platform.h + 5];
    const wheelXs = [x + 24, x + 66, x + platform.w - 70, x + platform.w - 28];
    ctx.fillStyle = "#111215";
    for (const wx of wheelXs) {
      for (const wy of wheelYs) {
        ctx.beginPath();
        ctx.arc(wx, wy, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = "#525862";
    ctx.fillRect(x + 18, y + platform.h - 6, platform.w - 36, 3);
    ctx.restore();
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

    if (trap.hazardKind === "barrier") {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(x + 4, y + 6, trap.w, trap.h);
      ctx.fillStyle = "#4a3f38";
      ctx.fillRect(x, y, trap.w, trap.h);
      ctx.fillStyle = "#f1d35f";
      ctx.fillRect(x + 4, y + 4, trap.w - 8, 4);
      ctx.fillStyle = "#f7f0de";
      ctx.fillRect(x + 8, y + 10, trap.w - 16, 10);
      ctx.fillStyle = "#de9c33";
      ctx.fillRect(x + 6, y + 22, trap.w - 12, 4);
      ctx.fillStyle = "#212126";
      ctx.fillRect(x + 10, y + 28, trap.w - 20, 2);
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
      } else if (foe.type === "croc") {
        drawCroc(foe);
      } else if (foe.type === "snake" || foe.type === "goanna") {
        drawSnake(foe);
      } else if (foe.type === "trooper" || foe.type === "cultist" || foe.type === "cropguard") {
        drawTrooper(foe);
      } else if (foe.type === "emu") {
        drawEmu(foe);
      } else if (foe.type === "bikie") {
        drawBikie(foe);
      } else if (foe.type === "bull") {
        drawBull(foe);
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
    } else if (shot.kind === "bottle") {
      ctx.fillRect(x + 3, y + 2, 4, 12);
      ctx.fillStyle = "#dff5d2";
      ctx.fillRect(x + 4, y + 1, 2, 2);
      ctx.fillStyle = "#f6ca8a";
      ctx.fillRect(x + 2, y + 12, 6, 3);
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
  ctx.ellipse(0, foe.h / 2 + 4, Math.max(13, foe.w * 0.3), 6, 0, 0, Math.PI * 2);
  ctx.fill();

  if (foe.type === "roo") {
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
  } else if (foe.type === "cop" || foe.type === "dockcop" || foe.type === "sergeant") {
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
  } else if (foe.type === "groom") {
    ctx.fillStyle = "#2f313a";
    ctx.fillRect(-12, -8 + bob, 24, 18);
    ctx.fillStyle = "#f3e5bf";
    ctx.fillRect(-2, -8 + bob, 4, 18);
    ctx.fillStyle = "#8b5f39";
    ctx.fillRect(10, -4 + bob, 8, 4);
  } else if (foe.type === "bikie") {
    ctx.scale(1.38, 1.38);
    ctx.fillStyle = "#423948";
    ctx.fillRect(-13, -8 + bob, 26, 19);
    ctx.fillStyle = "#e2e2e2";
    ctx.fillRect(-7, -26 + bob, 14, 6);
    ctx.fillStyle = "#f2d05f";
    ctx.fillRect(-4, -20 + bob, 8, 8);
    ctx.fillStyle = "#2c2220";
    ctx.fillRect(10, -3 + bob, 14, 3);
    ctx.fillRect(18, -5 + bob, 5, 2);
  } else if (foe.type === "bull") {
    ctx.fillStyle = "#5c3923";
    ctx.beginPath();
    ctx.ellipse(0, 2 + bob, 16, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d7a15d";
    ctx.fillRect(-10, -16 + bob, 20, 14);
    ctx.fillStyle = "#2c241c";
    ctx.fillRect(-18, -20 + bob, 6, 10);
    ctx.fillRect(12, -20 + bob, 6, 10);
    ctx.fillStyle = "#f8efe2";
    ctx.fillRect(-14, -18 + bob, 4, 4);
    ctx.fillRect(10, -18 + bob, 4, 4);
  } else if (foe.type === "croc") {
    ctx.fillStyle = "#3d7341";
    ctx.beginPath();
    ctx.moveTo(-20, 4 + bob);
    ctx.lineTo(-2, -8 + bob);
    ctx.lineTo(20, -7 + bob);
    ctx.lineTo(24, 1 + bob);
    ctx.lineTo(8, 7 + bob);
    ctx.lineTo(-16, 8 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#7db45d";
    ctx.fillRect(-10, -1 + bob, 28, 4);
    ctx.fillStyle = "#15331f";
    ctx.fillRect(17, -2 + bob, 9, 3);
    ctx.fillRect(22, -3 + bob, 4, 2);
    ctx.fillStyle = "#d9edd2";
    ctx.fillRect(20, -2 + bob, 2, 1);
  } else if (foe.type === "superintendent") {
    ctx.fillStyle = "#24344c";
    ctx.fillRect(-12, -10 + bob, 24, 22);
    ctx.fillStyle = "#f7e8b6";
    ctx.fillRect(-8, -26 + bob, 16, 8);
    ctx.fillStyle = "#f3b74f";
    ctx.fillRect(-11, -2 + bob, 22, 4);
    ctx.fillStyle = "#e35b4a";
    ctx.fillRect(9, -4 + bob, 8, 3);
    ctx.fillStyle = "#d4b06b";
    ctx.fillRect(-2, -6 + bob, 4, 16);
  }

  if (foe.type !== "bull" && foe.type !== "croc") {
    ctx.fillStyle = "#bb8d62";
    ctx.fillRect(-6, -21 + bob, 12, 10);
    ctx.fillStyle = "#1d1711";
    ctx.fillRect(-6, -20 + bob, 2, 2);
    ctx.fillRect(4, -20 + bob, 2, 2);
    ctx.fillStyle = "#2b241f";
    ctx.fillRect(-13, 16 + bob, 7, 12);
    ctx.fillRect(6, 16 + bob, 7, 12);
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

function drawBikie(foe) {
  const x = foe.x - camera.x;
  const y = foe.y - camera.y;
  const bob = Math.sin(state.time * 12 + foe.x * 0.06) * 1.2;
  ctx.save();
  ctx.translate(x + foe.w / 2, y + foe.h / 2);
  ctx.scale(foe.dir, 1);
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.beginPath();
  ctx.ellipse(0, foe.h / 2 + 4, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4d4a57";
  ctx.fillRect(-11, -8 + bob, 22, 16);
  ctx.fillStyle = "#dedede";
  ctx.fillRect(-5, -24 + bob, 10, 7);
  ctx.fillStyle = "#ffcc5b";
  ctx.fillRect(-3, -20 + bob, 6, 5);
  ctx.fillStyle = "#221d1c";
  ctx.fillRect(8, -3 + bob, 12, 3);
  ctx.fillRect(14, -5 + bob, 4, 2);
  ctx.fillStyle = "#a98158";
  ctx.fillRect(-7, 8 + bob, 5, 10);
  ctx.fillRect(2, 8 + bob, 5, 10);
  ctx.restore();
}

function drawBull(foe) {
  const x = foe.x - camera.x;
  const y = foe.y - camera.y;
  const bob = Math.sin(state.time * 9 + foe.x * 0.04) * 1;
  ctx.save();
  ctx.translate(x + foe.w / 2, y + foe.h / 2);
  ctx.scale(foe.dir, 1);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(0, foe.h / 2 + 4, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6f452d";
  ctx.beginPath();
  ctx.ellipse(0, -1 + bob, 16, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#9b6540";
  ctx.fillRect(-10, -12 + bob, 20, 10);
  ctx.fillStyle = "#2e241f";
  ctx.fillRect(-18, -16 + bob, 6, 10);
  ctx.fillRect(12, -16 + bob, 6, 10);
  ctx.fillStyle = "#f5e7c5";
  ctx.fillRect(-14, -14 + bob, 4, 4);
  ctx.fillRect(10, -14 + bob, 4, 4);
  ctx.fillStyle = "#2f1d15";
  ctx.fillRect(-5, 8 + bob, 4, 12);
  ctx.fillRect(1, 8 + bob, 4, 12);
  ctx.restore();
}

function drawCroc(foe) {
  const x = foe.x - camera.x;
  const y = foe.y - camera.y;
  const bob = Math.sin(state.time * 8 + foe.x * 0.05) * 1.4;
  ctx.save();
  ctx.translate(x + foe.w / 2, y + foe.h / 2);
  ctx.scale(foe.dir, 1);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(0, foe.h / 2 + 2, 17, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#305f34";
  ctx.beginPath();
  ctx.moveTo(-20, 1 + bob);
  ctx.lineTo(-6, -8 + bob);
  ctx.lineTo(14, -7 + bob);
  ctx.lineTo(24, -1 + bob);
  ctx.lineTo(10, 5 + bob);
  ctx.lineTo(-16, 6 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#76ad55";
  ctx.fillRect(-12, -1 + bob, 28, 3);
  ctx.fillStyle = "#17361f";
  ctx.fillRect(16, -2 + bob, 10, 3);
  ctx.fillRect(22, -3 + bob, 4, 2);
  ctx.fillStyle = "#e8efd7";
  ctx.fillRect(20, -2 + bob, 2, 1);
  ctx.fillStyle = "#254725";
  ctx.fillRect(-8, 5 + bob, 4, 3);
  ctx.fillRect(0, 5 + bob, 4, 3);
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

  const frozen = state.mode === "paused" || state.mode === "continue";
  if (!frozen) {
    state.time += dt;
  }
  if (!frozen && state.messageTimer > 0) {
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
  } else if (!frozen) {
    updateMovingPlatforms(dt, state.time);
    updateCamera();
    updateHUD();
  } else {
    updateHUD();
  }

  drawFrame();
  updateMiniMap();

  pressed.left = false;
  pressed.right = false;
  pressed.jump = false;
  pressed.restart = false;

  requestAnimationFrame(tick);
}

showTitleScreen();
updateHUD();
drawFrame();
updateMiniMap();
requestAnimationFrame(tick);

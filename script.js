const groupSelect = document.getElementById('groupSelect');

// --- Simulation Configuration and State ---
const CELL_SIZE = 4;  // pixel size of each cell square (adjust as desired)
// The grid and ants state will be initialized in resetSimulation()
let gridWidth, gridHeight, colorCount;
let grid = [];   // 2D array for cell colors (state IDs)
let ants = [];   // list of ant objects: { x, y, dir, group }
// Direction encoding for ants: 0=up, 1=right, 2=down, 3=left (clockwise)
// Turn instruction mappings: 'L' = -90°, 'R' = +90°, 'S' = straight (0°), 'U' = 180°
const turnDelta = { 'L': -1, 'R': 1, 'S': 0, 'U': 2 };

const colorMap = {
    0: "#000000", 1: "#FFFFFF", 2: "#FFFF00", 3: "#FF00FF",
    4: "#00FFFF", 5: "#FFA500", 6: "#800080", 7: "#808080",
    8: "#FFC0CB", 9: "#008080", 10: "#FF4500", 11: "#00FF00",
    12: "#0000FF", 13: "#A52A2A", 14: "#D2691E", 15: "#8B4513",
    16: "#B22222", 17: "#FF6347", 18: "#4682B4", 19: "#ADFF2F",
    20: "#7FFF00"
}

// Ant group definitions: each group has a name, a display color for the ant, and will get a ruleset.
let antGroups = [];
initGroups();  // Initialize the default groups (e.g., Langton's ant)

// --- Simulation Control Flags ---
let isRunning = false;
let tickRate = 10;                    // ticks per second (controlled by speed slider)
let tickInterval = 1000 / tickRate;   // ms per tick (will update when tickRate changes)
let lastFrameTime = 0;
let accumulator = 0;                 // accumulator for fixed-timestep loop

// --- View (Zoom/Pan) State ---
let scale = 1;       // current zoom level (1 = 100%)
let panX = 0, panY = 0;   // current pan translation (in pixels)
let isDragging = false;
let dragStartX, dragStartY, panStartX, panStartY;

// Canvas contexts
const gridCanvas = document.getElementById('gridCanvas');
const gridCtx = gridCanvas.getContext('2d');

function randomHexColour() {
    return '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0');
}

function initGroups() {
    // Initialize the ant groups with random colors and rules
    const initial = {
        name: "Langton's ant",
        color: "#FF0000",
        rules: []
    };
    for (let state = 0; state < colorCount; state++) {
        let turnInstruction = state % 2 === 0 ? 'R' : 'L';  // alternate R, L (starting with R at state 0)
        const newColor = (state + 1) % colorCount;
        initial.rules.push({ turn: turnInstruction, newColor: newColor });
    }
    antGroups.push(initial);  // add the first group (Langton's ant)

    const opt = document.createElement('option');
    opt.value = 0;  // index of the group
    opt.textContent = initial.name;
    groupSelect.appendChild(opt);
}

function makeRandomGroup() {
    const gIndex = antGroups.length + 1;
    const rules = [];
    const turns = Object.keys(turnDelta);  // ['L', 'R', 'S', 'U']
    for (let s = 0; s < colorCount; s++) {
        let turn = turns[Math.floor(Math.random() * turns.length)];
        while (rules.length > 0 && rules.every(rule => rule.turn === turn) || (turn == undefined)) {
            turn = turns[Math.floor(Math.random() * turns.length)];
        }
        let newColor = Math.floor(Math.random() * colorCount);
        rules.push({ turn, newColor });
    }
    return {
        name: `Group ${gIndex}`,
        color: randomHexColour(),
        rules
    };
}

function updateRulesDisplay() {
    const rulesPanel = document.getElementById('rulesPanel');
    if (!rulesPanel) return;

    rulesPanel.innerHTML = '';
    for (let i = 0; i < antGroups.length; i++) {
        const g = antGroups[i];
        const groupDiv = document.createElement('div');
        groupDiv.style.borderBottom = '1px solid #666';
        groupDiv.style.paddingBottom = '0.5em';
        groupDiv.style.marginBottom = '0.5em';
        groupDiv.innerHTML = `<strong>${g.name}</strong>`;
        g.rules.forEach((r, idx) => {
            const ruleDiv = document.createElement('div');
            ruleDiv.style.display = 'flex';
            ruleDiv.style.alignItems = 'center';
            ruleDiv.innerHTML = `
                <div style="width: 16px; height: 16px; background:${colorMap[idx]}"></div>
                <span style="margin:0 0.5em;">→</span>
                <div style="width: 16px; height: 16px; background:${colorMap[r.newColor]}"></div>
                <span style="margin-left:0.5em;">${r.turn}</span>
            `;
            groupDiv.appendChild(ruleDiv);
        });
        rulesPanel.appendChild(groupDiv);
    }
}

// --- Helper: Initialize or reset the simulation state ---
function resetSimulation(newColorCount) {
    // Stop the simulation loop if running
    isRunning = false;
    toggleRunButton.textContent = "Start";
    // Set color count (number of cell states) for this run
    let reset_ant_groups = newColorCount !== colorCount || antGroups.length === 0;
    colorCount = newColorCount || parseInt(colorCountSelect.value);
    if (isNaN(colorCount) || colorCount < 2) colorCount = 2;
    // Resize grid dimensions to fit container at the given CELL_SIZE
    gridWidth = Math.floor(outerContainer.clientWidth / CELL_SIZE);
    gridHeight = Math.floor(outerContainer.clientHeight / CELL_SIZE);
    // Resize canvas pixels to match grid dimensions
    const canvasWidth = gridWidth * CELL_SIZE;
    const canvasHeight = gridHeight * CELL_SIZE;
    gridCanvas.width = canvasWidth;
    gridCanvas.height = canvasHeight;
    innerContainer.style.width = canvasWidth + "px";
    innerContainer.style.height = canvasHeight + "px";
    // Initialize grid cells to state 0 (e.g., all black)
    grid = new Array(gridHeight);
    for (let y = 0; y < gridHeight; y++) {
        grid[y] = new Array(gridWidth).fill(0);
    }
    if (reset_ant_groups) {
        groupSelect.innerHTML = "";  // clear existing options in the dropdown
        antGroups = [];  // reset groups to empty array
        initGroups();  // initialize groups with default rules
        updateRulesDisplay();
    }
    // Reset ants: start with one ant for Group 1 at the center (or random) by default
    ants = [];
    gridCtx.fillStyle = "#000000";
    gridCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    drawAnts();
}

// --- Simulation Tick: update all ants once ---
function simulateTick() {
    const paintActions = [];  // collect cells that need to be painted this tick

    // First phase: determine each ant's move and record paint actions
    for (let i = 0; i < ants.length; i++) {
        const ant = ants[i];
        const currentColor = grid[ant.y][ant.x];
        const group = antGroups[ant.group];
        const rule = group.rules[currentColor];
        if (!rule) continue;
        const turn = rule.turn;
        ant.dir = (ant.dir + turnDelta[turn] + 4) % 4;
        const newColor = rule.newColor;
        paintActions.push({ x: ant.x, y: ant.y, color: newColor });
        switch (ant.dir) {
            case 0: ant.y -= 1; break;
            case 1: ant.x += 1; break;
            case 2: ant.y += 1; break;
            case 3: ant.x -= 1; break;
        }
        if (ant.x < 0) { ant.x = 0; ant.dir = 1; }
        if (ant.x >= gridWidth) { ant.x = gridWidth - 1; ant.dir = 3; }
        if (ant.y < 0) { ant.y = 0; ant.dir = 2; }
        if (ant.y >= gridHeight) { ant.y = gridHeight - 1; ant.dir = 0; }
    }

    for (const action of paintActions) {
        const { x, y, color } = action;
        grid[y][x] = color;
        let fillColor = colorMap[color] || "#FFFFFF";  // default to white if color not found
        gridCtx.fillStyle = fillColor;
        gridCtx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }
}

// --- Draw all ants on the ant canvas ---
function drawAnts() {
    for (const ant of ants) {
        const group = antGroups[ant.group];
        gridCtx.fillStyle = group.color;
        const centerX = ant.x * CELL_SIZE + Math.floor(CELL_SIZE / 2);
        const centerY = ant.y * CELL_SIZE + Math.floor(CELL_SIZE / 2);
        const radius = Math.floor(CELL_SIZE / 2);
        gridCtx.beginPath();
        gridCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        gridCtx.fill();
    }
}

// --- Animation loop using requestAnimationFrame for smooth timing ---
function animationLoop(timestamp) {
    if (!isRunning) {
        return;
    }
    if (!lastFrameTime) lastFrameTime = timestamp;
    const dt = timestamp - lastFrameTime;
    lastFrameTime = timestamp;
    accumulator += dt;
    while (accumulator >= tickInterval) {
        simulateTick();
        accumulator -= tickInterval;
    }
    drawAnts();
    requestAnimationFrame(animationLoop);
}

// --- Event Handlers and UI Wiring ---

const toggleRunButton = document.getElementById('toggleRun');
toggleRunButton.addEventListener('click', () => {
    if (!isRunning) {
        isRunning = true;
        toggleRunButton.textContent = "Pause";
        lastFrameTime = 0;
        accumulator = 0;
        requestAnimationFrame(animationLoop);
    } else {
        isRunning = false;
        toggleRunButton.textContent = "Resume";
    }
});

const speedSlider = document.getElementById('speedSlider');
const speedLabel = document.getElementById('speedLabel');
speedSlider.addEventListener('input', () => {
    tickRate = parseInt(speedSlider.value);
    if (tickRate < 1) tickRate = 1;
    tickInterval = 1000 / tickRate;
    speedLabel.textContent = `${tickRate} ticks/sec`;
});

const addAntBtn = document.getElementById('addAntBtn');
addAntBtn.addEventListener('click', () => {
    const groupIndex = parseInt(groupSelect.value);
    if (isNaN(groupIndex)) return;
    if (ants.length == 0) {
        const startX = Math.floor(gridWidth / 2);
        const startY = Math.floor(gridHeight / 2);
        ants.push({ x: startX, y: startY, dir: 0, group: groupIndex });

    } else {
        const randX = Math.floor(Math.random() * gridWidth);
        const randY = Math.floor(Math.random() * gridHeight);
        const randDir = Math.floor(Math.random() * 4);
        ants.push({ x: randX, y: randY, dir: randDir, group: groupIndex });
    }
    drawAnts();
});

const deleteGroupBtn = document.getElementById('deleteGroupBtn');
deleteGroupBtn.addEventListener('click', () => {
    const groupIndex = parseInt(groupSelect.value);
    if (isNaN(groupIndex)) return;
    ants = ants.filter(ant => ant.group !== groupIndex);
    antGroups.splice(groupIndex, 1);
    groupSelect.remove(groupIndex);
    updateRulesDisplay();
    drawAnts();
});

const randomRulesBtn = document.getElementById('randomRulesBtn');
randomRulesBtn.addEventListener('click', () => {
    const newGroup = makeRandomGroup();
    antGroups.push(newGroup);

    const opt = document.createElement('option');
    opt.value = antGroups.length - 1;
    opt.textContent = newGroup.name;
    groupSelect.appendChild(opt);

    groupSelect.value = antGroups.length - 1;

    updateRulesDisplay();
});

const colorCountSelect = document.getElementById('colorCountSelect');
const resetBtn = document.getElementById('resetBtn');
colorCountSelect.addEventListener('change', () => {
    resetSimulation(parseInt(colorCountSelect.value));
});
resetBtn.addEventListener('click', () => {
    resetSimulation(parseInt(colorCountSelect.value));
});

const outerContainer = document.getElementById('outer-container');
const innerContainer = document.getElementById('inner-container');
outerContainer.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    isDragging = true;
    outerContainer.setPointerCapture(e.pointerId);
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = panX;
    panStartY = panY;
});
outerContainer.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    panX = panStartX + dx;
    panY = panStartY + dy;
    clampPan();
    innerContainer.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
});
outerContainer.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    outerContainer.releasePointerCapture(e.pointerId);
});
outerContainer.addEventListener('pointercancel', (e) => {
    isDragging = false;
});

outerContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = (e.deltaY < 0 ? 1.2 : 0.8);
    const MIN_SCALE = 1;
    const MAX_SCALE = 10;
    const newScale = Math.max(MIN_SCALE, Math.min(scale * zoomFactor, MAX_SCALE));
    const rect = outerContainer.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;
    const scaleRatio = newScale / scale;
    panX = pointerX - (pointerX - panX) * scaleRatio;
    panY = pointerY - (pointerY - panY) * scaleRatio;
    scale = newScale;
    clampPan();
    innerContainer.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
}, { passive: false });

function clampPan() {
    const contentWidth = gridCanvas.width * scale;
    const contentHeight = gridCanvas.height * scale;
    const containerWidth = outerContainer.clientWidth;
    const containerHeight = outerContainer.clientHeight;
    const maxPanX = 0;
    const minPanX = Math.min(0, containerWidth - contentWidth);
    const maxPanY = 0;
    const minPanY = Math.min(0, containerHeight - contentHeight);
    panX = Math.max(minPanX, Math.min(maxPanX, panX));
    panY = Math.max(minPanY, Math.min(maxPanY, panY));
}

resetSimulation(parseInt(colorCountSelect.value) || 2);
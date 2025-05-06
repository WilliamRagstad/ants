const groupSelect = document.getElementById('groupSelect');

// --- Simulation Configuration and State ---
const CELL_SIZE = 4;  // pixel size of each cell square (adjust as desired)
// Ant group definitions: each group has a name, a display color for the ant, and will get a ruleset.
let antGroups = [
    // { name: "Langton's ant", color: "#FF0000", rules: [] },  // Red ants (Langton's ant base behavior)
    // { name: "Group 2", color: "#0000FF", rules: [] },  // Blue ants (alternate behavior)
    // { name: "Group 3", color: "#00FF00", rules: [] }   // Green ants (another variant)
];
initGroups();  // Initialize the default groups (e.g., Langton's ant)
// The grid and ants state will be initialized in resetSimulation()
let gridWidth, gridHeight, colorCount;
let grid = [];   // 2D array for cell colors (state IDs)
let ants = [];   // list of ant objects: { x, y, dir, group }
// Direction encoding for ants: 0=up, 1=right, 2=down, 3=left (clockwise)
// Turn instruction mappings: 'L' = -90°, 'R' = +90°, 'S' = straight (0°), 'U' = 180°
const turnDelta = { 'L': -1, 'R': 1, 'S': 0, 'U': 2 };

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
// const gridCanvas = document.getElementById('gridCanvas');
// const antsCanvas = document.getElementById('antsCanvas');
// const gridCtx = gridCanvas.getContext('2d');
// const antsCtx = antsCanvas.getContext('2d');
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
        rules: [
            { turn: 'R', newColor: 1 },  // turn right, paint next color (1)
            { turn: 'L', newColor: 0 },  // turn left, paint previous color (0)
        ]
    };
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


// --- Helper: Initialize or reset the simulation state ---
function resetSimulation(newColorCount) {
    // Stop the simulation loop if running
    isRunning = false;
    toggleRunButton.textContent = "Start";
    // Set color count (number of cell states) for this run
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
    // antsCanvas.width = canvasWidth;
    // antsCanvas.height = canvasHeight;
    // Update inner container size to match content (so transform scaling works correctly)
    innerContainer.style.width = canvasWidth + "px";
    innerContainer.style.height = canvasHeight + "px";
    // Initialize grid cells to state 0 (e.g., all black)
    grid = new Array(gridHeight);
    for (let y = 0; y < gridHeight; y++) {
        grid[y] = new Array(gridWidth).fill(0);
    }
    // // Generate each group's ruleset for the current number of colors
    // antGroups.forEach((group, gIndex) => {
    //     group.rules = [];  // reset rules array
    //     for (let state = 0; state < colorCount; state++) {
    //         let turnInstruction;
    //         if (gIndex === 0) {
    //             // Group 1: alternate R, L (starting with R at state 0) – Langton’s ant for 2 colors (RL)
    //             turnInstruction = (state % 2 === 0) ? 'R' : 'L';
    //         } else if (gIndex === 1) {
    //             // Group 2: alternate starting with L at state 0 (mirror of group 1)
    //             turnInstruction = (state % 2 === 0) ? 'L' : 'R';
    //         } else if (gIndex === 2) {
    //             // Group 3: cycle through L, R, S, U repeatedly for variety
    //             const seq = ['L', 'R', 'S', 'U'];
    //             turnInstruction = seq[state % seq.length];
    //         } else {
    //             // Additional groups (if any added later) can default to turning right
    //             turnInstruction = 'R';
    //         }
    //         // By default, paint the cell to the next color in sequence (cyclic)
    //         const newColor = (state + 1) % colorCount;
    //         group.rules[state] = { turn: turnInstruction, newColor: newColor };
    //     }
    // });
    groupSelect.innerHTML = "";  // clear existing options in the dropdown
    antGroups = [];  // reset groups to empty array
    initGroups();  // initialize groups with default rules
    // Reset ants: start with one ant for Group 1 at the center (or random) by default
    ants = [];
    // Place initial ant for Group 1 (index 0)
    // const startX = Math.floor(gridWidth / 2);
    // const startY = Math.floor(gridHeight / 2);
    // ants.push({ x: startX, y: startY, dir: 0, group: 0 });  // start facing up (dir=0)

    // Clear the grid canvas and fill with state0 color (black)
    gridCtx.fillStyle = "#000000";
    gridCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    // Clear ants canvas
    // antsCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    // Draw the initial ant
    drawAnts();
}

// --- Simulation Tick: update all ants once ---
function simulateTick() {
    const paintActions = [];  // collect cells that need to be painted this tick

    // First phase: determine each ant's move and record paint actions
    for (let i = 0; i < ants.length; i++) {
        const ant = ants[i];
        // Get the current cell color under the ant
        const currentColor = grid[ant.y][ant.x];
        // Determine this ant's rule for the current color
        const group = antGroups[ant.group];
        const rule = group.rules[currentColor];
        // Turn the ant according to the rule
        const turn = rule.turn;
        // Update direction (0=up,1=right,2=down,3=left) with wrapping
        ant.dir = (ant.dir + turnDelta[turn] + 4) % 4;
        // Schedule the cell's color to be painted to the new color
        const newColor = rule.newColor;
        paintActions.push({ x: ant.x, y: ant.y, color: newColor });
        // Move the ant forward one cell in the new direction
        switch (ant.dir) {
            case 0: ant.y -= 1; break;  // up
            case 1: ant.x += 1; break;  // right
            case 2: ant.y += 1; break;  // down
            case 3: ant.x -= 1; break;  // left
        }
        // If the ant goes out of bounds, we stop it at the edge (or optionally, remove it)
        if (ant.x < 0) { ant.x = 0; ant.dir = 1; }
        if (ant.x >= gridWidth) { ant.x = gridWidth - 1; ant.dir = 3; }
        if (ant.y < 0) { ant.y = 0; ant.dir = 2; }
        if (ant.y >= gridHeight) { ant.y = gridHeight - 1; ant.dir = 0; }
    }

    // Second phase: apply all paint actions to the grid (this updates cell colors after all ants have decided)
    for (const action of paintActions) {
        const { x, y, color } = action;
        grid[y][x] = color;
        // Draw the cell’s new color on the grid canvas
        // Set the fill style based on color ID (use predefined palette from CSS classes)
        // We can map color IDs to the same palette defined in CSS:
        let fillColor;
        switch (color) {
            case 0: fillColor = "#000000"; break;
            case 1: fillColor = "#FFFFFF"; break;
            case 2: fillColor = "#FFFF00"; break;
            case 3: fillColor = "#FF00FF"; break;
            case 4: fillColor = "#00FFFF"; break;
            case 5: fillColor = "#FFA500"; break;
            case 6: fillColor = "#800080"; break;
            case 7: fillColor = "#808080"; break;
            case 8: fillColor = "#FFC0CB"; break;
            case 9: fillColor = "#008080"; break;
            default: fillColor = "#FFFFFF";
        }
        gridCtx.fillStyle = fillColor;
        gridCtx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }
    // (Note: We redraw ants separately after all ticks in this frame)
}

// --- Draw all ants on the ant canvas ---
function drawAnts() {
    // Clear the ants overlay canvas
    // gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
    // Draw each ant as a colored circle at its position
    for (const ant of ants) {
        const group = antGroups[ant.group];
        gridCtx.fillStyle = group.color;
        // Calculate pixel coordinates for the center of the ant's cell
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
        return;  // exit if simulation is no longer running
    }
    if (!lastFrameTime) lastFrameTime = timestamp;
    const dt = timestamp - lastFrameTime;
    lastFrameTime = timestamp;
    accumulator += dt;
    // Process as many ticks as fit into the accumulated time (may do multiple ticks per frame)
    while (accumulator >= tickInterval) {
        simulateTick();
        accumulator -= tickInterval;
    }
    // Draw ants at their final positions after processing ticks
    drawAnts();
    // Queue next frame
    requestAnimationFrame(animationLoop);
}

// --- Event Handlers and UI Wiring ---

// Start/Pause button
const toggleRunButton = document.getElementById('toggleRun');
toggleRunButton.addEventListener('click', () => {
    if (!isRunning) {
        // Start or resume the simulation
        isRunning = true;
        // Update button text to "Pause"
        toggleRunButton.textContent = "Pause";
        // Reset frame timing variables for a smooth loop
        lastFrameTime = 0;
        accumulator = 0;
        requestAnimationFrame(animationLoop);
    } else {
        // Pause the simulation
        isRunning = false;
        // Change button to "Resume"
        toggleRunButton.textContent = "Resume";
    }
});

// Speed slider
const speedSlider = document.getElementById('speedSlider');
const speedLabel = document.getElementById('speedLabel');
speedSlider.addEventListener('input', () => {
    tickRate = parseInt(speedSlider.value);
    if (tickRate < 1) tickRate = 1;
    tickInterval = 1000 / tickRate;
    speedLabel.textContent = `${tickRate} ticks/sec`;
});

// Add Ant (button and group selector)
const addAntBtn = document.getElementById('addAntBtn');
addAntBtn.addEventListener('click', () => {
    const groupIndex = parseInt(groupSelect.value);
    if (isNaN(groupIndex)) return;
    if (ants.length == 0) {
        // If no ants exist, place the first one at the center of the grid
        const startX = Math.floor(gridWidth / 2);
        const startY = Math.floor(gridHeight / 2);
        ants.push({ x: startX, y: startY, dir: 0, group: groupIndex });

    } else {
        // Spawn a new ant of the selected group at a random position
        const randX = Math.floor(Math.random() * gridWidth);
        const randY = Math.floor(Math.random() * gridHeight);
        const randDir = Math.floor(Math.random() * 4);
        ants.push({ x: randX, y: randY, dir: randDir, group: groupIndex });
    }
    // Immediately draw the new ant (especially if simulation is paused)
    drawAnts();
});

const randomRulesBtn = document.getElementById('randomRulesBtn');
randomRulesBtn.addEventListener('click', () => {
    const newGroup = makeRandomGroup();
    antGroups.push(newGroup);

    // add to the dropdown
    const opt = document.createElement('option');
    opt.value = antGroups.length - 1;
    opt.textContent = newGroup.name;
    groupSelect.appendChild(opt);

    // auto‑select the freshly added group for convenience
    groupSelect.value = antGroups.length - 1;
});


// Color count selector and Reset button
const colorCountSelect = document.getElementById('colorCountSelect');
const resetBtn = document.getElementById('resetBtn');
// On color count change, we’ll auto-reset the simulation to apply new state count
colorCountSelect.addEventListener('change', () => {
    resetSimulation(parseInt(colorCountSelect.value));
});
resetBtn.addEventListener('click', () => {
    resetSimulation(parseInt(colorCountSelect.value));
});

// Panning (drag) events on the outer container
const outerContainer = document.getElementById('outer-container');
const innerContainer = document.getElementById('inner-container');
outerContainer.addEventListener('pointerdown', (e) => {
    // Only handle primary mouse button or single touch
    if (e.button !== 0) return;
    e.preventDefault();
    isDragging = true;
    // Capture the pointer to continue receiving events even if it leaves the element
    outerContainer.setPointerCapture(e.pointerId);
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = panX;
    panStartY = panY;
});
outerContainer.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    // Calculate the drag distance in screen pixels
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    // Update pan offsets, clamped to grid bounds
    panX = panStartX + dx;
    panY = panStartY + dy;
    clampPan();  // ensure we don’t pan beyond the grid edges
    // Apply the CSS transform for panning (and current scale)
    innerContainer.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
});
outerContainer.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    outerContainer.releasePointerCapture(e.pointerId);
});
outerContainer.addEventListener('pointercancel', (e) => {
    // End panning if pointer is cancelled (e.g. touch interruption)
    isDragging = false;
});

// Zoom (wheel) event
outerContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    // Determine zoom direction: deltaY < 0 = zoom in, deltaY > 0 = zoom out
    const zoomFactor = (e.deltaY < 0 ? 1.2 : 0.8);
    const MIN_SCALE = 1;                                              // cannot zoom out past full size
    const MAX_SCALE = 10;                                             // cannot zoom in past 10x size
    const newScale = Math.max(MIN_SCALE, Math.min(scale * zoomFactor, MAX_SCALE));  // clamp scale between 0.1 and 10
    // Get mouse position relative to the container
    const rect = outerContainer.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;
    // Calculate new pan offsets so that the point under cursor stays in place
    const scaleRatio = newScale / scale;
    panX = pointerX - (pointerX - panX) * scaleRatio;
    panY = pointerY - (pointerY - panY) * scaleRatio;
    scale = newScale;
    clampPan();
    innerContainer.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
}, { passive: false });

// Clamp panX, panY so the grid (inner-container) doesn’t leave empty space beyond edges
function clampPan() {
    const contentWidth = gridCanvas.width * scale;
    const contentHeight = gridCanvas.height * scale;
    const containerWidth = outerContainer.clientWidth;
    const containerHeight = outerContainer.clientHeight;
    // If content is smaller than container, allow centering (or slight movement within bounds)
    const maxPanX = 0;
    const minPanX = Math.min(0, containerWidth - contentWidth);
    const maxPanY = 0;
    const minPanY = Math.min(0, containerHeight - contentHeight);
    // Clamp panX and panY to [min, max]
    panX = Math.max(minPanX, Math.min(maxPanX, panX));
    panY = Math.max(minPanY, Math.min(maxPanY, panY));
}

// --- Initialize the simulation on page load ---
resetSimulation(parseInt(colorCountSelect.value) || 2);
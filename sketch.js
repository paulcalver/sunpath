// Configuration constants - Location array for multi-timezone support
const locations = [
  { id: 'juneau', name: 'Juneau, Alaska', lat: 58.3019, lon: -134.4197, enabled: true, keyNumber: 1 },
  { id: 'vancouver', name: 'Vancouver', lat: 49.2827, lon: -123.1207, enabled: true, keyNumber: 2 },
  { id: 'newyork', name: 'New York', lat: 40.7128, lon: -74.0060, enabled: true, keyNumber: 3 },
  { id: 'lisbon', name: 'Lisbon', lat: 38.7223, lon: -9.1393, enabled: false, keyNumber: 4 },
  { id: 'cairo', name: 'Cairo', lat: 30.0444, lon: 31.2357, enabled: false, keyNumber: 5 },
  { id: 'dubai', name: 'Dubai', lat: 25.2048, lon: 55.2708, enabled: false, keyNumber: 6 },
  { id: 'delhi', name: 'Delhi', lat: 28.6139, lon: 77.2090, enabled: false, keyNumber: 7 },
  { id: 'dhaka', name: 'Dhaka', lat: 23.8103, lon: 90.4125, enabled: false, keyNumber: 8 },
  { id: 'hanoi', name: 'Hanoi', lat: 21.0285, lon: 105.8542, enabled: false, keyNumber: 9 }
];  

// Building wall bearing in degrees
const wallBearing = 260;

// Date configuration
const useToday = false; // If true, uses today's date; if false, uses manual date below
const manualDay = 21;   // Day of month (1-31)
const manualMonth = 3;  // Month (1-12, where 1=January, 12=December)
const manualYear = 2026; // Year

const CANVAS_WIDTH = 8192;
const CANVAS_HEIGHT = 1080;
//const CANVAS_HEIGHT = 1169;
const MAIN_WALL = 1920; // Width of main wall area
const SIDE_WALL = (CANVAS_WIDTH - MAIN_WALL) / 2; // Width of side wall area

// Window grid configuration
let windowCol;
let windowRow;
let paneWidth;
let paneHeight;
let paneGapX;
let paneGapY;
let totalWindowWidth;

// Time animation
let timeProgress = 0; // 0 to 1, loops continuously
//const timeSpeed = 0.000031; // Seminar Timing
const timeSpeed = 0.0005; // Adjust this to speed up/slow down (higher = faster)

// Grain animation (separate from day/night cycle)
let grainTime = 0;
const grainSpeed = 0.1; // Speed of grain animation (independent of timeSpeed)

// Rendering
let blurShader;
let graphics;      // Accumulation buffer (persists trails)
let tempGraphics;  // Temporary buffer (draws current frame at full opacity)
const trailAlpha = 20; // How quickly trails fade (lower = longer trails)
let timeDisplay;   // DOM element for displaying time

// Calculate sunrise and sunset times for a given date and location
function getSunriseSunset(lat, lon, date) {
  const testDate = new Date(date);
  testDate.setHours(0, 0, 0, 0);

  let sunrise = null;
  let sunset = null;

  // Search through the day in 1-minute increments
  for (let minutes = 0; minutes < 1440; minutes++) {
    testDate.setHours(0, minutes, 0, 0);
    const sunPos = getSunPosition(lat, lon, testDate);

    // Found sunrise (sun crosses horizon going up)
    if (sunrise === null && sunPos.elevation > 0) {
      sunrise = new Date(testDate);
    }

    // Found sunset (sun crosses horizon going down, after sunrise)
    if (sunrise !== null && sunset === null && sunPos.elevation < 0) {
      sunset = new Date(testDate);
      sunset.setMinutes(sunset.getMinutes() - 1); // Go back to last positive elevation
      break;
    }
  }

  return { sunrise, sunset };
}

// Get animated time that loops through the day
function getAnimatedTime() {
  const startHour = 0;
  const startMinute = 0;
  const endHour = 23;
  const endMinute = 59;

  // Convert to total minutes
  const startMinutes = startHour * 60 + startMinute; // 360 minutes (6:00 AM)
  const endMinutes = endHour * 60 + endMinute;       // 1080 minutes (6:00 PM)

  // Map timeProgress (0-1) to minutes - keep as float for smooth interpolation
  const totalMinutes = map(timeProgress, 0, 1, startMinutes, endMinutes);

  // Convert to hours, minutes, and seconds with fractional precision
  const hours = floor(totalMinutes / 60);
  const minutes = floor(totalMinutes % 60);
  const seconds = floor((totalMinutes % 1) * 60); // Extract fractional minutes as seconds

  // Create a date object with the mapped time including seconds
  const now = useToday ? new Date() : new Date(manualYear, manualMonth - 1, manualDay);
  now.setHours(hours, minutes, seconds, 0);

  return now;
}

// Update the DOM time display with date, location, wall bearing, and time
function updateTimeDisplay() {
  const sunTime = getAnimatedTime();
  const hours = String(sunTime.getHours()).padStart(2, '0');
  const minutes = String(sunTime.getMinutes()).padStart(2, '0');
  const seconds = String(sunTime.getSeconds()).padStart(2, '0');

  // Format date (e.g., "Jan 14, 2026")
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = `${months[sunTime.getMonth()]} ${sunTime.getDate()}, ${sunTime.getFullYear()}`;

  // Determine wall direction based on wallBearing
  let wallDirection = '';
  if (wallBearing >= 247.5 && wallBearing < 292.5) {
    // 270 ± 22.5 degrees = South
    if (wallBearing < 270) wallDirection = 'South-East';
    else if (wallBearing > 270) wallDirection = 'South-West';
    else wallDirection = 'South';
  } else if (wallBearing >= 292.5 && wallBearing < 337.5) {
    wallDirection = 'West';
  } else if (wallBearing >= 337.5 || wallBearing < 22.5) {
    wallDirection = 'North';
  } else if (wallBearing >= 22.5 && wallBearing < 67.5) {
    wallDirection = 'North-East';
  } else if (wallBearing >= 67.5 && wallBearing < 112.5) {
    wallDirection = 'East';
  } else if (wallBearing >= 112.5 && wallBearing < 157.5) {
    wallDirection = 'South-East';
  } else if (wallBearing >= 157.5 && wallBearing < 202.5) {
    wallDirection = 'South';
  } else if (wallBearing >= 202.5 && wallBearing < 247.5) {
    wallDirection = 'South-West';
  }

  // Master line
  const masterLine = `${dateStr} | ${wallDirection} Wall (${wallBearing}°) | GMT ${hours}:${minutes}:${seconds}`;

  // Build location lines for all enabled locations
  const enabledLocations = locations.filter(loc => loc.enabled);
  const locationLines = enabledLocations.map(location => {
    const sunPos = getSunPosition(location.lat, location.lon, sunTime);
    const elevStr = sunPos.elevation.toFixed(1);
    const azStr = sunPos.azimuth.toFixed(1);

    // Check if sun is at horizon (sunrise/sunset) - within 2 degrees of horizon
    const isAtHorizon = sunPos.elevation >= 0 && sunPos.elevation <= 2;

    // Color the line yellow if at sunrise/sunset
    if (isAtHorizon) {
      return `<span style="color: #FFD700;">[${location.keyNumber}] ${location.name} | Elevation: ${elevStr}° | Azimuth: ${azStr}°</span>`;
    } else {
      return `[${location.keyNumber}] ${location.name} | Elevation: ${elevStr}° | Azimuth: ${azStr}°`;
    }
  });

  // Combine all lines with HTML line breaks
  const displayText = [masterLine, ...locationLines].join('<br>');
  timeDisplay.html(displayText);
}

function preload() {
  // Load shader files - p5.js 2.0 uses promises internally
  blurShader = loadShader('shader.vert', 'blur.frag',
    () => console.log('Shader loaded successfully'),
    (err) => console.error('Shader load failed:', err)
  );
}

function setup() {
  createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT, WEBGL);
  angleMode(DEGREES);
  noStroke();
  colorMode(HSB, 360, 100, 100, 100);

  // Create DOM element for time display
  timeDisplay = createDiv('00:00:00');
  timeDisplay.style('position', 'fixed');
  timeDisplay.style('bottom', '30px'); // Anchor to bottom
  timeDisplay.style('left', '30px');
  timeDisplay.style('color', '#464646');
  timeDisplay.style('font-family', 'monospace');
  timeDisplay.style('font-size', '12px');
  timeDisplay.style('z-index', '1000');
  timeDisplay.style('pointer-events', 'none'); // Don't interfere with mouse events
  timeDisplay.style('line-height', '1.4'); // Add spacing between lines

  // Create graphics buffers
  // Accumulation buffer - persists between frames for trail effect
  graphics = createGraphics(CANVAS_WIDTH, CANVAS_HEIGHT);
  graphics.angleMode(DEGREES);
  graphics.noStroke();
  graphics.colorMode(HSB, 360, 100, 100, 100);
  graphics.background(246, 50, 4);

  // Temporary buffer - cleared each frame, draws shapes at full opacity
  tempGraphics = createGraphics(CANVAS_WIDTH, CANVAS_HEIGHT);
  tempGraphics.angleMode(DEGREES);
  tempGraphics.noStroke();
  tempGraphics.colorMode(HSB, 360, 100, 100, 100);

  // Window grid configuration
  windowCol = 4;
  windowRow = 8;
  paneHeight = height / 14;
  paneWidth = paneHeight * 0.6;
  paneGapX = paneHeight * 0.12;
  paneGapY = paneHeight * 0.12;

  totalWindowWidth = windowCol * paneWidth + (windowCol - 1) * paneGapX;
  //console.log(`Total window width: ${totalWindowWidth}`); // For debugging

}


function draw() {
  // Update time animation - increment and loop
  timeProgress += timeSpeed;
  if (timeProgress > 1) {
    timeProgress = 0; // Loop back to start
  }

  // Update grain animation (continuous, smooth)
  grainTime += grainSpeed;

  // Clear the main canvas
  background(2);

  // Get animated time that loops through the day
  const now = getAnimatedTime();

  // For testing with fixed time
  //const now = new Date();
  //now.setHours(14, 0, 0);

  // Fade the accumulation buffer toward background color
  graphics.fill(0, trailAlpha);
  graphics.rect(0, 0, width, height);

  // Clear temp buffer completely (transparent)
  tempGraphics.clear();

  // Constants for window positions (same for all locations)
  const slightOffset = 1;
  const topAlign = 50;
  const leftAlign = 10;

  // Loop through enabled locations
  const enabledLocations = locations.filter(loc => loc.enabled);

  enabledLocations.forEach((location) => {
    // Calculate sun position for this location
    const sunPos = getSunPosition(location.lat, location.lon, now);

    // Skip if sun is below horizon (no windows to draw)
    if (sunPos.elevation < 0) {
      return;
    }

    // Calculate color/brightness for this location's windows
    const appearingSunAlpha = constrain(map(sunPos.elevation, 0, 12, 0, 70), 0, 70);
    const appearingSunHue = constrain(map(sunPos.azimuth, 180, 240, 35, 25), 25, 35);

    // Calculate light angle for brightness fade
    const isAfternoon = sunPos.azimuth >= 180;
    const lightAngle = isAfternoon
      ? wallBearing - sunPos.azimuth
      : sunPos.azimuth - (wallBearing - 180);
    const disappearingSunAlpha = constrain(map(lightAngle, 12, 0, 70, 0), 0, 70);

    const windowBrightness = min(appearingSunAlpha, disappearingSunAlpha);
    const windowAlphaFade = map(windowBrightness, 0, 80, 0, 1);
    const baseWindowAlpha = 70;

    // Set color for this location's windows
    tempGraphics.fill(appearingSunHue, 100, windowBrightness, baseWindowAlpha * windowAlphaFade);

    // Draw all 3 window pairs at SAME positions for all locations (overlapping)
    drawWindow(now, location, sunPos, leftAlign, topAlign);
    drawWindow(now, location, sunPos, leftAlign + slightOffset, topAlign + slightOffset);

    drawWindow(now, location, sunPos, leftAlign + 300, topAlign);
    drawWindow(now, location, sunPos, leftAlign + 300 + slightOffset, topAlign + slightOffset);

    drawWindow(now, location, sunPos, leftAlign + 600, topAlign);
    drawWindow(now, location, sunPos, leftAlign + 600 + slightOffset, topAlign + slightOffset);
  });

  // Blend temp buffer onto accumulation buffer
  graphics.image(tempGraphics, 0, 0);

  // Apply shader with blur if loaded
  if (blurShader) {
    shader(blurShader);
    blurShader.setUniform('tex0', graphics);
    blurShader.setUniform('texelSize', [1.0 / width, 1.0 / height]);
    const blurAmount = 3;
    blurShader.setUniform('blurAmount', blurAmount);
    blurShader.setUniform('grainAmount', 0.1); // Grain intensity (0.0 - 1.0)
    blurShader.setUniform('time', grainTime); // Pass smooth grain time

    // Draw the textured rectangle with no fill
    noStroke();
    texture(graphics);
    rect(-width / 2, -height / 2, width, height);
  } else {
    // Fallback: render without shader
    push();
    translate(-width / 2, -height / 2);
    image(graphics, 0, 0);
    pop();
  }

  // Update DOM time display
  updateTimeDisplay();

}

function drawWindow(now, location, sunPos, windowCornerOffset, windowTopOffset, windowType = 'auto') {
  // Use passed sunPos instead of calculating (caller already filtered elevation < 0)
  const currentAzimuth = sunPos.azimuth;
  const currentElevation = sunPos.elevation;

  // Determine if we're rendering west (afternoon) or east (morning) window
  let isWestWindow;
  if (windowType === 'auto') {
    isWestWindow = currentAzimuth > wallBearing - 90;
  } else if (windowType === 'west') {
    isWestWindow = true;
  } else if (windowType === 'east') {
    isWestWindow = false;
  } else {
    console.warn(`Invalid windowType: ${windowType}. Using 'auto'.`);
    isWestWindow = currentAzimuth > wallBearing - 90;
  }

  // Calculate light angle relative to the wall
  currentLightAngle = isWestWindow
    ? wallBearing - currentAzimuth           // West: 270 - azimuth
    : currentAzimuth - (wallBearing - 180);  // East: azimuth - 90

  // Direction multipliers for east/west differences
  const dirX = isWestWindow ? 1 : -1;  // West projects right, East projects left
  const dirY = isWestWindow ? 1 : -1;  // Vertical projection direction

  // Calculate projection origin
  let horizontalOffset = windowCornerOffset / tan(currentLightAngle);
  let originX = isWestWindow
    ? horizontalOffset + SIDE_WALL           // West: measure from left edge
    : width - horizontalOffset - SIDE_WALL;  // East: measure from right edge
  let originY = windowTopOffset + tan(currentElevation) * horizontalOffset;

  // Calculate projected dimensions
  let projectedPaneWidth = dirX * paneWidth / tan(currentLightAngle);
  let projectedPaneHeight = paneHeight;
  let projectedGapX = dirX * paneGapX / tan(currentLightAngle);
  let projectedGapY = paneGapY;

  // Calculate vertical offsets due to sun elevation
  let tanElevation = dirY * tan(currentElevation);
  let vPaneOffset = tanElevation * projectedPaneWidth;
  let vGapOffset = tanElevation * projectedGapX;

  // Calculate step sizes for grid iteration
  let colXStep = projectedPaneWidth + projectedGapX;
  let colYStep = vGapOffset + vPaneOffset;
  let rowYStep = projectedPaneHeight + projectedGapY;
  let vPaneHeight = vPaneOffset + projectedPaneHeight;

  // Parallel light
  let parallelOriginX = isWestWindow
    ? (SIDE_WALL + MAIN_WALL + windowCornerOffset) - tan(currentLightAngle) * (MAIN_WALL)
    : ((SIDE_WALL - totalWindowWidth) - windowCornerOffset) + tan(currentLightAngle) * (MAIN_WALL);
  let parallelOriginY = (windowTopOffset + tan(currentElevation) * (MAIN_WALL));

  // Draw the window panes
  for (let i = 0; i < windowCol; i++) {
    let baseX = originX + i * colXStep;
    let baseY = originY + i * colYStep;
    let rightX = baseX + projectedPaneWidth;

    let parallelBaseX = parallelOriginX + i * (paneWidth + paneGapX);
    // let parallelY = parallelOriginY;
    let parallelRightX = parallelBaseX + paneWidth;

    for (let j = 0; j < windowRow; j++) {
      let y = baseY + j * rowYStep;

      let parallelY = parallelOriginY + j * (paneHeight + paneGapY);

      // Draw projected light representation
      tempGraphics.push();
      tempGraphics.clip(() => {
        tempGraphics.rect(SIDE_WALL, 0, MAIN_WALL, CANVAS_HEIGHT);
      });

      tempGraphics.beginShape();
      tempGraphics.vertex(baseX, y);
      tempGraphics.vertex(rightX, y + vPaneOffset);
      tempGraphics.vertex(rightX, y + vPaneHeight);
      tempGraphics.vertex(baseX, y + projectedPaneHeight);
      tempGraphics.endShape(CLOSE);

      tempGraphics.pop();

      // Draw parallel light representation
      tempGraphics.push();
      tempGraphics.drawingContext.save();

      // Create clipping path based on window orientation
      tempGraphics.drawingContext.beginPath();
      if (isWestWindow) {
        tempGraphics.drawingContext.rect(SIDE_WALL + MAIN_WALL, 0, SIDE_WALL, CANVAS_HEIGHT);
      } else {
        tempGraphics.drawingContext.rect(0, 0, SIDE_WALL, CANVAS_HEIGHT);
        //tempGraphics.drawingContext.rect(0, 0, 0, 0);
      }
      tempGraphics.drawingContext.clip();

      tempGraphics.beginShape();
      tempGraphics.vertex(parallelBaseX, parallelY);
      tempGraphics.vertex(parallelRightX, parallelY);
      tempGraphics.vertex(parallelRightX, parallelY + paneHeight);
      tempGraphics.vertex(parallelBaseX, parallelY + paneHeight);
      tempGraphics.endShape(CLOSE);

      tempGraphics.drawingContext.restore();
      tempGraphics.pop();

    }
  }
}


function getSunPosition(lat, lon, date) {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  const time = date.getTime();
  const JD = (time / 86400000) + 2440587.5;
  const n = JD - 2451545.0;

  let L = (280.460 + 0.9856474 * n) % 360;
  let g = (357.528 + 0.9856003 * n) % 360;
  const lambda = (L + 1.915 * Math.sin(g * rad) + 0.020 * Math.sin(2 * g * rad)) % 360;
  const epsilon = 23.439 - 0.0000004 * n;

  let RA = deg * Math.atan2(Math.cos(epsilon * rad) * Math.sin(lambda * rad), Math.cos(lambda * rad));
  RA = (RA + 360) % 360;

  const delta = deg * Math.asin(Math.sin(epsilon * rad) * Math.sin(lambda * rad));

  const GMST = (280.460 + 360.9856474 * n) % 360;
  const LST = (GMST + lon) % 360;

  let H = (LST - RA + 360) % 360;
  if (H > 180) H = H - 360;

  const latRad = lat * rad;
  const HRad = H * rad;
  const deltaRad = delta * rad;

  const elevation = deg * Math.asin(
    Math.sin(latRad) * Math.sin(deltaRad) +
    Math.cos(latRad) * Math.cos(deltaRad) * Math.cos(HRad)
  );

  let azimuth = deg * Math.atan2(
    -Math.sin(HRad),
    Math.cos(latRad) * Math.tan(deltaRad) - Math.sin(latRad) * Math.cos(HRad)
  );
  azimuth = (azimuth + 360) % 360;

  return { azimuth, elevation };
}

// function windowResized() {
//   resizeCanvas(windowWidth, windowHeight);
//   graphics.resizeCanvas(windowWidth, windowHeight);
//   tempGraphics.resizeCanvas(windowWidth, windowHeight);
// }

function keyPressed() {
  // Check if a number key (1-9) was pressed
  const keyNum = parseInt(key);

  if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= 9) {
    // Find location with matching keyNumber
    const location = locations.find(loc => loc.keyNumber === keyNum);

    if (location) {
      // Toggle enabled state
      location.enabled = !location.enabled;
      console.log(`${location.name} ${location.enabled ? 'enabled' : 'disabled'}`);
    }
  }

  // Prevent default browser behavior
  return false;
}
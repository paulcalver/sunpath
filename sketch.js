// Configuration constants
const london = { lat: 51.5074, lon: -0.1278 };
const marrakesh = { lat: 31.6295, lon: -7.9811 };
const reykjavik = { lat: 64.1355, lon: -21.8954 };
const barcelona = { lat: 41.3851, lon: 2.1734 };
const eritrea = { lat: 15.3229, lon: 38.9251 };

// Select country for simulation
const country = marrakesh;  

// Building wall bearing in degrees
const wallBearing = 245;

// Window grid configuration
let windowCol;
let windowRow;
let paneWidth;
let paneHeight;
let paneGapX;
let paneGapY;

// Sun position state (shared for brightness calculations)
let currentElevation = 0;
let currentAzimuth = 0;
let currentLightAngle = 0;

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
  const now = new Date();
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

  // Get location name (from the selected country constant)
  let locationName = 'Unknown';
  if (country === london) locationName = 'London';
  else if (country === reykjavik) locationName = 'Reykjavik';
  else if (country === marrakesh) locationName = 'Marrakesh';
  else if (country === barcelona) locationName = 'Barcelona';
  else if (country === eritrea) locationName = 'Eritrea';


  // Determine wall direction based on wallBearing (270 = South)
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

  // Format elevation and azimuth with 1 decimal place
  const elevationStr = currentElevation.toFixed(1);
  const azimuthStr = currentAzimuth.toFixed(1);

  // Calculate sunrise and sunset times
  const sunTimes = getSunriseSunset(country.lat, country.lon, sunTime);
  let sunriseStr = 'N/A';
  let sunsetStr = 'N/A';

  if (sunTimes.sunrise) {
    const srHours = String(sunTimes.sunrise.getHours()).padStart(2, '0');
    const srMinutes = String(sunTimes.sunrise.getMinutes()).padStart(2, '0');
    sunriseStr = `${srHours}:${srMinutes}`;
  }

  if (sunTimes.sunset) {
    const ssHours = String(sunTimes.sunset.getHours()).padStart(2, '0');
    const ssMinutes = String(sunTimes.sunset.getMinutes()).padStart(2, '0');
    sunsetStr = `${ssHours}:${ssMinutes}`;
  }

  timeDisplay.html(`${dateStr} | ${locationName} | ${wallDirection} Wall (${wallBearing}°) | GMT ${hours}:${minutes}:${seconds} | Elevation: ${elevationStr}° | Azimuth: ${azimuthStr}° | Sunrise: ${sunriseStr} | Sunset: ${sunsetStr}`);
}

function preload() {
  // Load shader files - p5.js 2.0 uses promises internally
  blurShader = loadShader('shader.vert', 'blur.frag',
    () => console.log('Shader loaded successfully'),
    (err) => console.error('Shader load failed:', err)
  );
}

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  angleMode(DEGREES);
  noStroke();
  colorMode(HSB, 360, 100, 100, 100);

  // Create DOM element for time display
  timeDisplay = createDiv('00:00:00');
  timeDisplay.position(30, height - 50);
  timeDisplay.style('color', '#464646');
  timeDisplay.style('font-family', 'monospace');
  timeDisplay.style('font-size', '12px');
  timeDisplay.style('z-index', '1000');
  timeDisplay.style('pointer-events', 'none'); // Don't interfere with mouse events

  // Create graphics buffers
  // Accumulation buffer - persists between frames for trail effect
  graphics = createGraphics(windowWidth, windowHeight);
  graphics.angleMode(DEGREES);
  graphics.noStroke();
  graphics.colorMode(HSB, 360, 100, 100, 100);
  graphics.background(246, 50, 4);

  // Temporary buffer - cleared each frame, draws shapes at full opacity
  tempGraphics = createGraphics(windowWidth, windowHeight);
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

  // Get sun position to calculate brightness (call once to update global state)
  const sunPos = getSunPosition(country.lat, country.lon, now);
  if (sunPos.elevation > 0) {
    currentAzimuth = sunPos.azimuth;
    currentElevation = sunPos.elevation;

    // Determine which window is active to calculate appropriate light angle
    const isAfternoon = currentAzimuth >= 180;
    currentLightAngle = isAfternoon
      ? wallBearing - currentAzimuth           // West: 270 - azimuth
      : currentAzimuth - (wallBearing - 180);  // East: azimuth - 90
  }

  // Fade the accumulation buffer toward background color
  //graphics.fill(246, 50, 4, trailAlpha);
  graphics.fill(0, trailAlpha);
  graphics.rect(0, 0, width, height);

  // Clear temp buffer completely (transparent)
  tempGraphics.clear();

  // Calculate window brightness based on sun position
  const appearingSunAlpha = constrain(map(currentElevation, 0, 12, 0, 70), 0, 70);
  const appearingSunHue = constrain(map(currentAzimuth, 180, 240, 35, 25), 25, 35);
  const disappearingSunAlpha = constrain(map(currentLightAngle, 12, 0, 70, 0), 0, 70);
  const windowBrightness = min(appearingSunAlpha, disappearingSunAlpha);
  const windowAlphaFade = map(windowBrightness, 0, 80, 0, 1);

  // Draw to temp buffer at full opacity
  const baseWindowAlpha = 70;
  tempGraphics.fill(appearingSunHue, 100, windowBrightness, baseWindowAlpha * windowAlphaFade);

  // Draw windows with slight offset for depth effect
  const slightOffset = 2;
  const topAlign = 30;
  const leftAlign = 10;

  drawWindow(now, leftAlign, topAlign);
  drawWindow(now, leftAlign + slightOffset, topAlign + slightOffset);

  drawWindow(now, leftAlign +300, topAlign);
  drawWindow(now, leftAlign +300 + slightOffset, topAlign + slightOffset);

  drawWindow(now, leftAlign + 600, topAlign);
  drawWindow(now, leftAlign + 600 + slightOffset, topAlign + slightOffset);
  // Blend temp buffer onto accumulation buffer
  graphics.image(tempGraphics, 0, 0);

  // Apply shader with blur if loaded
  if (blurShader) {
    shader(blurShader);
    blurShader.setUniform('tex0', graphics);
    blurShader.setUniform('texelSize', [1.0 / width, 1.0 / height]);
    const blurAmount = 3;
    blurShader.setUniform('blurAmount', blurAmount);
    blurShader.setUniform('grainAmount', 0.0); // Grain intensity (0.0 - 1.0)
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

function drawWindow(now, windowCornerOffset, windowTopOffset, windowType = 'auto') {
  const sunPos = getSunPosition(country.lat, country.lon, now);

  if (sunPos.elevation < 0) {
    return null;
  }

  currentAzimuth = sunPos.azimuth;
  currentElevation = sunPos.elevation;

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
    ? horizontalOffset                    // West: measure from left edge
    : width - horizontalOffset;           // East: measure from right edge
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

  // Draw the window panes
  for (let i = 0; i < windowCol; i++) {
    let baseX = originX + i * colXStep;
    let baseY = originY + i * colYStep;
    let rightX = baseX + projectedPaneWidth;

    for (let j = 0; j < windowRow; j++) {
      let y = baseY + j * rowYStep;

      tempGraphics.beginShape();
      tempGraphics.vertex(baseX, y);
      tempGraphics.vertex(rightX, y + vPaneOffset);
      tempGraphics.vertex(rightX, y + vPaneHeight);
      tempGraphics.vertex(baseX, y + projectedPaneHeight);
      tempGraphics.endShape(CLOSE);

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

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  graphics.resizeCanvas(windowWidth, windowHeight);
  tempGraphics.resizeCanvas(windowWidth, windowHeight);
}
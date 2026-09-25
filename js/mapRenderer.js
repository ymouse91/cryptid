/**
 * mapRenderer.js — Canvas-based hex map drawing.
 *
 * Provides the MapRenderer constructor used as window.cryptid.map.
 * Handles tile drawing, structure overlay, target highlight, responsive
 * canvas sizing, and map collapse/expand (docked vs. panel mode).
 *
 * Depends on: jQuery, mapData.js (TILE_IMAGES, STRUCT_IMAGES, HEX_CONFIG)
 *
 * @param {string} canvasId - ID of the <canvas> element.
 * @param {string} mapKey   - Encoded map key string (tiles + structures).
 * @param {boolean} advanced - Whether advanced (all 8 structures) mode is active.
 * @param {string} size     - Initial breakpoint key: 'mobile' | 'tablet' | 'desktop'.
 */
function MapRenderer(canvasId, mapKey, advanced, size) {
  let tileImages;      // Array of loaded HTMLImageElement for tiles
  let structImages;    // Array of arrays of loaded HTMLImageElement for structures
  let currentSize;     // Current breakpoint key
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  let mapKeyValue = mapKey;
  let isAdvanced = advanced;
  let isSoloStyle = false;
  let targetVisible = false;
  let hexClickHandler = null;
  let playerMarkers = [];
  let lastActionHexes = [];
  let pulseStartedAt = 0;
  let pulseFrame = null;
  const pulseDuration = 1400;
  let loadGeneration = 0;

  // ---------------------------------------------------------------------------
  // Internal: map new settings
  // ---------------------------------------------------------------------------

  /**
   * Apply new map settings and trigger a redraw.
  * @param {string} key      - New map key.
  * @param {boolean} adv     - Advanced mode flag.
  * @param {Object} target   - Target coordinate string "col,row" or null.
   * @param {boolean} soloStyle - Use the simplified solo board artwork.
   */
  this.newMapSettings = function (key, adv, target, soloStyle) {
    mapKeyValue = key;
    isAdvanced = adv;
    isSoloStyle = soloStyle === true || Boolean(
      window.cryptid.settings && window.cryptid.settings.get('solo') === true
    );
    targetVisible = false;
    playerMarkers = [];
    lastActionHexes = [];
    pulseStartedAt = 0;
    // Do not leave the previous board visible while the new artwork loads.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.loadAndDraw();
  };

  /** Add or replace a player's marker on a board hex. */
  this.addPlayerMarker = function (col, row, player, markerType) {
    playerMarkers = playerMarkers.filter(function (marker) {
      return !(marker.col === col && marker.row === row && marker.player === player);
    });
    playerMarkers.push({
      col: col,
      row: row,
      player: player,
      type: markerType === 'disc' ? 'disc' : 'cube'
    });
    this.setLastActionHexes([{ col: col, row: row }]);
    this.drawList();
  };

  /** Return a snapshot of markers currently shown on the board. */
  this.getPlayerMarkers = function () {
    return playerMarkers.slice();
  };

  /** Highlight the hexes involved in the most recent action. */
  this.setLastActionHexes = function (hexes) {
    lastActionHexes = (Array.isArray(hexes) ? hexes : [hexes]).filter(function (hex) {
      return hex && Number.isFinite(hex.col) && Number.isFinite(hex.row);
    }).map(function (hex) {
      return { col: hex.col, row: hex.row };
    });
    pulseStartedAt = lastActionHexes.length ? performance.now() : 0;
    if (pulseFrame === null && lastActionHexes.length) {
      pulseFrame = window.requestAnimationFrame(drawPulseFrame);
    }
  };

  /** Register a callback for clicks on board hexes. Pass null to disable it. */
  this.setHexClickHandler = function (handler) {
    hexClickHandler = typeof handler === 'function' ? handler : null;
  };

  // ---------------------------------------------------------------------------
  // Image loading
  // ---------------------------------------------------------------------------

  this.imageOnload = function (img) {
    tileImages.push(img);
    if (imagesLoaded()) {
      tileImages.sort();
    }
  };

  /**
   * Load all images for the current size and draw once complete.
   * If images are already loaded (array lengths match expected counts),
   * skip loading and draw immediately.
   */
  this.loadAndDraw = function () {
    const generation = ++loadGeneration;
    const soloTiles = TILE_IMAGES.soloMobile || TILE_IMAGES.mobile.map(function (src) {
      return src.replace('/mobile/', '/solo-mobile/');
    });
    const tiles = isSoloStyle ? soloTiles : TILE_IMAGES[currentSize];
    const structs = isSoloStyle ? STRUCT_IMAGES.mobile : STRUCT_IMAGES[currentSize];
    const totalExpected = tiles.length + structs[0].length + structs[1].length;

    if (totalExpected !== tiles.length) {
      // Need to (re)load images
      const self = this;
      let remaining = totalExpected;
      tileImages = [];
      structImages = [];

      tiles.forEach(function (src) {
        const img = new Image();
        img.onload = function () {
          if (generation !== loadGeneration) return;
          if (--remaining <= 0) self.drawList();
        };
        img.onerror = function () {
          if (generation !== loadGeneration) return;
          if (--remaining <= 0) self.drawList();
        };
        img.src = src;
        tileImages.push(img);
      });

      structs.forEach(function (group, groupIdx) {
        structImages[groupIdx] = [];
        group.forEach(function (src) {
          const img = new Image();
          img.onload = function () {
            if (generation !== loadGeneration) return;
            if (--remaining <= 0) self.drawList();
          };
          img.onerror = function () {
            if (generation !== loadGeneration) return;
            if (--remaining <= 0) self.drawList();
          };
          img.src = src;
          structImages[groupIdx].push(img);
        });
      });
    } else {
      this.drawList();
    }
  };

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  /** Draw map tiles, structures, and (if set) the target highlight. */
  this.drawList = function () {
    this.drawMap();
    this.drawStructures();
    this.drawSoloAnimalTerritories();
    this.drawPlayerMarkers();
    if (targetVisible) {
      this.drawTarget(this.pTargetX, this.pTargetY);
    }
    this.drawLastActionPulse();
  };

  function drawPulseFrame(timestamp) {
    pulseFrame = null;
    if (!lastActionHexes.length || timestamp - pulseStartedAt >= pulseDuration) {
      lastActionHexes = [];
      return;
    }
    if (typeof window.cryptid !== 'undefined' && window.cryptid.map) {
      window.cryptid.map.drawList();
    }
    pulseFrame = window.requestAnimationFrame(drawPulseFrame);
  }

  /** Draw a bright, gently pulsing outline around the latest action. */
  this.drawLastActionPulse = function () {
    if (!lastActionHexes.length || !pulseStartedAt) return;
    const elapsed = performance.now() - pulseStartedAt;
    if (elapsed >= pulseDuration) return;

    const progress = elapsed / pulseDuration;
    const wave = (Math.sin(progress * Math.PI * 4) + 1) / 2;
    const alpha = 0.55 + wave * 0.4;
    const lineWidth = 2 + wave * 1.5;
    const cfg = HEX_CONFIG[currentSize];

    ctx.save();
    ctx.shadowColor = 'rgba(255, 232, 74, ' + (0.8 + wave * 0.2).toFixed(2) + ')';
    ctx.shadowBlur = 4 + wave * 6;

    lastActionHexes.forEach(function (hex) {
      let y = yPosToCanvas(hex.row);
      if (hex.col % 2 === 0) y += cfg.hex_h / 2;
      const centerX = xPosToCanvas(hex.col) + cfg.hex_d / 2;
      const centerY = y + cfg.hex_h / 2;
      const radiusX = cfg.hex_d / 2 - 1;
      const radiusY = cfg.hex_h / 2 - 1;
      // The tile artwork uses flat-top hexes. Keep the highlight on the
      // same six edges instead of approximating it as a pointy-top hex.
      const points = [
        { x: centerX - radiusX / 2, y: centerY - radiusY },
        { x: centerX + radiusX / 2, y: centerY - radiusY },
        { x: centerX + radiusX, y: centerY },
        { x: centerX + radiusX / 2, y: centerY + radiusY },
        { x: centerX - radiusX / 2, y: centerY + radiusY },
        { x: centerX - radiusX, y: centerY }
      ];
      function traceHex() {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(function (point) { ctx.lineTo(point.x, point.y); });
        ctx.closePath();
      }

      // A soft outer stroke provides the glow; the inner stroke keeps the
      // highlight readable against both dark forest and bright terrain.
      traceHex();
      ctx.strokeStyle = 'rgba(255, 214, 38, ' + (0.22 + wave * 0.18).toFixed(2) + ')';
      ctx.lineWidth = lineWidth + 5;
      ctx.stroke();
      traceHex();
      ctx.strokeStyle = 'rgba(255, 238, 90, ' + alpha.toFixed(2) + ')';
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    });
    ctx.restore();
  };

  /**
   * Draw a single tile image at board position (col, row).
   * @param {number} col - 1-indexed column.
   * @param {number} row - 1-indexed row.
   * @param {HTMLImageElement} img - Tile image to draw.
   */
  this.drawTile = function (col, row, img) {
    const cfg = HEX_CONFIG[currentSize];
    let y = this.yPosToPx(row);
    const x = this.xPosToPx(col);
    if (col % 2 === 0) {
      y += cfg.hex_h / 2;
    }
    const scale = isSoloStyle ? cfg.hex_d / HEX_CONFIG.mobile.hex_d : 1;
    const width = img.naturalWidth * scale;
    const height = img.naturalHeight * scale;
    if (img.naturalWidth === 0) {
      img.onload = function () {
        ctx.drawImage(img, x, y, img.naturalWidth * scale, img.naturalHeight * scale);
      };
    } else {
      ctx.drawImage(img, x, y, width, height);
    }
  };

  /**
   * Draw a structure image centred on board position (col, row).
   * @param {number} col - 1-indexed column.
   * @param {number} row - 1-indexed row.
   * @param {HTMLImageElement} img - Structure image.
   */
  this.drawStructure = function (col, row, img) {
    let y = this.yPosToPx(row);
    let x = this.xPosToPx(col);
    if (col % 2 === 0) {
      y += HEX_CONFIG[currentSize].hex_h / 2;
    }
    const cfg = HEX_CONFIG[currentSize];
    const scale = isSoloStyle ? cfg.hex_d / HEX_CONFIG.mobile.hex_d : 1;
    const width = img.naturalWidth * scale;
    const height = img.naturalHeight * scale;
    if (img.naturalWidth === 0) {
      img.onload = function () {
        x += (cfg.hex_d - img.naturalWidth * scale) / 2;
        y += (cfg.hex_h - img.naturalHeight * scale) / 2;
        ctx.drawImage(img, x, y, img.naturalWidth * scale, img.naturalHeight * scale);
      };
    } else {
      x += (cfg.hex_d - width) / 2;
      y += (cfg.hex_h - height) / 2;
      ctx.drawImage(img, x, y, width, height);
    }
  };

  /**
   * Draw the tile-number label for a given board position.
   * @param {number} tilePos - 0-indexed tile position (0–5, left-right top-bottom).
   * @param {number} tileDesignIdx - 0-indexed tile design index (0–11).
   */
  this.drawText = function (tilePos, tileDesignIdx) {
    const cfg = HEX_CONFIG[currentSize];
    let x = cfg.numberMargin / 2;
    if (tilePos % 2 !== 1) {
      x += 6 * cfg.hex_d + 6.5 * cfg.hex_s + cfg.numberMargin + cfg.tileGap;
    }
    const tileRow = 1 + Math.floor((tilePos - 1) / 2);
    const y = (3 * cfg.hex_h + cfg.tileGap) * (tileRow - 1) + 2 * cfg.hex_h;
    ctx.font = 'bold ' + cfg.numberFontSize + ' "Alegreya"';
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    const label = (tileDesignIdx % 6) + 1;
    ctx.fillText(label, x, y, cfg.numberMargin);
  };

  // ---------------------------------------------------------------------------
  // Coordinate helpers
  // ---------------------------------------------------------------------------

  /**
   * Convert 1-indexed column to canvas x pixel.
   * @param {number} col
   * @returns {number}
   */
  this.xPosToPx = function (col) {
    const cfg = HEX_CONFIG[currentSize];
    return cfg.numberMargin + (col > 6 ? cfg.tileGap : 0) + (col - 1) * cfg.hex_ds;
  };

  /**
   * Convert 1-indexed row to canvas y pixel.
   * @param {number} row
   * @returns {number}
   */
  this.yPosToPx = function (row) {
    const cfg = HEX_CONFIG[currentSize];
    return Math.floor((row - 1) / 3) * cfg.tileGap + (row - 1) * cfg.hex_h;
  };

  /** Convert a canvas click to the nearest board hex and notify the caller. */
  canvas.addEventListener('click', function (event) {
    if (!hexClickHandler) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const cfg = HEX_CONFIG[currentSize];
    let closest = null;
    let closestDistance = Infinity;

    for (let col = 1; col <= 12; col++) {
      for (let row = 1; row <= 9; row++) {
        let hexY = yPosToCanvas(row);
        if (col % 2 === 0) hexY += cfg.hex_h / 2;
        const hexX = xPosToCanvas(col);
        const dx = x - (hexX + cfg.hex_d / 2);
        const dy = y - (hexY + cfg.hex_h / 2);
        const distance = (dx * dx) + (dy * dy);
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = { col: col, row: row };
        }
      }
    }

    if (closest && closestDistance <= Math.pow(Math.max(cfg.hex_d, cfg.hex_h) / 2, 2)) {
      hexClickHandler(closest.col, closest.row);
    }
  });

  function xPosToCanvas(col) {
    const cfg = HEX_CONFIG[currentSize];
    return cfg.numberMargin + (col > 6 ? cfg.tileGap : 0) + (col - 1) * cfg.hex_ds;
  }

  function yPosToCanvas(row) {
    const cfg = HEX_CONFIG[currentSize];
    return Math.floor((row - 1) / 3) * cfg.tileGap + (row - 1) * cfg.hex_h;
  }

  // ---------------------------------------------------------------------------
  // Map and structure drawing
  // ---------------------------------------------------------------------------

  /** Clear the canvas and draw all six map tiles with orientation dots and labels. */
  this.drawMap = function () {
    const cfg = HEX_CONFIG[currentSize];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const key = mapKeyValue.replace('intro_', '');

    for (let pos = 0; pos < 6; pos++) {
      const char = key.substring(pos, pos + 1);
      const designIdx = parseInt(char, 16) - 1;
      const col = (pos % 2) * 6 + 1;
      const row = 3 * Math.floor(pos / 2) + 1;
      this.drawTile(col, row, tileImages[designIdx]);

      this.drawText(pos + 1, designIdx);
    }
  };

  /** Draw structure images at positions encoded in the map key. */
  this.drawStructures = function () {
    const structs = structImages;
    let charOffset = 6; // First 6 chars of key are tiles; structures follow
    const self = this;
    const key = mapKeyValue.replace('intro_', '');

    // The key always encodes 8 structure positions (4 stones + 4 shacks).
    // In intro mode only the first 3 of each group (green/blue/white) are drawn;
    // in advanced mode all 4 (including black) are drawn.
    // charOffset must advance through ALL 8 positions regardless.
    structs.forEach(function (group, groupIdx) {
      group.forEach(function (img, imgIdx) {
        const rowVal = parseInt(key.substring(charOffset + 0, charOffset + 1), 16) + 1;
        const colVal = parseInt(key.substring(charOffset + 1, charOffset + 2), 16) + 1;
        charOffset += 2;
        if (isAdvanced || imgIdx < 3) {
          self.drawStructure(colVal, rowVal, img);
        }
      });
    });
  };

  /** Draw compact animal markers that are absent from the simplified tiles. */
  this.drawSoloAnimalTerritories = function () {
    if (!isSoloStyle) return;

    const cfg = HEX_CONFIG[currentSize];
    const key = mapKeyValue.replace('intro_', '');
    ctx.save();
    ctx.lineJoin = 'round';

    for (let col = 1; col <= 12; col++) {
      for (let row = 1; row <= 9; row++) {
        const animal = getHexData(key, col, row).animal;
        if (animal === ANIMAL.NONE) continue;

        let y = yPosToCanvas(row);
        if (col % 2 === 0) y += cfg.hex_h / 2;
        const centerX = xPosToCanvas(col) + cfg.hex_d / 2;
        const centerY = y + cfg.hex_h / 2;
        const color = animal === ANIMAL.COUGAR ? '#c62828' : '#202020';
        const size = Math.min(cfg.hex_d, cfg.hex_h) * 0.2;
        const padX = centerX;
        const padY = centerY + size * 0.18;
        ctx.fillStyle = color;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = Math.max(1, size * 0.12);

        // A small paw mark is readable at desktop and tablet sizes without
        // creating another busy outline around the whole animal territory.
        ctx.beginPath();
        ctx.ellipse(padX, padY, size * 0.42, size * 0.34, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        [-0.55, -0.18, 0.18, 0.55].forEach(function (offset) {
          ctx.beginPath();
          ctx.arc(padX + offset * size * 0.55, centerY - size * 0.28, size * 0.16, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        });
      }
    }
    ctx.restore();
  };

  /** Draw all solo AI markers on top of the board. */
  this.drawPlayerMarkers = function () {
    const cfg = HEX_CONFIG[currentSize];
    const colors = { 1: '#c0392b', 2: '#008f39', 3: '#0057b8', 4: '#e67e22' };
    // Keep the middle of a hex clear for animal markers. Player pieces sit
    // in the four inset corners of the flat-top hex artwork.
    const cornerOffsets = [
      { x: -0.27, y: -0.31 },
      { x:  0.27, y: -0.31 },
      { x: -0.27, y:  0.31 },
      { x:  0.27, y:  0.31 }
    ];

    playerMarkers.forEach(function (marker) {
      const sameHex = playerMarkers.filter(function (other) {
        return other.col === marker.col && other.row === marker.row;
      });
      const markerIndex = sameHex.indexOf(marker);
      const offset = cornerOffsets[markerIndex] || cornerOffsets[cornerOffsets.length - 1];
      let y = yPosToCanvas(marker.row);
      if (marker.col % 2 === 0) y += cfg.hex_h / 2;
      const centerX = xPosToCanvas(marker.col) + cfg.hex_d / 2;
      const centerY = y + cfg.hex_h / 2;
      const size = Math.min(cfg.hex_d, cfg.hex_h) * 0.23;
      const x = centerX + offset.x * cfg.hex_d;
      const markerY = centerY + offset.y * cfg.hex_h;

      ctx.fillStyle = colors[marker.player] || '#555';
      ctx.strokeStyle = 'white';
      ctx.lineWidth = Math.max(1, size * 0.12);
      if (marker.type === 'disc') {
        ctx.beginPath();
        ctx.arc(x, markerY, size / 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(x - size / 2, markerY - size / 2, size, size);
        ctx.strokeRect(x - size / 2, markerY - size / 2, size, size);
      }
    });
  };

  /**
   * Draw the target (habitat) highlight.  Greys out all other hexes using
   * the mask image, then draws the target image on the selected hex.
   * @param {number} col - 1-indexed column of target.
   * @param {number} row - 1-indexed row of target.
   */
  this.drawTarget = function (col, row) {
    targetVisible = true;
    this.pTargetX = col;
    this.pTargetY = row;
    const maskImg = tileImages[tileImages.length - 2];

    for (let c = 1; c <= 12; c++) {
      for (let r = 1; r <= 9; r++) {
        if (c !== col || r !== row) {
          this.drawTile(c, r, maskImg);
        }
      }
    }

    const targetImg = tileImages[tileImages.length - 1];
    this.drawTile(col, row, targetImg);
    this.drawPlayerMarkers();
  };

  // ---------------------------------------------------------------------------
  // Responsive sizing
  // ---------------------------------------------------------------------------

  /**
   * Switch the canvas to a different breakpoint size.
   * @param {string} newSize - 'mobile' | 'tablet' | 'desktop'
   */
  this.setWidth = function (newSize) {
    if (newSize !== currentSize && newSize in HEX_CONFIG) {
      currentSize = newSize;
      tileImages = [];
      canvas.width = HEX_CONFIG[currentSize].canvas_width;
      canvas.height = HEX_CONFIG[currentSize].canvas_height;
    }
  };

  /**
   * Automatically choose the appropriate breakpoint size based on window
   * width and docked/expanded state, then redraw.
   */
  this.autoWidthAdjust = function () {
    let chosen;
    const windowWidth = $(window).width();
    const isDocked = this.isDocked();
    const thresholds = HEX_CONFIG.thresholds;

    for (const key in thresholds) {
      if (windowWidth >= thresholds[key]) {
        chosen = key;
      }
    }

    if (isDocked === true) {
      if (this.dockable()) {
        chosen = 'mobile';
      } else {
        this.expandMap();
      }
    }

    if (currentSize !== chosen) {
      this.setWidth(chosen);
      this.loadAndDraw();
    }
  };

  // ---------------------------------------------------------------------------
  // Map expand/collapse
  // ---------------------------------------------------------------------------

  /** Collapse the map panel or dock it to the sidebar. */
  this.collapseMap = function () {
    const menuWidth = $('#menuLarge').width();
    const self = this;
    const shouldSlide = HEX_CONFIG.mobile.canvas_width > menuWidth;
    if (shouldSlide) {
      $('#mapCanvas').slideUp('slow', function () {
        self.autoSetMapArrow();
      });
    } else if (this.isDocked()) {
      $('#mapDiv').detach().prependTo('#gameMapAnchor');
      self.autoWidthAdjust();
    } else {
      $('#mapDiv').detach().appendTo('#mapAnchor');
      self.autoWidthAdjust();
      if (!$('#mapCanvas').is(':visible')) {
        $('#mapCanvas').slideDown('slow', function () {
          self.autoSetMapArrow();
        });
      }
    }
  };

  /** Expand the map panel. */
  this.expandMap = function () {
    $('#mapDiv').show();
    const self = this;
    if (this.isDocked()) {
      $('#mapDiv').detach().prependTo('#gameMapAnchor');
      this.autoWidthAdjust();
    } else if (this.isCollapsed()) {
      $('#mapCanvas').slideDown('slow', function () {
        self.autoSetMapArrow();
      });
    }
  };

  /** Toggle collapse/expand state. */
  this.toggleExpand = function () {
    if (this.isCollapsed() || this.isDocked()) {
      this.expandMap();
      this.autoSetMapArrow();
    } else {
      this.collapseMap();
      this.autoSetMapArrow();
    }
  };

  /** @returns {boolean} True when the map canvas is hidden (collapsed). */
  this.isCollapsed = function () {
    return !$('#mapCanvas').is(':visible');
  };

  /** @returns {boolean} True when the map is docked in the sidebar anchor. */
  this.isDocked = function () {
    return $('#mapAnchor > #mapDiv').length > 0;
  };

  /** @returns {boolean} True when the sidebar is wide enough to dock the map. */
  this.dockable = function () {
    return !(HEX_CONFIG.mobile.canvas_width > $('#menuLarge').width());
  };

  /**
   * Set the collapse arrow text explicitly.
   * @param {string} text - Arrow text (e.g. '[–]', '[+]', '[<]', '[>]').
   */
  this.setMapArrow = function (text) {
    $('#mapCollapseArrow').text(text);
  };

  /** Automatically choose the correct arrow text based on current state. */
  this.autoSetMapArrow = function () {
    const docked = this.isDocked();
    const collapsed = this.isCollapsed();
    const notDockable = !this.dockable();

    if (docked) {
      this.setMapArrow('[>]');
    } else if (notDockable) {
      this.setMapArrow(collapsed ? '[+]' : '[-]');
    } else {
      this.setMapArrow(collapsed ? '[+]' : '[<]');
    }
  };

  // ---------------------------------------------------------------------------
  // Initialise size
  // ---------------------------------------------------------------------------
  currentSize = size || 'mobile';
  tileImages = [];
  structImages = [];
  canvas.width = HEX_CONFIG[currentSize].canvas_width;
  canvas.height = HEX_CONFIG[currentSize].canvas_height;
}

/**
 * game.js — Game state machine.
 *
 * Manages the full game lifecycle:
 *   - Initialisation (loading games from store or server)
 *   - Starting a new game
 *   - Clue display (show/hide per player, two-player variant)
 *   - Clue reminders
 *   - Hint display
 *   - Target (habitat) reveal
 *   - Clue list reveal
 *   - End game
 *
 * Depends on: jQuery, gameStore.js, settings.js, sound.js, tutorial.js,
 *             i18n.js (translateElement, translateString), errors.js (ErrorManager)
 */

/**
 * Return an HTML badge showing the player's color and Greek letter.
 * @param {number} p - Player number (1–5).
 * @returns {string} HTML string.
 */
function playerBadge(p) {
  const LETTERS = ['α', 'β', 'γ', 'δ', 'ε'];
  const letter = LETTERS[p - 1] || '';
  return '<span class="player-badge player-badge-' + p + '">' + letter + '</span>';
}

function playerBadgesForPlayer(pnum, count) {
  if (count === 2) {
    const first = (pnum - 1) * 2 + 1;
    return playerBadge(first) + playerBadge(first + 1);
  }
  return playerBadge(pnum);
}

/** @class GameController */
function GameController() {
  // Private state
  let currentSetup    = undefined;  // Array returned from GameRecord.popRandomSetup()
  let currentGame     = undefined;  // GameRecord currently in play
  let playerCount;
  let isIntro;
  let soloMode;
  let showHints;
  let keepMap;
  let gameStore;
  let gameActive      = false;
  let storeFilled     = false;
  let clueReminderState = 0;        // Tracks reminder FSM state
  let _shareFormat    = 'short';    // 'short' | 'obfuscated' | 'plain'
  let selectedSoloHex = null;
  let soloPhase       = 'setup';    // 'setup' | 'turns'
  let soloAction      = 'question'; // 'question' | 'search'
  let soloSetupCount  = 0;
  let soloPendingPlacement = null;  // 'question_cube' | 'search_cube' | null
  let soloPendingOrigin = null;
  let soloActivePlayer = 1;
  let soloAiTurnCount = { 2: 0, 3: 0, 4: 0 };
  let soloSetupAiBusy = false;
  const SOLO_MOVE_DELAY = 900;

  const errMgr = new ErrorManager();

  // DOM selectors (kept as constants for readability)
  const SEL_LOADING_CONTENT = '#loadingDialogContent';
  const SEL_CLUE_DIV        = '#clueDiv';
  const SEL_CLUE_HEADER     = '#clueHeader';
  const SEL_CLUE_TEXT       = '#clueText';
  const SEL_CLUE_BUTTON     = '#clueButton';
  const SEL_REMINDER_PREFIX = '#reminder';
  const SEL_REMINDER_DIV    = '#clueReminderDiv';
  const SEL_REMINDER_TEXT   = '#reminderClueText';
  const SEL_HINT_DIV        = '#hintDiv';
  const SEL_HINT_TEXT       = '#hintText';
  const SEL_TARGET_DIV      = '#targetDisp';
  const SEL_REVEAL_DIV      = '#clueReveal';
  const SEL_REVEAL_LIST     = '#revealList';
  const SEL_CHEAT_DIV      = '#cheatSheetDiv';

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  this.getPlayers    = function () { return playerCount; };
  this.setPlayers    = function (n) {
    n = Number(n);
    if (n >= 2 && n <= 5) playerCount = n;
  };
  this.getIntro      = function () { return isIntro; };
  this.setIntro      = function (v) { if (typeof v === 'boolean') isIntro = v; };
  this.toggleIntro   = function () { isIntro = !isIntro; };
  this.getSolo       = function () { return soloMode; };
  this.setSolo       = function (v) { if (typeof v === 'boolean') soloMode = v; };
  this.getHint       = function () { return showHints; };
  this.setHint       = function (v) { if (typeof v === 'boolean') showHints = v; };
  this.toggleHint    = function () { showHints = !showHints; };
  this.getKeepMap    = function () { return keepMap; };
  this.setKeepMap    = function (v) { if (typeof v === 'boolean') keepMap = v; };
  this.toggleKeepMap = function () { keepMap = !keepMap; };

  this.getCurrentGame  = function () { return currentGame; };
  this.getCurrentSetup = function () { return currentSetup; };
  this.getGameStore    = function () { return gameStore; };
  this.error           = function () { return errMgr; };
  this.getGameActive   = function () { return gameActive; };

  this.getMode = function () {
    return isIntro ? 'intro' : 'normal';
  };

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------

  /**
   * Initialise the game controller: set options, create a game store, and
   * attempt to load games from local storage then from the server.
   *
   * @param {number}  players  - Default player count.
   * @param {boolean} advanced - Advanced mode flag (true = normal/advanced).
   * @param {boolean} hint     - Whether hints are enabled.
   * @param {boolean} keep     - Whether to keep the same map across games.
   */
  this.init = function (players, advanced, hint, keep) {
    const modeStr = advanced ? 'normal' : 'intro';
    const self = this;

    this.setPlayers(players);
    this.setSolo(false);
    this.setIntro(!advanced);
    this.setKeepMap(keep);
    this.setHint(hint);

    gameStore = new GameStore();
    gameStore.setMode(modeStr);

    let success = false;
    try {
      gameStore.generateInitialGames();
      success = true;
    } catch (err) {
      success = false;
    }

    if (success) {
      if (!gameActive) {
        this.showDiv('#newGameDialog');
        this.hideDiv('#loadingDialog');
      }
    } else if (!gameActive) {
      // Generation failed — show error UI with retry
      $(SEL_LOADING_CONTENT).empty();
      $(SEL_LOADING_CONTENT).append('<div class="load_error w3-margin-bottom" data-tkey="loading_err_intro"></div>');
      $('<button class="w3-button w3-block cryptid-highlight cryptid-hover-highlight load_error" data-tkey="general_retry"></button>')
        .appendTo(SEL_LOADING_CONTENT)
        .click(function () {
          self.init(players, advanced, hint, keep);
        });
      $('.load_error').each(function (idx, el) {
        translateElement($(el));
      });
    }

    // Fill the store in the background, unless the page was loaded in
    // player-view mode (?game=X&player=N) — in that case the user won't
    // reach the new-game dialog from this session, so defer generation
    // until end() is called.
    const urlParams = window.cryptid.sharing.parseUrlParams();
    if (!urlParams.game) {
      storeFilled = true;
      gameStore.fillGameStore();
      gameStore.replaceEmpty();
    }

    // Attach clue and reminder button handlers
    $('#clueButton').click(function () {
      self.showClue();
    });
    $('[data-pnum]').click(function () {
      self.remindClue($(this).data('pnum'));
    });
    $('#ngfStart').click(function () {
      self.startGame();
    });
  };

  // -------------------------------------------------------------------------
  // Settings harvest
  // -------------------------------------------------------------------------

  /** Read current settings into the controller state. */
  this.harvestSettings = function () {
    this.setSolo(window.cryptid.settings.get('solo'));
    if (soloMode) {
      window.cryptid.settings.set('players', 4);
    }
    this.setPlayers(window.cryptid.settings.get('players'));
    this.setHint(true);
    this.setIntro(!window.cryptid.settings.get('advanced'));
    this.setKeepMap(window.cryptid.settings.get('keep'));
  };

  // -------------------------------------------------------------------------
  // Start game
  // -------------------------------------------------------------------------

  /** Start a new game using the current settings. */
  this.startGame = function () {
    this.harvestSettings();

    // Get a new game unless keepMap is set and the current game is still valid.
    // currentGame.players may be absent when it was a synthetic shared-game object.
    const needNewGame = (
      !this.getKeepMap() ||
      currentGame === undefined ||
      !currentGame.players ||
      currentGame.mode !== this.getMode() ||
      currentGame.players[this.getPlayers()].length < 1
    );

    if (needNewGame) {
      let newGame = null;

      // If keepMap is on and the current map code is known, try to generate
      // a new game with the same tile layout but fresh structure positions.
      if (this.getKeepMap() && currentGame !== undefined && currentGame.mapCode) {
        newGame = gameStore.generateWithTileKey(
          currentGame.mapCode.substring(0, 6),
          this.getMode()
        );
      }

      if (!newGame) {
        // Completely different map — notify the user and fall back to the store.
        if (currentGame !== undefined) {
          errMgr.addError(translateString('error_map_change', null));
        }
        newGame = gameStore.getRandomGame(this.getMode(), this.getPlayers());
      }

      // When the user asked for a fresh map, avoid showing the exact same
      // solo board twice in a row if the random pool happens to return it.
      if (soloMode && !this.getKeepMap() && currentGame && newGame && newGame.key === currentGame.key) {
        for (let retry = 0; retry < 4 && newGame.key === currentGame.key; retry += 1) {
          newGame = gameStore.getRandomGame(this.getMode(), this.getPlayers());
        }
      }

      currentGame = newGame;
    }

    currentSetup = currentGame.popRandomSetup(this.getMode(), this.getPlayers());

    window.cryptid.soundMngr.playSound(window.cryptid.soundMngr.START);

    $('.game-gameplay').show();
    $('.game-start').hide();

    window.cryptid.map.newMapSettings(currentGame.key, !isIntro, currentSetup.target, soloMode);
    window.cryptid.map.expandMap();

    $(SEL_REMINDER_DIV).hide();
    $(SEL_REVEAL_DIV).hide();
    $(SEL_TARGET_DIV).hide();
    $(SEL_CLUE_DIV).hide();
    $(SEL_CLUE_TEXT).hide();
    $(SEL_HINT_DIV).hide();
    $(SEL_CHEAT_DIV).hide();
    $('#playerClueDiv').hide();
    $('#soloAiDiv').hide();

    clueReminderState = 0;
    this.clueDisplaying = 0;
    if (soloMode) {
      this.startSoloMode();
    } else {
      this.startReminderMode();
    }

    // Collapse share options from any prior game and reset format to default
    _shareFormat = 'short';
    $('#shareOptions').hide();
    $('#shareBtn').data('tkey', 'share_show_options');
    translateElement($('#shareBtn'));

    // Add game code to URL so the game can be shared or reloaded
    const gameCode = window.cryptid.sharing.encodeGame(
      currentGame.key,
      currentGame.mode,
      playerCount,
      currentSetup[0].rules
    );
    window.cryptid.sharing.setUrlParam('game', gameCode);
    window.cryptid.sharing.setUrlParam('solo', soloMode ? '1' : null);

    window.cryptid.myTut.showStep(3);
    gameActive = true;
  };

  // -------------------------------------------------------------------------
  // Clue display
  // -------------------------------------------------------------------------

  /** Show the next clue or advance to the reminder/reveal phase. */
  this.showClue = function () {
    const isPlural         = playerCount == 2;
    const showBtnKey       = isPlural ? 'clue_button_show_plural' : 'clue_button_show';
    const hideBtnKey       = isPlural ? 'clue_button_hide_plural' : 'clue_button_hide';
    const titleKey         = isPlural ? 'clue_title_plural' : 'clue_title';

    $(SEL_CLUE_HEADER).data('tkey', titleKey);

    if (!$(SEL_CLUE_DIV).is(':visible')) {
      $(SEL_CLUE_DIV).slideDown('slow');
    }

    const showingHide  = this.clueDisplaying % 2 === 0;
    const ruleIndex    = Math.floor(this.clueDisplaying / 2);
    let playerNum      = ruleIndex + 1;

    if (playerCount === 2) {
      playerNum = Math.floor(this.clueDisplaying / 3) + 1;
    }

    if (playerNum > playerCount) {
      // All clues have been shown — transition to reminders / hint
      $(SEL_CLUE_DIV).slideUp();
      $(SEL_TARGET_DIV).slideDown();
      this.createClueReminders();
      this.showHint();
      this.showCheatSheet();
      window.cryptid.myTut.showStep(7);
      return;
    }

    $(SEL_CLUE_BUTTON).data('badgeHtml', playerBadgesForPlayer(playerNum, playerCount));

    if (showingHide) {
      // Show the "show clue" button (clue text is hidden)
      $(SEL_CLUE_TEXT).fadeOut();
      $(SEL_CLUE_BUTTON).data('tkey', showBtnKey);
      $(SEL_CLUE_BUTTON).data('tpnum', playerNum);
      translateElement($(SEL_CLUE_BUTTON).first());
      $(SEL_CLUE_HEADER).data('tpnum', playerNum);
      translateElement($(SEL_CLUE_HEADER).first());
      window.cryptid.myTut.showStep(5);
    } else {
      // Reveal the clue text
      if (playerCount === 2) {
        const clueHtml =
          playerBadge(ruleIndex + 1) + translateString(currentSetup[0].rules[ruleIndex], null) +
          '<br><br>' +
          playerBadge(ruleIndex + 2) + translateString(currentSetup[0].rules[ruleIndex + 1], null);
        $(SEL_CLUE_TEXT).html(clueHtml);
        this.clueDisplaying += 2;
      } else {
        const ruleKey = currentSetup[0].rules[ruleIndex];
        $(SEL_CLUE_TEXT).data('tkey', ruleKey);
        $(SEL_CLUE_TEXT).html(playerBadge(playerNum) + translateString(ruleKey, null));
      }
      $(SEL_CLUE_TEXT).fadeIn();
      $(SEL_CLUE_BUTTON).data('tkey', hideBtnKey);
      $(SEL_CLUE_BUTTON).data('data-tkey', hideBtnKey);
      $(SEL_CLUE_BUTTON).data('tpnum', playerNum);
      translateElement($(SEL_CLUE_BUTTON).first());
      window.cryptid.myTut.showStep(6);
    }

    this.clueDisplaying++;
  };

  // -------------------------------------------------------------------------
  // Clue reminders
  // -------------------------------------------------------------------------

  /** Show reminder buttons for each active player. */
  this.createClueReminders = function () {
    for (let p = 1; p <= 5; p++) {
      const sel = SEL_REMINDER_PREFIX + p;
      if (p > playerCount) {
        $(sel).hide();
      } else {
        $(sel).data('badgeHtml', playerBadgesForPlayer(p, playerCount));
        translateElement($(sel));
        $(sel).show();
      }
    }
    $(SEL_REMINDER_DIV).slideDown();
  };

  /**
   * Handle a reminder button click for player pnum.
   * @param {number} pnum - Player number (1–5).
   */
  this.remindClue = function (pnum) {
    const isPlural  = playerCount === 2;
    const pluralSuf = isPlural ? '_plural' : '';
    let btnSel      = SEL_REMINDER_PREFIX + pnum;
    const ruleIdx   = playerCount === 2 ? 2 * (pnum - 1) + 1 : pnum;

    let btnKey;
    let instructKey;

    if (clueReminderState === 0) {
      // First click: confirm which player
      btnKey      = 'reminder_button_show';
      instructKey = 'reminder_instruction_confirm' + pluralSuf;
      clueReminderState = pnum;
    } else if (clueReminderState < 10 && pnum === clueReminderState) {
      // Second click on same player: reveal clue
      btnKey      = 'reminder_button_hide';
      instructKey = 'reminder_instruction_hide' + pluralSuf;

      const firstBadge = playerCount === 2 ? playerBadge(ruleIdx) : playerBadge(pnum);
      let html = "<div id='remindTextTemp' class='w3-block w3-margin-bottom cryptid-hide'>" +
        firstBadge + translateString(currentSetup[0].rules[ruleIdx - 1], null);
      if (playerCount === 2) {
        html += '<br><br>' + playerBadge(ruleIdx + 1) + translateString(currentSetup[0].rules[ruleIdx], null);
      }
      html += '</div>';
      $(btnSel).before(html);
      $('#remindTextTemp').slideDown();

      try {
        const vibePattern = [];
        for (let v = 0; v < clueReminderState; v++) {
          vibePattern.push(50, 50);
        }
        navigator.vibrate(vibePattern);
      } catch (e) {}

      window.cryptid.soundMngr.playClue(ruleIdx);
      clueReminderState += 10;
    } else if (clueReminderState > 10) {
      // Click after reveal: hide reminder text
      const shownPlayer = clueReminderState - 10;
      btnSel      = SEL_REMINDER_PREFIX + shownPlayer;
      instructKey = 'reminder_instruction' + pluralSuf;
      btnKey      = 'player_' + shownPlayer;
      $('#remindTextTemp').slideUp(400, function () {
        $('#remindTextTemp').remove();
      });
      clueReminderState = 0;
    } else {
      // Different player clicked while waiting
      instructKey = 'reminder_instruction' + pluralSuf;
      btnSel      = SEL_REMINDER_PREFIX + clueReminderState;
      btnKey      = 'player_' + clueReminderState;
      clueReminderState = 0;
    }

    $(btnSel).data('tkey', btnKey);
    $(btnSel).data('tpnum', pnum);
    $(SEL_REMINDER_TEXT).data('tpnum', pnum);
    $(SEL_REMINDER_TEXT).data('tkey', instructKey);
    translateElement($(SEL_REMINDER_TEXT));
    translateElement($(btnSel));
  };

  /** Reset the reminder UI to its initial state. */
  this.resetReminder = function () {
    $('#remindTextTemp').remove();
    const isPlural  = playerCount === 2;
    const pluralSuf = isPlural ? '_plural' : '';
    translateElement($(SEL_REMINDER_TEXT).data('tkey', 'reminder_instruction' + pluralSuf));
    $(SEL_REMINDER_DIV + ' button[id^="reminder"]').each(function (idx, el) {
      $(el).data('tkey', 'player_' + (idx + 1));
      translateElement(el);
    });
    clueReminderState = 0;
  };

  // -------------------------------------------------------------------------
  // Hint
  // -------------------------------------------------------------------------

  /** Show the hint reveal button (does not yet show the actual hint). */
  this.showHint = function () {
    if (!showHints) return;

    $(SEL_HINT_TEXT).empty();
    const self = this;
    const btn = $('<button class="w3-block w3-button cryptid-highlight cryptid-hover-highlight w3-margin-bottom" id="btnHint" data-tkey="hint_show_hint">Reveal Hint</button>')
      .appendTo(SEL_HINT_TEXT);
    translateElement(btn);
    btn.click(function () {
      $('#hintConfirm').show();
    });
    $(SEL_HINT_DIV).slideDown();
  };

  /** Reveal the hint text (called after confirmation). */
  this.hintShow = function () {
    $(SEL_HINT_TEXT).data('tkey', currentSetup[0].hint);
    translateElement($(SEL_HINT_TEXT));
    $(SEL_HINT_DIV).slideDown();
  };

  // -------------------------------------------------------------------------
  // Target confirm / reveal
  // -------------------------------------------------------------------------

  /** Show the target confirmation modal. */
  this.targetConfirm = function () {
    $('#targetConfirm').show();
  };

  /** Keep the reveal control available and make it visible after a win. */
  this.showHabitatReveal = function () {
    $(SEL_TARGET_DIV).stop(true, true).slideDown();
  };

  /** Reveal the target on the map and show all clues. */
  this.targetShow = function () {
    const parts = currentSetup[0].destination.split(',');
    const col   = parseInt(parts[0]);
    const row   = parseInt(parts[1]);

    window.cryptid.map.drawTarget(col, row);
    $(SEL_TARGET_DIV).slideUp();
    $(SEL_REMINDER_DIV).slideUp();
    $('#soloAiDiv').slideUp();
    this.revealClues();
    window.cryptid.map.expandMap();
    $('html, body').animate(
      { scrollTop: $('#mapDiv').offset().top },
      1000
    );
    this.hintShow();
  };

  // -------------------------------------------------------------------------
  // End game / clue reveal
  // -------------------------------------------------------------------------

  /** Build and display the clue reveal list. */
  this.revealClues = function () {
    const items = [];
    if (playerCount === 2) {
      items[0] = playerBadge(1) + translateString(currentSetup[0].rules[0], null) + '<br>' +
                 playerBadge(2) + translateString(currentSetup[0].rules[1], null);
      items[1] = playerBadge(3) + translateString(currentSetup[0].rules[2], null) + '<br>' +
                 playerBadge(4) + translateString(currentSetup[0].rules[3], null);
    } else {
      for (let p = 0; p < playerCount; p++) {
        items[p] = currentSetup[0].rules[p];
      }
    }

    $(SEL_REVEAL_LIST).empty();
    for (let p = 0; p < playerCount; p++) {
      const html = '<li><span>' +
        (playerCount === 2 ? items[p] : playerBadge(p + 1) + translateString(items[p], null)) +
        '</span></li>';
      $(SEL_REVEAL_LIST).append(html);
    }
    $(SEL_REVEAL_DIV).slideDown();
  };

  /** Show the end-game confirmation if clues haven't been revealed yet. */
  this.endConfirm = function () {
    if ($(SEL_REVEAL_DIV).is(':visible')) {
      this.end();
    } else {
      $('#quitConfirm').show();
    }
  };

  /** End the current game and return to the start screen. */
  this.end = function () {
    $('.game-gameplay').hide();
    $('.game-start').show();
    this.showDiv('#newGameDialog');
    this.hideDiv('#loadingDialog');
    if (!storeFilled) {
      storeFilled = true;
      gameStore.fillGameStore();
      gameStore.replaceEmpty();
    }
    $('#keepMapToggle').show();
    window.cryptid.myTut.showStep(0);
    gameActive = false;

    // Remove ?game and ?player from the URL (keeps ?lang intact).
    window.cryptid.sharing.setUrlParam('game', null);
    window.cryptid.sharing.setUrlParam('player', null);
  };

  // -------------------------------------------------------------------------
  // Shared-game loading (URL ?game= parameter)
  // -------------------------------------------------------------------------

  /**
   * Load a game from a decoded sharing code.
   * Sets up currentGame / currentSetup and renders the appropriate UI.
   *
   * @param {{mapKey:string, mode:string, playerCount:number, rules:string[], hint:string}} decoded
   * @param {string|null} playerSpec - '1'–'5', '12', '34', or null (reminder mode).
   * @param {boolean} soloRequested - Restore the solo game UI on reload.
   */
  this.loadFromSharedCode = function (decoded, playerSpec, soloRequested) {
    playerCount = decoded.playerCount;
    isIntro     = (decoded.mode === 'intro');
    showHints   = true;
    keepMap     = false;
    this.setSolo(soloRequested === true);

    // Shared/reloaded games do not have a GameRecord pool, but they still
    // carry enough of the map key to honour "keep the same map" after the
    // user ends the game and starts another one.
    currentGame  = {
      key: decoded.mapKey,
      mapCode: decoded.mapKey.replace(/^intro_/, ''),
      mode: decoded.mode
    };
    currentSetup = [{
      rules:       decoded.rules,
      destination: window.cryptid.sharing.findTarget(decoded.mapKey, decoded.rules),
      hint:        decoded.hint,
    }];

    this.hideDiv('#loadingDialog');
    this.hideDiv('#newGameDialog');
    $('.game-gameplay').show();
    $('.game-start').hide();

    window.cryptid.map.newMapSettings(decoded.mapKey, !isIntro, null);
    window.cryptid.map.expandMap();

    $(SEL_REMINDER_DIV).hide();
    $(SEL_REVEAL_DIV).hide();
    $(SEL_TARGET_DIV).hide();
    $(SEL_CLUE_DIV).hide();
    $(SEL_CLUE_TEXT).hide();
    $(SEL_HINT_DIV).hide();
    $(SEL_CHEAT_DIV).hide();
    $('#playerClueDiv').hide();
    $('#soloAiDiv').hide();
    $('#shareOptions').hide();
    $('#shareBtn').data('tkey', 'share_show_options');
    translateElement($('#shareBtn'));

    clueReminderState = 0;
    gameActive = true;

    if (soloRequested === true && !playerSpec) {
      this.startSoloMode();
    } else if (playerSpec) {
      this.showPlayerView(playerSpec);
    } else {
      this.startReminderMode();
    }
  };

  /**
   * Show only a single player's clue (URL ?player= parameter).
   * Supports individual players (1–5) and paired specifiers (12, 34).
   *
   * @param {string|number} playerSpec
   */
  this.showPlayerView = function (playerSpec) {
    const spec = String(playerSpec);
    let clueHtml;
    let headerKey;
    let headerPnum;

    if (spec === '12') {
      clueHtml   = playerBadge(1) + translateString(currentSetup[0].rules[0], null) +
                   '<br><br>' +
                   playerBadge(2) + translateString(currentSetup[0].rules[1], null);
      headerKey  = 'share_players_12';
      headerPnum = '12';
    } else if (spec === '34') {
      clueHtml   = playerBadge(3) + translateString(currentSetup[0].rules[2], null) +
                   '<br><br>' +
                   playerBadge(4) + translateString(currentSetup[0].rules[3], null);
      headerKey  = 'share_players_34';
      headerPnum = '34';
    } else {
      const p = parseInt(spec, 10);
      if (isNaN(p) || p < 1 || p > playerCount) return;
      clueHtml   = playerBadge(p) + translateString(currentSetup[0].rules[p - 1], null);
      headerKey  = playerCount === 2 ? 'clue_title_plural' : 'clue_title';
      headerPnum = p;
    }

    const isPlural = (spec === '12' || spec === '34');

    const header = $('#playerClueHeader');
    header.data('tkey', headerKey);
    if (headerPnum !== null) {
      header.data('tpnum', headerPnum);
    } else {
      header.removeData('tpnum');
    }
    translateElement(header);

    // In solo mode the human's clue is never passed to the AI, so keep it
    // visible throughout the game. Shared and pass-the-device views retain
    // the normal reveal button to protect the active player's clue.
    const keepSoloHumanClueVisible = soloMode === true && spec === '1';
    $('#playerClueText').html(clueHtml).toggle(keepSoloHumanClueVisible);

    const btn = $('#playerClueBtn');
    btn.toggle(!keepSoloHumanClueVisible);
    let btnBadgeHtml;
    if (spec === '12') {
      btnBadgeHtml = playerBadge(1) + playerBadge(2);
    } else if (spec === '34') {
      btnBadgeHtml = playerBadge(3) + playerBadge(4);
    } else {
      btnBadgeHtml = playerBadge(parseInt(spec, 10));
    }
    btn.data('badgeHtml', btnBadgeHtml)
       .data('tkey', isPlural ? 'clue_button_show_plural' : 'clue_button_show')
       .data('playerIsPlural', isPlural);
    if (headerPnum !== null) {
      btn.data('tpnum', headerPnum);
    } else {
      btn.removeData('tpnum');
    }
    translateElement(btn);

    $('#playerClueDiv').slideDown('slow');
    this.showCheatSheet();
  };

  /**
   * Toggle the player-view clue text shown/hidden.
   * Called by the onclick of #playerClueBtn.
   */
  this.togglePlayerClue = function () {
    const text     = $('#playerClueText');
    const btn      = $('#playerClueBtn');
    const isPlural = btn.data('playerIsPlural');

    if (text.is(':visible')) {
      text.fadeOut();
      btn.data('tkey', isPlural ? 'clue_button_show_plural' : 'clue_button_show');
    } else {
      text.fadeIn();
      btn.data('tkey', isPlural ? 'clue_button_hide_plural' : 'clue_button_hide');
    }
    translateElement(btn);
  };

  /**
   * Show the clue-reminder UI immediately (used when a game is loaded
   * via URL without a player specifier).
   * Includes a button to switch to pass-the-device mode.
   */
  this.startReminderMode = function () {
    window.cryptid.map.setHexClickHandler(null);
    $('#mapCanvas').removeClass('solo-map-clickable');
    selectedSoloHex = null;
    soloPendingPlacement = null;
    soloPendingOrigin = null;
    $('#soloSetupDiv, #soloTurnDiv').hide();
    $('#soloAiDiv').hide();
    this.resetReminder();
    this.createClueReminders();
    $(SEL_TARGET_DIV).slideDown();
    this.showHint();
    this.showCheatSheet();
    $('#passTheDeviceBtn').show();
  };

  /** Start the solo game with the rulebook's initial sharing phase. */
  this.startSoloMode = function () {
    const self = this;
    playerCount = 4;
    selectedSoloHex = null;
    soloPhase = 'setup';
    soloAction = 'question';
    soloSetupCount = 0;
    soloPendingPlacement = null;
    soloPendingOrigin = null;
    soloActivePlayer = 1;
    soloAiTurnCount = { 2: 0, 3: 0, 4: 0 };
    soloSetupAiBusy = false;
    $('#mapCanvas').addClass('solo-map-clickable');
    $('#passTheDeviceBtn').hide();
    $(SEL_REMINDER_DIV).hide();
    $(SEL_TARGET_DIV).show();
    this.showHint();
    this.showPlayerView(1);
    this.showSoloAiPanel();
    $('input[name="soloTurnChoice"]').off('change').on('change', function () {
      self.setSoloAction(this.value === 'search' ? 'search' : 'question');
    });
    window.cryptid.map.setHexClickHandler(function (col, row) {
      self.handleSoloHexClick(col, row);
    });
    this.showSoloSetup();
  };

  /** Show and reset the solo AI response panel. */
  this.showSoloAiPanel = function () {
    $('#soloAiResult').empty();
    $('#soloHumanDiv').hide();
    $('#soloGameStatus').empty();
    $('#soloAiDiv').slideDown();
  };

  function soloRulesContext() {
    const boardState = buildBoardState(currentGame.key);
    const allStructs = parseStructures(currentGame.key);
    const structs = currentGame.key.startsWith('intro_')
      ? allStructs.filter(function (s) { return s.color !== 'black'; })
      : allStructs;
    return { boardState: boardState, structs: structs };
  }

  function soloMarkerAt(col, row, player) {
    return window.cryptid.map.getPlayerMarkers().find(function (marker) {
      return marker.col === col && marker.row === row && marker.player === player;
    });
  }

  function soloHasCube(col, row) {
    return window.cryptid.map.getPlayerMarkers().some(function (marker) {
      return marker.col === col && marker.row === row && marker.type === 'cube';
    });
  }

  function soloIsValidHex(col, row) {
    return getAllHexes().some(function (hex) {
      return hex.col === col && hex.row === row;
    });
  }

  function soloClueMatches(col, row, player) {
    const context = soloRulesContext();
    return hexSatisfiesClue(
      col,
      row,
      currentSetup[0].rules[player - 1],
      context.boardState,
      context.structs
    );
  }

  function soloSetStatus(selector, key, className, player) {
    const text = typeof player === 'number'
      ? translateString(key, player)
      : translateString(key, null);
    $(selector)
      .attr('class', 'w3-margin-top solo-game-status ' + className)
      .text(text);
  }

  function soloSetSelection(col, row) {
    selectedSoloHex = { col: col, row: row };
    $('#soloHumanSelection').text(
      translateString('solo_human_selection', null)
        .replace('?c?', col)
        .replace('?r?', row)
    );
  }

  /** Display the two-cube initial sharing instructions. */
  this.showSoloSetup = function () {
    $('#soloSetupDiv').show();
    $('#soloTurnDiv').hide();
    $('#soloHumanDiv').hide();
    $('#soloHumanDiscBtn').hide();
    $('#soloHumanCubeBtn').show();
    $('#soloHumanSelection').empty();
    soloSetStatus('#soloSetupStatus', 'solo_setup_status', 'solo-status-neutral');
    soloSetStatus('#soloGameStatus', 'solo_setup_prompt', 'solo-status-neutral');
  };

  /** Handle a board click according to the current solo phase and action. */
  this.handleSoloHexClick = function (col, row) {
    if (soloActivePlayer !== 1) return;
    if (soloPhase === 'setup') {
      if (soloSetupAiBusy) return;
      soloSetSelection(col, row);
      soloPlaceSetupCube();
      return;
    }
    if (soloPendingPlacement) {
      soloSetSelection(col, row);
      soloSetStatus('#soloTurnStatus', 'solo_place_different_cube', 'solo-status-neutral');
      this.placeSoloMarker('cube');
      return;
    }
    this.selectSoloTurnHex(col, row);
  };

  /** Select the requested hex for a question or a search. */
  this.selectSoloTurnHex = function (col, row) {
    if (!soloIsValidHex(col, row) || soloHasCube(col, row)) {
      soloSetStatus('#soloTurnStatus', 'solo_invalid_cube_hex', 'solo-status-error');
      return;
    }
    soloSetSelection(col, row);
    if (soloAction === 'search') {
      this.performSoloSearch(col, row);
    } else {
      this.performSoloQuestion(col, row);
    }
  };

  /** Choose question or search for the human player's next turn. */
  this.setSoloAction = function (action) {
    if (soloPhase !== 'turns') return;
    if (soloActivePlayer !== 1) return;
    if (soloPendingPlacement) {
      $('input[name="soloTurnChoice"][value="' + (soloAction === 'search' ? 'search' : '2') + '"]').prop('checked', true);
      return;
    }
    soloAction = action === 'search' ? 'search' : 'question';
    soloPendingPlacement = null;
    $('#soloHumanDiv').hide();
    $('#soloQuestionRadioGroup').show();
    const instructionKey = soloAction === 'search' ? 'solo_turn_search_help' : 'solo_turn_question_help';
    $('#soloTurnInstruction').data('tkey', instructionKey).attr('data-tkey', instructionKey);
    translateElement($('#soloTurnInstruction'));
    soloSetStatus(
      '#soloTurnStatus',
      soloAction === 'search' ? 'solo_select_search_hex' : 'solo_select_question_hex',
      'solo-status-neutral'
    );
  };

  function soloAiResultHtml(player, matches) {
    const answerClass = matches ? 'solo-ai-yes' : 'solo-ai-no';
    const answerText = translateString(matches ? 'solo_ai_answer_yes' : 'solo_ai_answer_no', null);
    return '<div class="solo-ai-answer ' + answerClass + '">' +
      playerBadge(player) + translateString('solo_ai_player_name', player) + ': ' + answerText +
    '</div>';
  }

  function soloAddAiMarker(col, row, player, matches) {
    if (!soloMarkerAt(col, row, player)) {
      window.cryptid.map.addPlayerMarker(col, row, player, matches ? 'disc' : 'cube');
    }
  }

  function soloChooseHex(predicate) {
    return getAllHexes().find(function (hex) {
      return !soloHasCube(hex.col, hex.row) && predicate(hex);
    });
  }

  /**
   * Choose a cube location that leaks as little information as possible.
   * A cube proves that this player's clue is false at the chosen hex, so the
   * best public move is the one that leaves the largest number of that
   * player's clue candidates possible. Randomising ties avoids a visible
   * left-to-right placement pattern when several spaces are equivalent.
   *
   * @param {number} player
   * @param {{col:number,row:number}=} excludedHex - Hex being questioned/search
   * @returns {{col:number,row:number}|null}
   */
  function soloChooseAiCube(player, excludedHex) {
    const possible = soloPossibleClues(player);
    let bestScore = -1;
    let bestHexes = [];

    getAllHexes().forEach(function (candidate) {
      if (soloHasCube(candidate.col, candidate.row) ||
          soloMarkerAt(candidate.col, candidate.row, player) ||
          (excludedHex && candidate.col === excludedHex.col && candidate.row === excludedHex.row) ||
          soloClueMatches(candidate.col, candidate.row, player)) {
        return;
      }

      const remainingClues = possible.filter(function (clue) {
        return !soloClueMatchesForKey(candidate.col, candidate.row, clue);
      }).length;

      if (remainingClues > bestScore) {
        bestScore = remainingClues;
        bestHexes = [candidate];
      } else if (remainingClues === bestScore) {
        bestHexes.push(candidate);
      }
    });

    if (!bestHexes.length) return null;
    return bestHexes[Math.floor(Math.random() * bestHexes.length)];
  }

  /** Return the clue catalogue available in the current game mode. */
  function soloCluePool() {
    return isIntro ? INTRO_CLUES : ADVANCED_CLUES;
  }

  /**
   * Infer which clues are still possible for a player from their public pieces.
   * The AI never reads another player's hidden clue; it only uses public evidence.
   */
  function soloPossibleClues(player) {
    const context = soloRulesContext();
    const markers = window.cryptid.map.getPlayerMarkers().filter(function (marker) {
      return marker.player === player;
    });
    return soloCluePool().filter(function (clue) {
      return markers.every(function (marker) {
        const matches = hexSatisfiesClue(
          marker.col,
          marker.row,
          clue,
          context.boardState,
          context.structs
        );
        return marker.type === 'disc' ? matches : !matches;
      });
    });
  }

  /** Choose a question that best splits the target player's possible clues. */
  function soloChooseAiQuestion(player) {
    const targets = [1, 2, 3, 4].filter(function (candidate) {
      return candidate !== player;
    });
    targets.sort(function (a, b) {
      return soloPossibleClues(b).length - soloPossibleClues(a).length;
    });
    const target = targets[0];
    const possible = soloPossibleClues(target);
    let bestHex = null;
    let bestScore = -1;

    getAllHexes().forEach(function (hex) {
      if (soloHasCube(hex.col, hex.row) || soloMarkerAt(hex.col, hex.row, target)) return;
      const trueCount = possible.filter(function (clue) {
        return soloClueMatchesForKey(hex.col, hex.row, clue);
      }).length;
      const falseCount = possible.length - trueCount;
      const splitScore = Math.min(trueCount, falseCount);
      if (splitScore > bestScore) {
        bestScore = splitScore;
        bestHex = hex;
      }
    });

    return { target: target, hex: bestHex || soloChooseHex(function () { return true; }) };
  }

  function soloClueMatchesForKey(col, row, clue) {
    const context = soloRulesContext();
    return hexSatisfiesClue(col, row, clue, context.boardState, context.structs);
  }

  /** Choose a legal search hex with the strongest public evidence. */
  function soloChooseAiSearchHex(player) {
    const opponents = [1, 2, 3, 4].filter(function (candidate) {
      return candidate !== player;
    });
    let bestHex = null;
    let bestScore = -1;
    getAllHexes().forEach(function (hex) {
      if (soloHasCube(hex.col, hex.row) || soloMarkerAt(hex.col, hex.row, player)) return;
      if (!soloClueMatches(hex.col, hex.row, player)) return;
      let score = 0;
      opponents.forEach(function (opponent) {
        const possible = soloPossibleClues(opponent);
        if (possible.some(function (clue) {
          return soloClueMatchesForKey(hex.col, hex.row, clue);
        })) {
          score += 1;
        }
      });
      if (score > bestScore) {
        bestScore = score;
        bestHex = hex;
      }
    });
    return bestHex;
  }

  function soloSetActivePlayerControls(enabled) {
    $('#soloQuestionRadioGroup').toggle(enabled);
    $('input[name="soloTurnChoice"]').prop('disabled', !enabled);
    if (!enabled) $('#soloHumanDiv').hide();
  }

  /** Move from the completed turn to the next player in clockwise order. */
  this.advanceSoloTurn = function () {
    soloActivePlayer = soloActivePlayer === 4 ? 1 : soloActivePlayer + 1;
    if (soloActivePlayer === 1) {
      soloSetActivePlayerControls(true);
      this.setSoloAction($('input[name="soloTurnChoice"]:checked').val() === 'search' ? 'search' : 'question');
      return;
    }

    soloSetActivePlayerControls(false);
    soloSetStatus('#soloTurnStatus', 'solo_ai_turn', 'solo-status-neutral', soloActivePlayer);
    window.setTimeout(function () {
      window.cryptid.game.playSoloAiTurn(soloActivePlayer);
    }, 650);
  };

  /** Let an AI player take a complete question or search turn. */
  this.playSoloAiTurn = function (player) {
    if (soloPhase !== 'turns' || soloActivePlayer !== player) return;
    soloAiTurnCount[player] += 1;
    if (soloAiTurnCount[player] % 3 === 0) {
      this.performSoloAiSearch(player);
    } else {
      this.performSoloAiQuestion(player);
    }
  };

  /** AI question: ask the next player and handle a forced cube. */
  this.performSoloAiQuestion = function (player) {
    const choice = soloChooseAiQuestion(player);
    const target = choice.target;
    const hex = choice.hex;
    if (!hex) {
      soloSetStatus('#soloTurnStatus', 'solo_ai_turn_no_options', 'solo-status-error');
      this.advanceSoloTurn();
      return;
    }

    const matches = soloClueMatches(hex.col, hex.row, target);
    soloAddAiMarker(hex.col, hex.row, target, matches);
    const questionText = translateString('solo_ai_turn_question', player)
      .replace('?q?', translateString('player_' + target, null));
    let html = '<div class="solo-ai-answer solo-status-neutral">' +
      playerBadge(player) + questionText + '</div>' + soloAiResultHtml(target, matches);

    let cubeHex = null;
    if (!matches) {
      cubeHex = soloChooseAiCube(player, hex);
    }
    $('#soloAiResult').html(html);
    if (cubeHex) {
      window.setTimeout(function () {
        window.cryptid.map.addPlayerMarker(cubeHex.col, cubeHex.row, player, 'cube');
        html += '<div class="solo-ai-answer solo-ai-no">' +
          playerBadge(player) + translateString('solo_ai_player_name', player) + ': ' +
          translateString('solo_ai_forced_cube', null) + '</div>';
        $('#soloAiResult').html(html);
        soloSetStatus('#soloTurnStatus', 'solo_ai_turn_complete', 'solo-status-neutral');
        window.setTimeout(function () { window.cryptid.game.advanceSoloTurn(); }, SOLO_MOVE_DELAY);
      }, SOLO_MOVE_DELAY);
    } else {
      soloSetStatus('#soloTurnStatus', 'solo_ai_turn_complete', 'solo-status-neutral');
      window.setTimeout(function () { window.cryptid.game.advanceSoloTurn(); }, SOLO_MOVE_DELAY);
    }
  };

  /** AI search: place a disc, then ask the other players in order. */
  this.performSoloAiSearch = function (player) {
    const hex = soloChooseAiSearchHex(player);
    if (!hex) {
      soloSetStatus('#soloTurnStatus', 'solo_ai_turn_no_options', 'solo-status-error');
      this.advanceSoloTurn();
      return;
    }

    window.cryptid.map.addPlayerMarker(hex.col, hex.row, player, 'disc');
    const results = [
      '<div class="solo-ai-answer solo-status-neutral">' +
      playerBadge(player) + translateString('solo_ai_turn_search', player) + '</div>'
    ];
    function showNextAnswer(offset) {
      const target = ((player - 1 + offset) % 4) + 1;
      const existing = soloMarkerAt(hex.col, hex.row, target);
      const matches = existing ? existing.type === 'disc' : soloClueMatches(hex.col, hex.row, target);
      if (!existing) soloAddAiMarker(hex.col, hex.row, target, matches);
      results.push(soloAiResultHtml(target, matches));
      $('#soloAiResult').html(results.join(''));
      if (!matches) {
        const cubeHex = soloChooseAiCube(player, hex);
        if (cubeHex) {
          window.setTimeout(function () {
            window.cryptid.map.addPlayerMarker(cubeHex.col, cubeHex.row, player, 'cube');
            results.push('<div class="solo-ai-answer solo-ai-no">' +
              playerBadge(player) + translateString('solo_ai_forced_cube', null) + '</div>');
            $('#soloAiResult').html(results.join(''));
            soloSetStatus('#soloTurnStatus', 'solo_ai_turn_complete', 'solo-status-neutral');
            window.setTimeout(function () { window.cryptid.game.advanceSoloTurn(); }, SOLO_MOVE_DELAY);
          }, SOLO_MOVE_DELAY);
        } else {
          soloSetStatus('#soloTurnStatus', 'solo_ai_turn_complete', 'solo-status-neutral');
          window.setTimeout(function () { window.cryptid.game.advanceSoloTurn(); }, SOLO_MOVE_DELAY);
        }
        return;
      }
      if (offset < 3) {
        window.setTimeout(function () { showNextAnswer(offset + 1); }, SOLO_MOVE_DELAY);
      } else {
        soloSetStatus('#soloTurnStatus', 'solo_ai_win', 'solo-status-win', player);
        window.cryptid.game.showHabitatReveal();
      }
    }
    window.setTimeout(function () { showNextAnswer(1); }, SOLO_MOVE_DELAY);
  };

  /** Let each AI player place one initial cube after the human's cube. */
  function soloPlaceAiSetupCubes(done) {
    const players = [2, 3, 4];
    let index = 0;
    soloSetupAiBusy = true;
    function placeNext() {
      if (index >= players.length) {
        soloSetupAiBusy = false;
        if (done) done();
        return;
      }
      const player = players[index];
      index += 1;
      const hex = soloChooseAiCube(player);
      if (hex) {
        window.cryptid.map.addPlayerMarker(hex.col, hex.row, player, 'cube');
      }
      window.setTimeout(placeNext, SOLO_MOVE_DELAY);
    }
    placeNext();
  }

  /** Place one of the human player's two initial cubes. */
  function soloPlaceSetupCube() {
    if (!selectedSoloHex) return;
    const col = selectedSoloHex.col;
    const row = selectedSoloHex.row;
    if (!soloIsValidHex(col, row) || soloHasCube(col, row)) {
      soloSetStatus('#soloSetupStatus', 'solo_invalid_cube_hex', 'solo-status-error');
      return;
    }
    if (soloClueMatches(col, row, 1)) {
      soloSetStatus('#soloSetupStatus', 'solo_setup_disc_required', 'solo-status-error');
      return;
    }
    window.cryptid.map.addPlayerMarker(col, row, 1, 'cube');
    soloSetupCount += 1;
    soloPlaceAiSetupCubes(function () {
      if (soloSetupCount < 2) {
        soloSetStatus('#soloSetupStatus', 'solo_setup_second_cube', 'solo-status-neutral');
        soloSetStatus('#soloGameStatus', 'solo_setup_second_cube', 'solo-status-neutral');
      } else {
        soloPhase = 'turns';
        $('#soloSetupDiv').hide();
        $('#soloTurnDiv').show();
        $('#soloHumanDiv').hide();
        // A previous AI turn may have disabled the radio group. The human
        // player owns the first turn after setup, so explicitly unlock it.
        soloSetActivePlayerControls(true);
        $('input[name="soloTurnChoice"][value="2"]').prop('checked', true);
        soloSetStatus('#soloTurnStatus', 'solo_turn_ready', 'solo-status-neutral');
        window.cryptid.game.setSoloAction('question');
      }
      selectedSoloHex = null;
    });
  }

  /** Resolve a question: ask one AI and enforce the cube consequence. */
  this.performSoloQuestion = function (col, row) {
    const player = parseInt($('input[name="soloTurnChoice"]:checked').val(), 10);
    const matches = soloClueMatches(col, row, player);
    soloAddAiMarker(col, row, player, matches);
    $('#soloAiResult').html(soloAiResultHtml(player, matches));
    if (matches) {
      soloPendingPlacement = null;
      soloPendingOrigin = null;
      $('#soloHumanDiv').hide();
      soloSetStatus('#soloTurnStatus', 'solo_question_disc', 'solo-status-neutral');
      window.setTimeout(function () { window.cryptid.game.advanceSoloTurn(); }, 900);
    } else {
      soloPendingPlacement = 'question_cube';
      soloPendingOrigin = { col: col, row: row };
      $('#soloHumanDiv').hide();
      soloSetStatus('#soloTurnStatus', 'solo_place_different_cube', 'solo-status-neutral');
    }
  };

  /** Resolve a search, stopping immediately when an AI places a cube. */
  this.performSoloSearch = function (col, row) {
    if (!soloClueMatches(col, row, 1)) {
      soloSetStatus('#soloTurnStatus', 'solo_search_needs_disc', 'solo-status-error');
      return;
    }
    if (soloMarkerAt(col, row, 1)) {
      soloSetStatus('#soloTurnStatus', 'solo_own_marker_exists', 'solo-status-error');
      return;
    }

    window.cryptid.map.addPlayerMarker(col, row, 1, 'disc');
    const results = [];
    function showNextSearchAnswer(index) {
      const player = [2, 3, 4][index];
      const existing = soloMarkerAt(col, row, player);
      const matches = existing ? existing.type === 'disc' : soloClueMatches(col, row, player);
      if (!existing) soloAddAiMarker(col, row, player, matches);
      results.push(soloAiResultHtml(player, matches));
      $('#soloAiResult').html(results.join(''));

      if (!matches) {
        soloPendingPlacement = 'search_cube';
        soloPendingOrigin = { col: col, row: row };
        $('#soloHumanDiv').hide();
        soloSetStatus('#soloTurnStatus', 'solo_search_stopped', 'solo-status-neutral');
        return;
      }
      if (index < 2) {
        window.setTimeout(function () { showNextSearchAnswer(index + 1); }, SOLO_MOVE_DELAY);
      } else {
        soloPendingPlacement = null;
        soloPendingOrigin = null;
        $('#soloHumanDiv').hide();
        soloSetStatus('#soloTurnStatus', 'solo_win', 'solo-status-win');
        window.cryptid.game.showHabitatReveal();
      }
    }
    window.setTimeout(function () { showNextSearchAnswer(0); }, SOLO_MOVE_DELAY);
  };

  /** Complete a required human cube placement or the initial sharing. */
  this.placeSoloMarker = function (markerType) {
    if (!selectedSoloHex || !currentGame || !currentSetup || !currentSetup[0]) return;
    if (soloPhase === 'setup') {
      soloPlaceSetupCube();
      return;
    }
    if (!soloPendingPlacement || markerType !== 'cube') return;

    const col = selectedSoloHex.col;
    const row = selectedSoloHex.row;
    const isOrigin = soloPendingOrigin && soloPendingOrigin.col === col && soloPendingOrigin.row === row;
    if (isOrigin || !soloIsValidHex(col, row) || soloHasCube(col, row) || soloMarkerAt(col, row, 1)) {
      soloSetStatus('#soloTurnStatus', 'solo_invalid_cube_hex', 'solo-status-error');
      return;
    }
    if (soloClueMatches(col, row, 1)) {
      soloSetStatus('#soloTurnStatus', 'solo_cube_needs_negative', 'solo-status-error');
      return;
    }
    window.cryptid.map.addPlayerMarker(col, row, 1, 'cube');
    soloPendingPlacement = null;
    soloPendingOrigin = null;
    selectedSoloHex = null;
    $('#soloHumanDiv').hide();
    soloSetStatus('#soloTurnStatus', 'solo_cube_placed', 'solo-status-neutral');
    window.setTimeout(function () { window.cryptid.game.advanceSoloTurn(); }, 900);
  };

  /**
   * Switch from reminder mode to the sequential pass-the-device clue flow.
   * Called when the user clicks the "Use pass-the-device mode" button.
   */
  this.enablePassTheDevice = function () {
    $(SEL_REMINDER_DIV).slideUp();
    $(SEL_TARGET_DIV).slideUp();
    $(SEL_HINT_DIV).slideUp();
    clueReminderState  = 0;
    this.clueDisplaying = 0;
    $(SEL_CLUE_DIV).slideDown('slow');
    this.showClue();
  };

  // -------------------------------------------------------------------------
  // Sharing UI
  // -------------------------------------------------------------------------

  /**
   * Cycle the share format: short → plain → obfuscated → short.
   * Repopulates the panel immediately if it is open.
   */
  this.cycleShareFormat = function () {
    const ORDER = ['short', 'plain', 'obfuscated'];
    _shareFormat = ORDER[(ORDER.indexOf(_shareFormat) + 1) % ORDER.length];
    if ($('#shareOptions').is(':visible')) {
      this._populateSharePanel();
    }
  };

  /**
   * Populate the sharing panel content (code + player links) without changing visibility.
   * @private
   */
  this._populateSharePanel = function () {
    const LABEL_KEYS = {
      short:       'share_format_short',
      plain:       'share_format_plain',
      obfuscated:  'share_format_obfuscated',
    };
    const code    = window.cryptid.sharing.encodeGame(
      currentGame.key,
      currentGame.mode,
      playerCount,
      currentSetup[0].rules,
      _shareFormat
    );
    const gameUrl = window.cryptid.sharing.buildGameUrl(code);

    // Update the format label next to the cycle button
    $('#shareFormatLabel').data('tkey', LABEL_KEYS[_shareFormat]);
    translateElement($('#shareFormatLabel'));

    // Code div — clicking it copies the raw code text
    $('#shareCode').text(code);

    // Main copy button — copies the full game URL
    $('#shareCodeCopy')
      .attr('data-copyurl', gameUrl)
      .data('tkey', 'share_copy_link');
    translateElement($('#shareCodeCopy'));

    // Per-player links
    const entries = window.cryptid.sharing.buildPlayerUrls(code);
    const list    = $('#sharePlayerLinks').empty();

    entries.forEach(function (entry) {
      let entryBadge = '';
      if (entry.label === 'share_players_12') {
        entryBadge = playerBadge(1) + playerBadge(2);
      } else if (entry.label === 'share_players_34') {
        entryBadge = playerBadge(3) + playerBadge(4);
      } else if (entry.tpnum !== null) {
        entryBadge = playerBadgesForPlayer(entry.tpnum, playerCount);
      }

      const label = $('<span>').data('tkey', entry.label);
      if (entry.tpnum !== null) label.data('tpnum', entry.tpnum);
      if (entryBadge) label.data('badgeHtml', entryBadge);
      translateElement(label);

      const btn = $('<button>')
        .addClass('w3-button w3-small cryptid-highlight cryptid-hover-highlight w3-margin-left')
        .data('tkey', 'share_copy_link')
        .attr('data-copyurl', entry.url);
      translateElement(btn);
      btn.on('click', function () {
        const url  = $(this).attr('data-copyurl');
        const self = this;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(function () {
            $(self).data('tkey', 'share_copied');
            translateElement($(self));
            setTimeout(function () {
              $(self).data('tkey', 'share_copy_link');
              translateElement($(self));
            }, 2000);
          });
        } else {
          window.prompt(translateString('share_code_label', null), url);
        }
      });

      list.append($('<li>').addClass('w3-margin-bottom').append(label).append(btn));
    });
  };

  /**
   * Toggle the share options panel open/closed.
   * Populates content before opening; collapses on second press.
   */
  this.toggleSharePanel = function () {
    if (!currentGame || !currentSetup) return;

    if ($('#shareOptions').is(':visible')) {
      $('#shareOptions').slideUp('slow');
      $('#shareBtn').data('tkey', 'share_show_options');
      translateElement($('#shareBtn'));
    } else {
      this._populateSharePanel();
      $('#shareOptions').slideDown('slow');
      $('#shareBtn').data('tkey', 'share_hide_options');
      translateElement($('#shareBtn'));
    }
  };

  /**
   * Refresh the sharing panel URLs (e.g. after a language change).
   * No-op if the share options are not currently expanded.
   */
  this.refreshSharePanel = function () {
    if ($('#shareOptions').is(':visible')) {
      this._populateSharePanel();
    }
  };

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------

  /** @param {string} selector */
  this.showDiv = function (selector) { $(selector).show(); };

  /** @param {string} selector */
  this.hideDiv = function (selector) { $(selector).hide(); };

  // -------------------------------------------------------------------------
  // Cheat sheet
  // -------------------------------------------------------------------------

  this.showCheatSheet = function () {
    $(SEL_CHEAT_DIV).toggleClass('solo-cheat-sheet', soloMode === true);
    $(SEL_CHEAT_DIV).slideDown();
  };

  this.toggleCheatSheet = function () {
    const body = $('#cheatSheetBody');
    const btn  = $('#cheatSheetBtn');
    if (body.is(':visible')) {
      body.slideUp('slow');
      btn.data('tkey', 'cheat_show');
    } else {
      body.slideDown('slow');
      btn.data('tkey', 'cheat_hide');
    }
    translateElement(btn);
  };
}

(() => {
  'use strict';

  const SAVE_KEY = 'arcade-atlas-pixel-garden-v1';
  const BED_COUNT = 12;
  const ACTIONS_PER_DAY = 7;
  const CROPS = {
    sunbell: { name: 'Sunbell', plural: 'Sunbells', glyph: '✿', color: '#ffd876', grow: 2, price: 3, seedCost: 2, unlock: 0 },
    moonmint: { name: 'Moonmint', plural: 'Moonmints', glyph: '❋', color: '#9eedd0', grow: 3, price: 4, seedCost: 3, unlock: 0 },
    glowcap: { name: 'Glowcap', plural: 'Glowcaps', glyph: '✦', color: '#d3b7ff', grow: 3, price: 7, seedCost: 6, unlock: 2 },
    starbloom: { name: 'Starbloom', plural: 'Starblooms', glyph: '✺', color: '#ff9e9a', grow: 4, price: 10, seedCost: 9, unlock: 4 },
  };
  const ORDERS = [
    { crop: 'sunbell', qty: 2, petals: 8, dew: 2 },
    { crop: 'moonmint', qty: 2, petals: 10, dew: 2 },
    { crop: 'glowcap', qty: 1, petals: 14, dew: 3 },
    { crop: 'sunbell', qty: 3, petals: 15, dew: 3 },
    { crop: 'starbloom', qty: 2, petals: 22, dew: 4 },
    { crop: 'moonmint', qty: 3, petals: 19, dew: 4 },
  ];
  const freshGarden = () => ({ day: 1, dew: 4, petals: 8, actions: ACTIONS_PER_DAY, notes: 0, totalHarvested: 0, seeds: { sunbell: 2, moonmint: 2, glowcap: 0, starbloom: 0 }, basket: { sunbell: 0, moonmint: 0, glowcap: 0, starbloom: 0 }, plants: Array.from({ length: BED_COUNT }, () => null) });
  const $ = (selector) => document.querySelector(selector);
  const board = $('#garden-board');
  const saveStatus = $('#save-status');
  let state = loadGarden();
  let tool = 'plant';
  let selectedSeed = 'sunbell';
  let soundOn = true;
  let audioContext = null;
  let toastTimer = 0;
  let lastMessage = '';
  const TUTORIAL_KEY = `${SAVE_KEY}-tutorial`;
  const tutorial = [
    ['Choose a seed', 'Pick Sunbell or Moonmint from your seed pouch, then plant it in an empty bed.', 'seed'],
    ['Plant a little start', 'Choose an empty bed. Planting uses one daylight action.', 'plant'],
    ['Pick the Water tool', 'Select Water in Garden tools. Rainy days water the whole patch for free.', 'water-tool'],
    ['Give it a drink', 'Tap the new plant to spend one dew drop and help it grow tonight.', 'water'],
    ['Let night pass', 'Use End day. Watered plants grow one stage, and every fourth day brings rain.', 'end-day'],
    ['Choose Harvest', 'After a few watered nights, a sparkle marks a flower that is ready to pick.', 'harvest-tool'],
    ['Gather a bloom', 'Tap a ready flower, then fill the neighbor’s market request for a reward.', 'harvest'],
  ];
  let tutorialStep = 0;
  let tutorialDismissed = false;
  try { const saved = JSON.parse(localStorage.getItem(TUTORIAL_KEY) || 'null'); tutorialStep = Math.max(0, Math.min(tutorial.length, Number(saved?.step) || 0)); tutorialDismissed = Boolean(saved?.dismissed); } catch { /* The guide still works without storage. */ }

  function renderTutorial() {
    const coach = $('#tutorial-coach');
    if (!coach) return;
    coach.hidden = tutorialDismissed || tutorialStep >= tutorial.length;
    if (tutorialStep >= tutorial.length) {
      $('#coach-step').textContent = 'GUIDE COMPLETE';
      $('#coach-title').textContent = 'You know your way around.';
      $('#coach-copy').textContent = 'Your garden keeps growing at your pace. Open “How to grow” any time for a refresher.';
      return;
    }
    const [title, copy] = tutorial[tutorialStep];
    $('#coach-step').textContent = `GUIDE · ${tutorialStep + 1} / ${tutorial.length}`;
    $('#coach-title').textContent = title;
    $('#coach-copy').textContent = copy;
  }
  function advanceTutorial(action) {
    if (tutorialDismissed || tutorialStep >= tutorial.length || tutorial[tutorialStep][2] !== action) return;
    tutorialStep += 1;
    try { localStorage.setItem(TUTORIAL_KEY, JSON.stringify({ step: tutorialStep, dismissed: false })); } catch { /* The guide continues for this session. */ }
    renderTutorial();
  }

  function loadGarden() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (saved && Array.isArray(saved.plants) && saved.plants.length === BED_COUNT && saved.seeds && saved.basket) {
        const initial = freshGarden();
        return {
          ...initial,
          ...saved,
          seeds: { ...initial.seeds, ...saved.seeds },
          basket: { ...initial.basket, ...saved.basket },
          plants: saved.plants.map((p) => p && CROPS[p.type] ? { type: p.type, growth: Math.max(0, Math.min(CROPS[p.type].grow, Number(p.growth) || 0)), watered: Boolean(p.watered) } : null),
          day: Math.max(1, Number(saved.day) || 1),
          dew: Math.max(0, Number(saved.dew) || 0),
          petals: Math.max(0, Number(saved.petals) || 0),
          actions: Math.max(0, Math.min(ACTIONS_PER_DAY, Number(saved.actions) || 0)),
          notes: Math.max(0, Number(saved.notes) || 0),
          totalHarvested: Math.max(0, Number(saved.totalHarvested) || 0),
        };
      }
    } catch { /* Start with a fresh patch if saved data is unavailable. */ }
    return freshGarden();
  }

  function saveGarden() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      saveStatus.innerHTML = '<i></i> SAVED ON THIS DEVICE';
    } catch {
      saveStatus.innerHTML = '<i class="save-warning"></i> SAVE UNAVAILABLE';
    }
  }

  function say(message) {
    if (message === lastMessage) message = `${message} ✦`;
    lastMessage = message;
    const toast = $('#garden-toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
    $('#garden-announcer').textContent = message;
  }

  function playNote(frequency = 520) {
    if (!soundOn) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, audioContext.currentTime);
      osc.frequency.exponentialRampToValueAtTime(frequency * 1.32, audioContext.currentTime + 0.09);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.075, audioContext.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.19);
      osc.connect(gain).connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + 0.2);
    } catch { /* Audio is a small extra; the game works without it. */ }
  }

  function currentOrder() {
    return ORDERS[state.notes % ORDERS.length];
  }

  function isRainy() {
    return state.day % 4 === 0;
  }

  function useAction() {
    if (state.actions <= 0) {
      say('That’s all the daylight for today. End the day when you’re ready.');
      return false;
    }
    state.actions -= 1;
    return true;
  }

  function renderBoard() {
    board.replaceChildren();
    state.plants.forEach((plant, index) => {
      const bed = document.createElement('button');
      bed.type = 'button';
      bed.className = `garden-bed${plant ? ' has-plant' : ' empty-bed'}${plant?.watered ? ' is-watered' : ''}${plant && plant.growth >= CROPS[plant.type].grow ? ' is-ready' : ''}`;
      bed.dataset.plot = String(index);
      if (!plant) {
        bed.setAttribute('aria-label', `Garden bed ${index + 1}, empty. ${tool === 'plant' ? `Plant a ${CROPS[selectedSeed].name}.` : 'Choose Plant to use a seed.'}`);
        bed.innerHTML = '<span class="bed-plus" aria-hidden="true">＋</span><small>EMPTY</small>';
      } else {
        const crop = CROPS[plant.type];
        const ready = plant.growth >= crop.grow;
        const stage = ready ? 'In bloom, ready to pick.' : `Growth ${plant.growth} of ${crop.grow}.`;
        bed.style.setProperty('--crop-color', crop.color);
        bed.setAttribute('aria-label', `Bed ${index + 1}: ${crop.name}. ${stage} ${plant.watered ? 'Watered.' : 'Needs water.'}`);
        bed.innerHTML = `<span class="plant-shoot stage-${Math.min(plant.growth, 3)} ${ready ? 'blooming' : ''}" aria-hidden="true"><i></i><b>${ready ? crop.glyph : plant.growth ? '✤' : '·'}</b></span><span class="plant-name">${crop.name}</span><small class="bed-state ${ready ? 'ready-label' : plant.watered ? 'watered-label' : ''}">${ready ? '✦ PICK' : plant.watered ? 'WATERED' : 'NEEDS DEW'}</small>${ready ? '<span class="ready-spark" aria-hidden="true">✧</span>' : ''}`;
      }
      bed.addEventListener('click', () => tendBed(index));
      board.append(bed);
    });
  }

  function renderSeeds() {
    const list = $('#seed-list');
    list.replaceChildren();
    Object.entries(CROPS).forEach(([key, crop]) => {
      const unlocked = state.notes >= crop.unlock;
      const row = document.createElement('div');
      row.className = `seed-row${selectedSeed === key ? ' chosen' : ''}${unlocked ? '' : ' locked-seed'}`;
      const choose = document.createElement('button');
      choose.type = 'button';
      choose.className = 'seed-select';
      choose.disabled = !unlocked;
      choose.setAttribute('aria-pressed', String(selectedSeed === key));
      choose.setAttribute('aria-label', unlocked ? `Select ${crop.name} seeds, ${state.seeds[key]} in pouch` : `${crop.name} locked: complete ${crop.unlock} market notes`);
      choose.innerHTML = `<span class="seed-glyph" style="--crop-color:${crop.color}">${crop.glyph}</span><span><b>${unlocked ? crop.name : '???'}</b><small>${unlocked ? `${state.seeds[key]} in pouch · ${crop.grow} nights` : `Unlock at ${crop.unlock} notes`}</small></span>`;
      choose.addEventListener('click', () => { selectedSeed = key; advanceTutorial('seed'); setTool('plant'); render(); });
      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'seed-buy';
      buy.textContent = unlocked ? `＋${crop.seedCost}` : '🔒';
      buy.disabled = !unlocked || state.petals < crop.seedCost;
      buy.setAttribute('aria-label', unlocked ? `Buy one ${crop.name} seed for ${crop.seedCost} petals` : `${crop.name} is locked`);
      buy.addEventListener('click', () => buySeed(key));
      row.append(choose, buy);
      list.append(row);
    });
  }

  function renderOrder() {
    const order = currentOrder();
    const crop = CROPS[order.crop];
    $('#order-title').textContent = `${order.qty} ${crop.plural}`;
    $('#order-description').textContent = `Bring ${order.qty} ${crop.plural} to the market table.`;
    $('#order-reward').textContent = `+${order.petals} petals · +${order.dew} dew`;
    $('#deliver-order').disabled = (state.basket[order.crop] || 0) < order.qty;
    const total = Object.values(state.basket).reduce((sum, amount) => sum + amount, 0);
    $('#basket-summary').textContent = total ? Object.entries(state.basket).filter(([, amount]) => amount > 0).map(([key, amount]) => `${CROPS[key].name} ×${amount}`).join(' · ') : 'Empty for now';
    $('#journal-count').textContent = `${state.notes} / 2 market notes`;
    $('#journal-fill').style.width = `${Math.min(100, (state.notes % 2) * 50 || (state.notes >= 2 ? 100 : 0))}%`;
    const rank = state.notes >= 4 ? 'MOON GARDENER' : state.notes >= 2 ? 'PATCH KEEPER' : state.totalHarvested >= 3 ? 'FLOWER FRIEND' : 'SEEDLING';
    $('#garden-rank').textContent = rank;
    $('#journal-text').textContent = state.notes >= 4 ? 'The Starbloom seed is yours. The garden is full of little night lights.' : state.notes >= 2 ? 'Glowcaps are now in your pouch. Two more market notes reveal a rare bloom.' : 'Fill two market notes to discover the glowing Glowcap seed.';
  }

  function render() {
    $('#day-value').textContent = String(state.day).padStart(2, '0');
    $('#dew-value').textContent = String(state.dew);
    $('#petal-value').textContent = String(state.petals);
    $('#action-value').textContent = `${state.actions} / ${ACTIONS_PER_DAY}`;
    $('#weather-label').textContent = isRainy() ? 'RAIN · FREE WATER' : 'SUNNY · SOFT LIGHT';
    $('#weather-label').classList.toggle('rainy', isRainy());
    $('#next-day').textContent = state.actions ? 'End day ↗' : 'Nightfall ↗';
    $('#next-day').setAttribute('aria-label', state.actions ? `End day with ${state.actions} actions remaining` : 'End the day');
    $('#deliver-order').disabled = (state.basket[currentOrder().crop] || 0) < currentOrder().qty;
    $('#sell-basket').disabled = Object.values(state.basket).every((amount) => amount === 0);
    document.querySelectorAll('.tool-button').forEach((button) => {
      const selected = button.dataset.tool === tool;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    $('#tool-tip').textContent = tool === 'plant'
      ? `Planting ${CROPS[selectedSeed].name}: choose an empty bed. Each action uses one daylight.`
      : tool === 'water'
        ? isRainy() ? 'Rain is watering the whole patch today. Save your dew for another day.' : 'Choose a plant that needs water. One dew drop helps it grow tonight.'
        : 'Choose a flower with a sparkle to pick it and place it in your basket.';
    renderBoard();
    renderSeeds();
    renderOrder();
    saveGarden();
  }

  function setTool(nextTool) {
    tool = nextTool;
    render();
    playNote(nextTool === 'plant' ? 520 : nextTool === 'water' ? 610 : 700);
    advanceTutorial(`${nextTool}-tool`);
  }

  function tendBed(index) {
    const plant = state.plants[index];
    if (tool === 'plant') {
      if (plant) return say('That bed already has a little plant growing in it.');
      if (!state.seeds[selectedSeed]) return say(`No ${CROPS[selectedSeed].name} seeds left. Buy a seed from the pouch.`);
      if (!useAction()) return;
      state.seeds[selectedSeed] -= 1;
      state.plants[index] = { type: selectedSeed, growth: 0, watered: isRainy() };
      say(`${CROPS[selectedSeed].name} planted. Give it a drink so it grows tonight.`);
      advanceTutorial('plant');
      playNote(540);
    } else if (tool === 'water') {
      if (!plant) return say('Plant a seed in that bed first.');
      if (plant.growth >= CROPS[plant.type].grow) return say('That flower is ready to pick. It does not need water.');
      if (plant.watered || isRainy()) return say(isRainy() ? 'The rain has watered this bed already.' : 'That plant has had its drink for today.');
      if (state.dew < 1) return say('Your dew jug is empty. Deliver a bouquet or wait for rain.');
      if (!useAction()) return;
      state.dew -= 1;
      plant.watered = true;
      say(`A cool drink for the ${CROPS[plant.type].name.toLowerCase()}.`);
      advanceTutorial('water');
      playNote(620);
    } else if (tool === 'harvest') {
      if (!plant) return say('There is nothing growing in that bed yet.');
      if (plant.growth < CROPS[plant.type].grow) return say(`${CROPS[plant.type].name} needs a few more nights. Keep tending it.`);
      if (!useAction()) return;
      state.basket[plant.type] = (state.basket[plant.type] || 0) + 1;
      state.plants[index] = null;
      state.totalHarvested += 1;
      if (plant.type === 'moonmint') state.dew += 1;
      say(`${CROPS[plant.type].name} gathered${plant.type === 'moonmint' ? ' · +1 dew' : ''}.`);
      advanceTutorial('harvest');
      playNote(740);
    }
    render();
  }

  function buySeed(key) {
    const crop = CROPS[key];
    if (state.notes < crop.unlock) return say('Keep filling market notes to discover that seed.');
    if (state.petals < crop.seedCost) return say(`You need ${crop.seedCost} petals to buy a ${crop.name} seed.`);
    state.petals -= crop.seedCost;
    state.seeds[key] = (state.seeds[key] || 0) + 1;
    selectedSeed = key;
    setTool('plant');
    say(`One ${crop.name} seed tucked into your pouch.`);
    playNote(660);
  }

  function deliverOrder() {
    const order = currentOrder();
    if ((state.basket[order.crop] || 0) < order.qty) return say('The bouquet is not quite ready yet.');
    state.basket[order.crop] -= order.qty;
    state.petals += order.petals;
    state.dew += order.dew;
    state.seeds[order.crop] = (state.seeds[order.crop] || 0) + 1;
    state.notes += 1;
    const unlocked = state.notes === 2 ? ' Glowcaps have opened in the seed pouch!' : state.notes === 4 ? ' A rare Starbloom seed is now available!' : '';
    say(`Bouquet delivered · +${order.petals} petals, +${order.dew} dew, +1 seed.${unlocked}`);
    render();
    playNote(880);
  }

  function sellBasket() {
    let total = 0;
    const sold = [];
    Object.entries(state.basket).forEach(([key, amount]) => {
      if (!amount) return;
      total += CROPS[key].price * amount;
      sold.push(`${CROPS[key].name} ×${amount}`);
      state.basket[key] = 0;
    });
    if (!total) return say('Your basket is empty.');
    state.petals += total;
    say(`The market paid ${total} petals for ${sold.join(', ')}.`);
    render();
    playNote(660);
  }

  function endDay() {
    let grown = 0;
    state.plants.forEach((plant) => {
      if (!plant) return;
      if (plant.watered && plant.growth < CROPS[plant.type].grow) {
        plant.growth += 1;
        grown += 1;
      }
      plant.watered = false;
    });
    state.day += 1;
    state.actions = ACTIONS_PER_DAY;
    if (isRainy()) state.plants.forEach((plant) => { if (plant && plant.growth < CROPS[plant.type].grow) plant.watered = true; });
    say(grown ? `Day ${state.day - 1} is done. ${grown} ${grown === 1 ? 'plant grew' : 'plants grew'} under the moon.` : `Day ${state.day - 1} is done. The garden gets another quiet night.`);
    advanceTutorial('end-day');
    render();
    playNote(480);
  }

  function resetGarden() {
    if (!window.confirm('Start over with a fresh little garden? This clears the garden saved in this browser.')) return;
    state = freshGarden();
    selectedSeed = 'sunbell';
    tool = 'plant';
    render();
    say('A fresh patch, ready for its first seed.');
  }

  document.querySelectorAll('.tool-button').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
  $('#next-day').addEventListener('click', endDay);
  $('#deliver-order').addEventListener('click', deliverOrder);
  $('#sell-basket').addEventListener('click', sellBasket);
  $('#reset-button').addEventListener('click', resetGarden);
  $('#sound-toggle').addEventListener('click', (event) => {
    soundOn = !soundOn;
    event.currentTarget.textContent = soundOn ? '♫ Sound on' : '♫ Sound off';
    event.currentTarget.setAttribute('aria-pressed', String(soundOn));
    event.currentTarget.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
    if (soundOn) playNote(540);
  });
  const helpDialog = $('#help-dialog');
  function openHelp() { helpDialog.showModal(); }
  $('#help-button').addEventListener('click', openHelp);
  function restartTutorial() { tutorialStep = 0; tutorialDismissed = false; try { localStorage.setItem(TUTORIAL_KEY, JSON.stringify({ step: 0, dismissed: false })); } catch { /* Use the guide for this session. */ } renderTutorial(); $('#seed-list').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  $('#tutorial-show').addEventListener('click', restartTutorial);
  $('#tutorial-reopen').addEventListener('click', restartTutorial);
  $('#tutorial-skip').addEventListener('click', () => { tutorialDismissed = true; try { localStorage.setItem(TUTORIAL_KEY, JSON.stringify({ step: tutorialStep, dismissed: true })); } catch { /* Dismiss for this session. */ } renderTutorial(); });
  $('#help-close').addEventListener('click', () => helpDialog.close());
  $('#got-it').addEventListener('click', () => helpDialog.close());
  helpDialog.addEventListener('click', (event) => { if (event.target === helpDialog) helpDialog.close(); });

  render();
  renderTutorial();
  let visited = false;
  try { visited = localStorage.getItem(`${SAVE_KEY}-visited`) === 'true'; } catch { /* Continue without browser storage. */ }
  if (!visited) {
    openHelp();
    try { localStorage.setItem(`${SAVE_KEY}-visited`, 'true'); } catch { /* Help remains available from the button. */ }
  }
})();

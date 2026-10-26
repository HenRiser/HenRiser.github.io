import {MAX_HEIGHT, MAX_COLUMNS, PRESETS, traceRainWater} from './rain-model.mjs';

const root = document.getElementById('rain-lab');
if (root) {
  const find = selector => root.querySelector(selector);
  const canvas = find('canvas');
  const ctx = canvas.getContext('2d');
  const preset = find('[data-rain-preset]');
  const height = find('#rain-height');
  const column = find('#rain-column');
  const count = find('[data-rain-count]');
  const timeline = find('[data-rain-step]');
  const play = find('[data-rain-play]');
  const speed = find('[data-rain-speed]');
  const note = find('[data-rain-note]');
  let heights = [...PRESETS.classic];
  let frames = traceRainWater(heights);
  let step = frames.length - 1;
  let selected = 5;
  let timer = null;
  let dragging = null;
  let geometry;
  let basePreset = 'classic';
  root.hidden = false;

  const put = (name, value) => { find(`[data-rain-${name}]`).textContent = value; };
  function stop() {
    clearTimeout(timer);
    timer = null;
    root.classList.remove('is-playing');
    play.setAttribute('aria-label', '播放过程');
    play.title = '播放过程';
    note.setAttribute('aria-live', 'polite');
  }
  function draw() {
    const frame = frames[step];
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * scale);
    canvas.height = Math.round(rect.height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const styles = getComputedStyle(root);
    const color = token => styles.getPropertyValue(token).trim();
    const width = rect.width;
    const plot = {left: 32, right: width - 10, top: 36, bottom: rect.height - 28};
    const unit = (plot.bottom - plot.top) / MAX_HEIGHT;
    const cell = (plot.right - plot.left) / heights.length;
    geometry = {...plot, cell, unit};
    ctx.clearRect(0, 0, width, rect.height);
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let value = 0; value <= MAX_HEIGHT; value += 2) {
      const y = plot.bottom - value * unit;
      ctx.strokeStyle = color('--line');
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(plot.left, y); ctx.lineTo(plot.right, y); ctx.stroke();
      ctx.fillStyle = color('--muted'); ctx.fillText(String(value), plot.left - 9, y + 4);
    }
    ctx.textAlign = 'center';
    heights.forEach((value, i) => {
      const x = plot.left + i * cell + 2;
      const barWidth = Math.max(4, cell - 4);
      const groundY = plot.bottom - value * unit;
      ctx.fillStyle = color('--rain-stone');
      ctx.fillRect(x, groundY, barWidth, Math.max(value * unit, 2));
      if (frame.water[i] > 0) {
        ctx.fillStyle = color('--rain-water');
        ctx.fillRect(x, groundY - frame.water[i] * unit, barWidth, frame.water[i] * unit);
      }
      if (i === selected) {
        ctx.strokeStyle = color('--accent'); ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, groundY - 1, Math.max(2, barWidth - 2), Math.max(3, value * unit));
        ctx.fillStyle = color('--accent');
        ctx.beginPath(); ctx.arc(x + barWidth / 2, groundY, 4, 0, Math.PI * 2); ctx.fill();
      }
      if (i === frame.index) {
        ctx.fillStyle = color('--rain-current');
        ctx.fillRect(x, plot.bottom + 3, barWidth, 3);
      }
      ctx.fillStyle = color('--muted');
      // Sparse index labels keep the plot readable at 320px; the select lists every index.
      if (cell >= 23 || i % 2 === 0 || i === heights.length - 1) ctx.fillText(String(i), x + barWidth / 2, plot.bottom + 21);
    });
    const pointer = (index, label, paint, row) => {
      const x = plot.left + (index + 0.5) * cell;
      ctx.fillStyle = paint;
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText(label, x, 15 + row * 13);
      ctx.strokeStyle = paint;
      ctx.beginPath(); ctx.moveTo(x, 20 + row * 13); ctx.lineTo(x, plot.bottom - heights[index] * unit - 8); ctx.stroke();
    };
    if (frame.l === frame.r) pointer(frame.l, 'L=R', color('--accent'), 0);
    else {
      pointer(frame.l, 'L', color('--accent'), 0);
      pointer(frame.r, 'R', color('--warm'), frame.r - frame.l === 1 && cell < 24 ? 1 : 0);
    }
  }
  function render() {
    const frame = frames[step];
    put('total', frame.total);
    put('count-value', heights.length);
    put('height-value', heights[selected]);
    put('step-value', `${step} / ${frames.length - 1}`);
    for (const key of ['l', 'r']) put(key, frame[key]);
    put('lmax', frame.lMax); put('rmax', frame.rMax); put('added', frame.added);
    count.value = heights.length;
    height.value = heights[selected];
    height.setAttribute('aria-label', `第 ${selected} 根柱子的高度`);
    column.value = selected;
    timeline.max = frames.length - 1;
    timeline.value = step;
    timeline.setAttribute('aria-valuetext', `第 ${step} 步，共 ${frames.length - 1} 步，已累计 ${frame.total} 单位`);
    find('[data-rain-prev]').disabled = step === 0;
    find('[data-rain-start]').disabled = step === 0;
    find('[data-rain-next]').disabled = step === frames.length - 1;
    find('[data-rain-end]').disabled = step === frames.length - 1;
    put('input', `height = [${heights.join(', ')}]`);
    if (step === 0) note.textContent = '初始状态：左右指针位于两端，尚未结算任何柱子。';
    else {
      const direction = frame.side === 'left' ? '左边界不高于右边界' : '右边界较低';
      const finish = step === frames.length - 1 ? ` 指针相遇，总量为 ${frame.total}。` : '';
      note.textContent = `${direction}，结算 h[${frame.index}]：${frame.boundary} − ${heights[frame.index]} = ${frame.added} 单位。${finish}`;
    }
    canvas.setAttribute('aria-label', `高度为 ${heights.join('、')}，选中第 ${selected} 根，已累计 ${frame.total} 单位雨水，第 ${step} 步`);
    const rows = heights.map((value, i) => {
      const row = document.createElement('tr');
      for (const cell of [i, value, frame.settled[i] || step === frames.length - 1 ? frame.water[i] : '未结算']) {
        const td = document.createElement('td'); td.textContent = cell; row.append(td);
      }
      return row;
    });
    find('[data-rain-rows]').replaceChildren(...rows);
    draw();
  }
  function rebuild() {
    stop();
    selected = Math.min(selected, heights.length - 1);
    frames = traceRainWater(heights);
    step = frames.length - 1;
    column.replaceChildren(...heights.map((_, i) => {
      const option = document.createElement('option'); option.value = i; option.textContent = `h[${i}]`; return option;
    }));
    render();
  }
  function editHeight(value) {
    const next = Math.max(0, Math.min(MAX_HEIGHT, Math.round(value)));
    if (heights[selected] === next) return;
    heights[selected] = next;
    preset.value = 'custom';
    rebuild();
  }
  preset.addEventListener('change', () => {
    if (!PRESETS[preset.value]) return;
    basePreset = preset.value;
    heights = [...PRESETS[basePreset]];
    selected = Math.min(5, heights.length - 1);
    rebuild();
  });
  find('[data-rain-reset]').addEventListener('click', () => {
    heights = [...PRESETS[basePreset]]; preset.value = basePreset; rebuild();
  });
  column.addEventListener('change', () => { selected = Number(column.value); render(); });
  height.addEventListener('input', () => editHeight(Number(height.value)));
  count.addEventListener('input', () => {
    const next = Math.max(3, Math.min(MAX_COLUMNS, Number(count.value)));
    heights = heights.slice(0, next);
    while (heights.length < next) heights.push(0);
    preset.value = 'custom'; rebuild();
  });
  const seek = target => { stop(); step = Math.max(0, Math.min(frames.length - 1, target)); render(); };
  timeline.addEventListener('input', () => seek(Number(timeline.value)));
  find('[data-rain-start]').addEventListener('click', () => seek(0));
  find('[data-rain-prev]').addEventListener('click', () => seek(step - 1));
  find('[data-rain-next]').addEventListener('click', () => seek(step + 1));
  find('[data-rain-end]').addEventListener('click', () => seek(frames.length - 1));
  function tick() {
    step++;
    if (step >= frames.length - 1) { stop(); render(); return; }
    render();
    timer = setTimeout(tick, Number(speed.value));
  }
  play.addEventListener('click', () => {
    if (timer !== null) { stop(); return; }
    if (step === frames.length - 1) step = 0;
    root.classList.add('is-playing');
    play.title = '暂停过程'; play.setAttribute('aria-label', '暂停过程');
    note.setAttribute('aria-live', 'off');
    render();
    timer = setTimeout(tick, Number(speed.value));
  });
  speed.addEventListener('change', () => {
    if (timer !== null) { clearTimeout(timer); timer = setTimeout(tick, Number(speed.value)); }
  });
  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    const y = event.clientY - rect.top;
    editHeight((geometry.bottom - y) / geometry.unit);
    render();
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || dragging !== null) return;
    const x = event.clientX - canvas.getBoundingClientRect().left;
    selected = Math.max(0, Math.min(heights.length - 1, Math.floor((x - geometry.left) / geometry.cell)));
    dragging = {id: event.pointerId, startY: event.clientY};
    stop(); canvas.setPointerCapture(event.pointerId); render();
  });
  canvas.addEventListener('pointermove', event => {
    if (dragging?.id === event.pointerId && Math.abs(event.clientY - dragging.startY) >= 3) updatePointer(event);
  });
  const release = () => { dragging = null; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); stop();
    if (event.key === 'ArrowLeft') selected = Math.max(0, selected - 1);
    if (event.key === 'ArrowRight') selected = Math.min(heights.length - 1, selected + 1);
    if (event.key === 'ArrowUp') editHeight(heights[selected] + 1);
    if (event.key === 'ArrowDown') editHeight(heights[selected] - 1);
    render();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);
  new ResizeObserver(draw).observe(canvas);
  new MutationObserver(draw).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
  rebuild();
}

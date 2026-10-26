(() => {
  const viewer = document.querySelector('[data-material-viewer]');
  if (!viewer) return;
  const weapon = viewer.querySelector('#material-weapon');
  const zoom = viewer.querySelector('#material-zoom');
  const image = viewer.querySelector('[data-material-image]');
  const status = viewer.querySelector('[data-material-status]');
  const names = {wasteland: '废土', cyberpunk: '赛博', biohazard: '生化'};
  let world = 'wasteland';
  viewer.querySelector('.material-options').hidden = false;
  function update() {
    const label = `${weapon.selectedOptions[0].textContent} · ${names[world]}`;
    const file = `${weapon.value}_${world}_64.png`;
    image.alt = `${label}，64×64 像素工程素材`;
    image.src = viewer.dataset.assets + file;
    viewer.querySelector('[data-material-title]').textContent = label;
    viewer.querySelector('[data-material-original]').href = viewer.dataset.assets + file;
    document.querySelector('[data-material-source] code').textContent = `godot-project/assets/weapons/${file}`;
    viewer.querySelectorAll('[data-world]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.world === world)));
    status.textContent = '';
  }
  viewer.querySelectorAll('[data-world]').forEach(button => button.addEventListener('click', () => {
    world = button.dataset.world;
    update();
  }));
  weapon.addEventListener('change', update);
  zoom.addEventListener('input', () => {
    viewer.style.setProperty('--material-size', `${Number(zoom.value) * 64}px`);
    viewer.querySelector('[data-material-scale]').textContent = `${zoom.value}×`;
  });
  image.addEventListener('error', () => { status.textContent = '素材未能加载。'; });
})();

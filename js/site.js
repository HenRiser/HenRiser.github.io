(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const status = $('#action-status');
  const themeToggle = $('.theme-toggle');
  const updateThemeLabel = () => {
    const label = document.documentElement.dataset.theme === 'dark' ? '切换为浅色主题' : '切换为深色主题';
    themeToggle.title = label;
    themeToggle.setAttribute('aria-label', label);
  };
  updateThemeLabel();
  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('codeverse-theme', next); } catch (_) { /* Keep the current tab usable. */ }
    updateThemeLabel();
  });

  const menuToggle = $('.menu-toggle');
  const nav = $('#main-nav');
  function closeMenu() {
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', '展开导航');
    nav.classList.remove('is-open');
  }
  menuToggle.addEventListener('click', () => {
    const open = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? '收起导航' : '展开导航');
    nav.classList.toggle('is-open', open);
    if (open) nav.querySelector('a').focus();
  });
  document.addEventListener('pointerdown', event => {
    if (!nav.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) {
      closeMenu();
      menuToggle.focus();
    }
  });

  function filterEntries(label) {
    $$('[data-filter]').forEach(item => {
      if (item.dataset.filter === label) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    });
    let visible = 0;
    $$('.journal-entry').forEach(entry => {
      const show = label === '全部' || entry.dataset.topic === label;
      entry.hidden = !show;
      if (show) visible++;
    });
    $('.empty-filter').hidden = visible !== 0;
    $('.count').textContent = `${String(visible).padStart(2, '0')} 篇记录`;
  }
  const localFilters = $('.filters')?.dataset.localFilter === 'true';
  if (localFilters) {
    const restoreFilter = () => {
      const topic = new URL(location.href).searchParams.get('topic');
      filterEntries($$('[data-filter]').some(link => link.dataset.filter === topic) ? topic : '全部');
    };
    $$('[data-filter]').forEach(link => link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      filterEntries(link.dataset.filter);
      const url = new URL(location.href);
      if (link.dataset.filter === '全部') url.searchParams.delete('topic');
      else url.searchParams.set('topic', link.dataset.filter);
      history.replaceState(null, '', url);
    }));
    restoreFilter();
    addEventListener('popstate', restoreFilter);
  }

  const dialog = $('.search-dialog');
  const input = $('#search-input');
  const results = $('.search-results');
  const searchStatus = $('.search-status');
  const clearSearch = $('.search-clear');
  const retrySearch = $('.search-retry');
  let databasePromise;
  let database;
  let opener;
  let searchTimer;
  const normalize = value => (value || '').toLocaleLowerCase().normalize('NFKC');

  function appendHighlight(parent, value, terms) {
    const pattern = terms.filter(Boolean).map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    if (!pattern) { parent.textContent = value; return; }
    const expression = new RegExp(pattern, 'giu');
    let position = 0;
    for (const match of value.matchAll(expression)) {
      parent.append(document.createTextNode(value.slice(position, match.index)));
      const mark = document.createElement('mark');
      mark.textContent = match[0];
      parent.append(mark);
      position = match.index + match[0].length;
    }
    parent.append(document.createTextNode(value.slice(position)));
  }

  function renderSearch() {
    if (!database) return;
    const terms = [...new Set(normalize(input.value.trim()).split(/\s+/).filter(Boolean))];
    const matched = database.map(entry => {
      const title = normalize(entry.title);
      const tags = normalize((entry.tags || []).join(' '));
      const content = normalize(entry.content);
      if (!terms.every(term => `${title} ${tags} ${content}`.includes(term))) return null;
      const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 8 : 0) + (tags.includes(term) ? 4 : 0) + (content.includes(term) ? 1 : 0), 0);
      return { entry, score };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    results.replaceChildren();
    const shown = matched.slice(0, terms.length ? 30 : 6);
    searchStatus.textContent = terms.length ? `${matched.length} 篇匹配文章` : '最近发布';
    clearSearch.hidden = input.value.length === 0;
    shown.forEach(({entry}) => {
      const target = new URL(entry.url, location.href);
      if (target.origin !== location.origin) return;
      const link = document.createElement('a');
      link.href = target.href;
      link.className = 'search-result';
      const title = document.createElement('h3');
      appendHighlight(title, entry.title, terms);
      const snippet = document.createElement('p');
      const content = (terms.length ? entry.content : entry.summary || entry.content || '').replace(/\s+/g, ' ');
      const firstMatch = terms.length ? normalize(content).indexOf(terms[0]) : 0;
      const start = Math.max(0, firstMatch - 35);
      appendHighlight(snippet, (start ? '…' : '') + content.slice(start, start + 155) + (content.length > start + 155 ? '…' : ''), terms);
      link.append(title, snippet);
      const meta = document.createElement('span');
      meta.className = 'search-result-meta';
      meta.textContent = [entry.date?.slice(0, 10).replaceAll('-', '.'), (entry.tags || []).join(' / ')].filter(Boolean).join(' · ');
      link.append(meta);
      results.append(link);
    });
    if (!matched.length) {
      const empty = document.createElement('p');
      empty.className = 'search-empty';
      empty.textContent = '没有找到匹配文章。';
      results.append(empty);
    }
  }

  async function loadSearch() {
    searchStatus.textContent = '正在加载…';
    retrySearch.hidden = true;
    try {
      if (!databasePromise) databasePromise = fetch(dialog.dataset.index).then(response => {
        if (!response.ok) throw new Error('Search index unavailable');
        return response.json();
      });
      database = await databasePromise;
      renderSearch();
    } catch (_) {
      databasePromise = null;
      results.replaceChildren();
      searchStatus.textContent = '搜索暂时不可用，请稍后重试。';
      retrySearch.hidden = false;
    }
  }
  retrySearch.addEventListener('click', loadSearch);
  $$('[data-search-open]').forEach(button => button.addEventListener('click', () => {
    opener = button;
    closeMenu();
    dialog.showModal();
    document.body.classList.add('dialog-open');
    input.focus();
    input.select();
    loadSearch();
  }));
  clearSearch.addEventListener('click', () => {
    clearTimeout(searchTimer);
    input.value = '';
    renderSearch();
    input.focus();
  });
  $('[data-search-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dialog.close();
    }
  });
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    opener?.focus();
  });
  $('.search-form').addEventListener('submit', event => {
    event.preventDefault();
    clearTimeout(searchTimer);
    renderSearch();
    results.querySelector('a')?.click();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    clearTimeout(searchTimer);
    if (document.activeElement === input) renderSearch();
    const links = [...results.querySelectorAll('a')];
    if (!links.length) return;
    event.preventDefault();
    const index = links.indexOf(document.activeElement);
    const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : links.length - 1)
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
    links[next].focus();
  });
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    clearSearch.hidden = input.value.length === 0;
    searchTimer = setTimeout(renderSearch, 100);
  });

  // Reuse the server-rendered Lucide icon; code blocks do not load an icon library.
  const renderedCopyIcon = $('#copy-icon').innerHTML;
  const renderedCheckIcon = $('#check-icon').innerHTML;
  let statusTimer;
  function announceCopy(message) {
    clearTimeout(statusTimer);
    status.textContent = message;
    statusTimer = setTimeout(() => { status.textContent = ''; }, 3000);
  }
  async function copy(text, button) {
    try {
      await navigator.clipboard.writeText(text);
      const original = button.innerHTML;
      button.classList.add('copied');
      button.innerHTML = renderedCheckIcon + (button.classList.contains('copy-link') ? ' 已复制' : '');
      button.disabled = true;
      button.title = '已复制';
      button.setAttribute('aria-label', '已复制');
      announceCopy('已复制到剪贴板');
      setTimeout(() => {
        button.classList.remove('copied');
        button.innerHTML = original;
        button.disabled = false;
        button.title = button.dataset.originalLabel;
        button.setAttribute('aria-label', button.dataset.originalLabel);
      }, 1800);
    } catch (_) {
      announceCopy('复制未成功，请选择文本复制。');
    }
  }
  $$('.prose figure.highlight, .prose > pre').forEach(block => {
    const code = block.querySelector('.code pre') || block.querySelector('code') || block;
    const copySource = code.cloneNode(true);
    copySource.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode('\n')));
    const text = copySource.textContent;
    const button = document.createElement('button');
    button.className = 'icon-button code-copy';
    button.dataset.originalLabel = '复制代码';
    button.title = '复制代码';
    button.setAttribute('aria-label', '复制代码');
    button.innerHTML = renderedCopyIcon;
    button.addEventListener('click', () => copy(text, button));
    block.append(button);
  });
  const copyLink = $('.copy-link');
  if (copyLink) {
    copyLink.dataset.originalLabel = '复制文章链接';
    copyLink.addEventListener('click', () => copy(location.href.split('#')[0], copyLink));
  }

  const backTop = $('.back-top');
  const progress = $('.reading-progress span');
  const article = $('#article-body');
  const headings = article ? [...article.querySelectorAll('h2[id], h3[id]')] : [];
  const tocLinks = $$('.desktop-toc a');
  const mobileToc = $('.mobile-toc');
  $$('.mobile-toc a').forEach(link => link.addEventListener('click', () => {
    mobileToc.open = false;
    const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (target) { target.tabIndex = -1; target.focus({preventScroll: true}); }
  }));
  $$('.prose > table, .prose .highlight table, .prose > pre').forEach((block, i) => {
    block.tabIndex = 0;
    block.setAttribute('role', 'region');
    block.setAttribute('aria-label', `${block.closest('.highlight') || block.tagName === 'PRE' ? '代码' : '数据表格'} ${i + 1}`);
  });
  $$('.highlight .gutter').forEach(gutter => gutter.setAttribute('aria-hidden', 'true'));
  let framePending = false;
  function updateScroll() {
    backTop.hidden = window.scrollY < 500;
    if (progress && article) {
      const start = article.offsetTop - 100;
      const end = article.offsetTop + article.offsetHeight - innerHeight;
      progress.style.transform = `scaleX(${Math.min(1, Math.max(0, (scrollY - start) / Math.max(1, end - start)))})`;
      const current = [...headings].reverse().find(heading => heading.getBoundingClientRect().top <= 145) || headings[0];
      tocLinks.forEach(link => {
        const active = current && decodeURIComponent(link.hash.slice(1)) === current.id;
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
    framePending = false;
  }
  addEventListener('scroll', () => {
    if (!framePending) { framePending = true; requestAnimationFrame(updateScroll); }
  }, {passive: true});
  addEventListener('resize', updateScroll);
  if (article) new ResizeObserver(updateScroll).observe(article);
  updateScroll();
  backTop.addEventListener('click', () => scrollTo({top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'}));
})();

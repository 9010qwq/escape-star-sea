(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const data = window.EscapeStarSeaData;
  const art = window.StarSeaCardArt || {};
  const fieldbook = Array.isArray(window.StarSeaFieldbook) ? window.StarSeaFieldbook : [];
  const typeNames = { equipment: '装备', instant: '瞬发', normal: '普通', immediate: '立即' };
  const slotNames = { mobility: '机动槽', trade: '交易槽', plunder: '掠夺槽' };
  const cards = data ? [...data.regularCards.map(card => ({ ...card, deck: '常规牌' })), ...data.opportunityCards.map(card => ({ ...card, deck: '机遇牌' }))] : [];
  let visibleCards = cards;
  let readerItems = [];
  let readerIndex = 0;
  let zoom = 1;
  let fieldbookBuilt = false;
  const reader = byId('artReader');
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function localAsset(path) {
    return typeof path === 'string' && /^assets\/[a-zA-Z0-9_\-/]+\.(webp|png|jpe?g)$/i.test(path) && !path.includes('..') ? path : '';
  }
  const lazyObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
      lazyObserver.unobserve(img);
    });
  }, { rootMargin: '240px' }) : null;
  function preview(path, alt) {
    const source = localAsset(path);
    if (!source) return element('span', 'image-placeholder', '原图暂未载入');
    const img = element('img');
    img.alt = alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => { img.replaceWith(element('span', 'image-placeholder', '图片暂时无法显示，请稍后重试')); }, { once: true });
    if (lazyObserver) { img.dataset.src = source; lazyObserver.observe(img); }
    else img.src = source;
    return img;
  }
  function renderCards() {
    const query = byId('cardSearch').value.trim().toLocaleLowerCase();
    const type = byId('cardType').value;
    visibleCards = cards.filter(card => (type === 'all' || card.type === type) && (!query || [card.name, card.face, card.description, typeNames[card.type], card.deck, slotNames[card.slot]].join(' ').toLocaleLowerCase().includes(query)));
    byId('cardGrid').querySelectorAll('img').forEach(img => lazyObserver?.unobserve(img));
    const fragment = document.createDocumentFragment();
    visibleCards.forEach(card => {
      const article = element('article', 'library-card');
      const button = element('button', 'library-card-open');
      button.type = 'button';
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-label', `查看原始牌面：${card.name}，${card.face}`);
      const picture = element('span', 'card-art-picture');
      picture.append(preview(art[card.id], `${card.name} · ${card.face}原始牌面`));
      const heading = element('span', 'card-name-group');
      heading.append(element('strong', '', card.name), element('small', '', `${card.face} · ${card.deck}`));
      button.append(picture, heading);
      button.addEventListener('click', () => openReader(visibleCards.map(cardEntry), visibleCards.findIndex(item => item.id === card.id)));
      const description = element('p', 'card-current-effect');
      description.append(element('span', '', '当前游戏效果'), document.createTextNode(card.description));
      const bottom = element('div', 'card-bottom');
      bottom.append(element('span', 'card-kind', [typeNames[card.type] || card.type, slotNames[card.slot]].filter(Boolean).join(' · ')), element('span', '', `牌库 ${card.copies} 张`));
      article.append(button, description, bottom);
      fragment.append(article);
    });
    byId('cardGrid').replaceChildren(fragment);
    const copyCount = visibleCards.reduce((sum, card) => sum + (Number(card.copies) || 0), 0);
    byId('cardResults').textContent = `显示 ${visibleCards.length} / ${cards.length} 种牌面 · 对应牌库 ${copyCount} 张`;
    byId('cardEmpty').hidden = visibleCards.length !== 0;
  }
  function fieldbookTitle(page, index) {
    if (/封底/.test(page.title)) return '路书 · 封底';
    if (/封面/.test(page.title)) return '路书 · 封面';
    if (/^\d+$/.test(page.title)) return `路书 · 第 ${page.title} 页`;
    return page.title || `路书 · 第 ${index + 1} 页`;
  }
  const orderedFieldbook = fieldbook.map((page, index) => ({ ...page, sourceIndex: index })).sort((a, b) => {
    const order = page => /封面/.test(page.title) ? -1 : /封底/.test(page.title) ? 10000 : Number(page.title) || page.sourceIndex;
    return order(a) - order(b);
  });
  function renderFieldbook() {
    if (fieldbookBuilt) return;
    fieldbookBuilt = true;
    const fragment = document.createDocumentFragment();
    orderedFieldbook.forEach((page, index) => {
      const figure = element('figure', 'fieldbook-card');
      const button = element('button', 'fieldbook-open');
      button.type = 'button';
      button.setAttribute('aria-haspopup', 'dialog');
      const title = fieldbookTitle(page, index);
      button.setAttribute('aria-label', `展开阅读${title}`);
      const picture = element('span', 'fieldbook-preview');
      picture.append(preview(page.file, title));
      button.append(picture, element('strong', '', title));
      button.addEventListener('click', () => openReader(orderedFieldbook.map(bookEntry), index));
      figure.append(button);
      fragment.append(figure);
    });
    byId('fieldbookGrid').append(fragment);
  }
  function switchTab(name, focus = false) {
    const isCards = name === 'cards';
    ['cards', 'fieldbook'].forEach(id => {
      const selected = id === name;
      byId(`${id}Tab`).setAttribute('aria-selected', String(selected));
      byId(`${id}Tab`).tabIndex = selected ? 0 : -1;
      byId(`${id}Panel`).hidden = !selected;
    });
    if (!isCards) renderFieldbook();
    if (focus) byId(`${name}Tab`).focus();
  }
  function cardEntry(card) {
    return { title: card.name, kind: '原作卡牌', image: art[card.id], meta: `${card.face} · ${card.deck} · ${typeNames[card.type]}${card.slot ? ` · ${slotNames[card.slot]}` : ''} · 牌库 ${card.copies} 张`, effectTitle: '当前游戏效果', effect: card.description, note: '图片保留原作印刷文字。具体结算以当前规则页的明确裁定为准。' };
  }
  function bookEntry(page, index) {
    return { title: fieldbookTitle(page, index), kind: '宇宙科普路书', image: page.file, meta: '原作资料 · 完整页面', effectTitle: '在星海之外读宇宙', effect: '这是随桌游提供的科普资料，可以放大图片，滚动阅读完整页面。', note: '科普路书不作为游戏结算规则。' };
  }
  function setZoom(value) {
    zoom = Math.max(1, Math.min(3, value));
    byId('readerImage').style.width = `${zoom * 100}%`;
    byId('zoomValue').textContent = `${Math.round(zoom * 100)}%`;
    byId('zoomOut').disabled = zoom <= 1;
    byId('zoomIn').disabled = zoom >= 3;
  }
  function renderReader() {
    const item = readerItems[readerIndex];
    if (!item) return;
    byId('readerTitle').textContent = item.title;
    byId('readerKind').textContent = item.kind;
    byId('readerMeta').textContent = item.meta;
    byId('readerEffectTitle').textContent = item.effectTitle;
    byId('readerEffect').textContent = item.effect;
    byId('readerNote').textContent = item.note;
    const source = localAsset(item.image);
    const image = byId('readerImage');
    image.alt = `${item.title}，${item.kind}完整原图`;
    if (source) image.src = source;
    else image.removeAttribute('src');
    setZoom(1);
    byId('readerViewport').scrollTo(0, 0);
    byId('readerPosition').textContent = `${readerIndex + 1} / ${readerItems.length}`;
    byId('previousArt').disabled = readerIndex <= 0;
    byId('nextArt').disabled = readerIndex >= readerItems.length - 1;
  }
  function openReader(items, index) {
    readerItems = items;
    readerIndex = Math.max(0, index);
    renderReader();
    if (!reader.open) reader.showModal();
    byId('closeReader').focus({ preventScroll: true });
  }
  byId('cardsTab').addEventListener('click', () => switchTab('cards'));
  byId('fieldbookTab').addEventListener('click', () => switchTab('fieldbook'));
  document.querySelector('.library-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentCards = byId('cardsTab').getAttribute('aria-selected') === 'true';
    switchTab(event.key === 'Home' ? 'cards' : event.key === 'End' ? 'fieldbook' : currentCards ? 'fieldbook' : 'cards', true);
  });
  byId('cardSearchForm').addEventListener('submit', event => event.preventDefault());
  byId('cardSearch').addEventListener('input', renderCards);
  byId('cardType').addEventListener('change', renderCards);
  byId('closeReader').addEventListener('click', () => reader.close());
  reader.addEventListener('click', event => {
    if (event.target !== reader) return;
    const rect = reader.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) reader.close();
  });
  byId('zoomOut').addEventListener('click', () => setZoom(zoom - .5));
  byId('zoomIn').addEventListener('click', () => setZoom(zoom + .5));
  byId('zoomFit').addEventListener('click', () => { setZoom(1); byId('readerViewport').scrollTo(0, 0); });
  byId('previousArt').addEventListener('click', () => { if (readerIndex > 0) { readerIndex--; renderReader(); } });
  byId('nextArt').addEventListener('click', () => { if (readerIndex < readerItems.length - 1) { readerIndex++; renderReader(); } });
  byId('cardsTotal').textContent = `${cards.length} 种`;
  byId('fieldbookTotal').textContent = `${fieldbook.length} 页`;
  renderCards();
})();

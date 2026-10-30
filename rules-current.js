(() => {
  'use strict';
  const data = window.EscapeStarSeaData;
  const engine = window.EscapeStarSeaEngine;
  const byId = id => document.getElementById(id);
  const setText = (id, text) => { if (byId(id)) byId(id).textContent = text; };
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  if (!data || !engine || !Array.isArray(data.regularCards) || !Array.isArray(data.opportunityCards) || !Array.isArray(data.universes)) {
    setText('dataStatus', '当前规则数据暂未载入，请刷新页面后重试。');
    return;
  }
  const cards = [...data.regularCards, ...data.opportunityCards];
  const sumCopies = list => list.reduce((sum, card) => sum + Number(card.copies || 0), 0);
  setText('deckCount', `${cards.length} 种 / ${sumCopies(cards)} 张`);
  setText('regularCount', sumCopies(data.regularCards));
  setText('opportunityCount', sumCopies(data.opportunityCards));
  setText('sourceCardCount', `${cards.length} 种原始牌面`);
  setText('dataStatus', `规则数据版本：${data.version} · 数值、卡牌与星域来自当前游戏文件`);
  if (byId('modeRows')) {
    const fragment = document.createDocumentFragment();
    [['experience', '体验局'], ['quick', '快速局'], ['immersive', '沉浸局']].forEach(([mode, name]) => {
      const row = make('tr');
      const header = make('th', '', name);
      header.scope = 'row';
      row.append(header);
      [engine.requiredStageWarp({ mode }, 1), engine.requiredStageWarp({ mode }, 2), engine.requiredEscapeWarp({ mode })].forEach((count, index) => {
        const cell = make('td');
        cell.dataset.label = ['第一 → 第二', '第二 → 第三', '逃离门槛'][index];
        cell.append(make('span', '', count), document.createTextNode(' 曲速'));
        row.append(cell);
      });
      fragment.append(row);
    });
    byId('modeRows').replaceChildren(fragment);
  }
  setText('warpBasePrice', engine.warpCost({ equipment: { mobility: null, trade: null, plunder: null } }));
  setText('warpDiscountPrice', engine.warpCost({ equipment: { mobility: 'warp_discount', trade: null, plunder: null } }));
  if (byId('rulings')) {
    const fragment = document.createDocumentFragment();
    (data.prototypeRulings || []).forEach(text => fragment.append(make('li', '', text)));
    byId('rulings').replaceChildren(fragment);
  }
  document.querySelectorAll('[data-card-rule]').forEach(target => {
    const card = cards.find(item => item.id === target.dataset.cardRule);
    if (!card) { target.textContent = '这张牌的说明暂未载入。'; return; }
    target.replaceChildren(make('h3', '', card.name), make('p', '', card.description), make('small', '', `${card.face} · 牌库 ${card.copies} 张`));
  });
  if (byId('mapRules')) {
    const fragment = document.createDocumentFragment();
    data.universes.forEach(universe => {
      const details = make('details');
      details.append(make('summary', '', `${universe.name} · ${universe.nodes.length} 格`));
      const list = make('div', 'map-rule-list');
      universe.nodes.forEach(node => {
        const article = make('article', 'map-rule');
        const nextNames = (node.next || []).map(id => universe.nodes.find(item => item.id === id)?.name || id).join(' / ');
        article.append(make('h3', '', node.name), make('p', '', node.description), make('small', '', `普通下一格：${nextNames || '无'}`));
        list.append(article);
      });
      details.append(list);
      fragment.append(details);
    });
    byId('mapRules').replaceChildren(fragment);
  }
  if (byId('startStations')) {
    const first = data.universes[0];
    const fragment = document.createDocumentFragment();
    first.stationIds.forEach(id => {
      const node = first.nodes.find(item => item.id === id);
      if (!node) return;
      const article = make('article', 'map-rule');
      article.append(make('h3', '', node.name), make('p', '', `${node.description}；起手 ${2 + (node.extraRegular || 0)} 张常规牌`));
      fragment.append(article);
    });
    byId('startStations').replaceChildren(fragment);
  }
  const stage3 = data.universes[2];
  const dense = stage3?.nodes.find(node => node.id === 's3_dense');
  const eye = stage3?.nodes.find(node => node.id === 's3_eye');
  setText('sourceDense', dense?.description || '见当前星域说明');
  setText('sourceEye', eye?.description || '见当前星域说明');
  setText('sourceStage3', stage3 ? `${stage3.nodes.length} 格，${stage3.nodes.every(node => node.next.length === 1) ? '每格一条普通出边，无普通短、长分岔' : '以当前地图为准'}` : '见当前地图');
  const originalMap = byId('originalMap');
  if (originalMap) originalMap.addEventListener('toggle', () => {
    const image = byId('originalMapImage');
    if (originalMap.open && image?.dataset.src) { image.src = image.dataset.src; delete image.dataset.src; }
  });
})();

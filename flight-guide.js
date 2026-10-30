/* Contextual help reads public interface text only; it never reads or changes game state. */
(() => {
  'use strict';
  const preferenceKey = 'starSea.flightGuide.v1';
  function preference(value) {
    try {
      if (value !== undefined) localStorage.setItem(preferenceKey, value ? 'on' : 'off');
      return localStorage.getItem(preferenceKey) !== 'off';
    } catch (_) { return value === undefined ? true : value; }
  }
  function start() {
    const controls = document.getElementById('phaseControls');
    const phaseTitle = document.getElementById('phaseTitle');
    const modeValue = document.getElementById('modeValue');
    const setup = document.getElementById('setupDialog');
    const gameMode = document.getElementById('gameMode');
    const roundMeta = document.querySelector('.round-meta');
    if (!controls || !phaseTitle || !roundMeta || document.getElementById('flightGuideButton')) return;
    let enabled = preference();
    let pending = false;
    let signature = '';

    const intro = document.createElement('details');
    intro.className = 'flight-guide-intro';
    intro.open = enabled;
    intro.innerHTML = '<summary>首次航行 · 三步上手</summary><ol><li><strong>掷骰选路</strong><span>两枚骰子任选一枚，先看计划落点，再锁定移动。</span></li><li><strong>经营与保牌</strong><span>展开下方手牌，在牌上操作；瞬发牌可留给合适的响应窗口。</span></li><li><strong>穿越三层宇宙</strong><span class="flight-guide-start-goal"></span></li></ol>';
    const modeLabel = gameMode?.closest('label');
    if (modeLabel) modeLabel.before(intro);

    const help = document.createElement('button');
    help.id = 'flightGuideButton';
    help.type = 'button';
    help.className = 'ghost-button flight-guide-open';
    help.textContent = '航行帮助 ?';
    help.setAttribute('aria-haspopup', 'dialog');
    roundMeta.append(help);

    const tip = document.createElement('section');
    tip.className = 'flight-guide-tip';
    tip.setAttribute('aria-label', '当前阶段航行提示');
    tip.innerHTML = '<div class="flight-guide-tip-head"><strong class="flight-guide-tip-title"></strong><button class="flight-guide-dismiss" type="button" aria-label="关闭阶段提示，可从航行帮助重新开启" title="关闭阶段提示">×</button></div><p class="flight-guide-tip-text"></p><button class="flight-guide-hand" type="button" hidden>展开我的手牌 ↓</button>';
    controls.before(tip);

    const overlay = document.createElement('div');
    overlay.className = 'flight-guide-overlay';
    overlay.hidden = true;
    const dialog = document.createElement('section');
    dialog.id = 'flightGuideDialog';
    dialog.className = 'flight-guide-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;
    dialog.setAttribute('aria-labelledby', 'flightGuideTitle');
    dialog.innerHTML = '<div class="flight-guide-dialog-inner"><div class="flight-guide-dialog-heading"><h2 id="flightGuideTitle">这一程，怎么走？</h2><button type="button" class="ghost-button flight-guide-close">返回对局 ×</button></div><p class="flight-guide-goal"></p><section class="flight-guide-current"><h3 class="flight-guide-current-title"></h3><p class="flight-guide-current-text"></p></section><ol class="flight-guide-steps"><li><strong>看骰子，也看落点</strong><p>公开两枚骰子后，各自任选一枚，双方可以同选。先查看计划路线、终点效果与经过的跃迁点，再锁定同步移动。</p></li><li><strong>经营动力，积累曲速</strong><p>经过跃迁点时，按窗口中的实际价格购买曲速；通常每点 30 动力，折扣装备会改变价格。可以一次买多点，跨阶扣除所需数量后，余下曲速继续保留。</p></li><li><strong>出牌，或保留反击</strong><p>个人回合可连续使用合法牌与装备，点牌后直接在牌上选目标并确认。结束时手牌最多保留 3 张；系统要求弃牌时，点选要弃置的牌。</p></li></ol><details class="flight-guide-response"><summary>遇到“瞬发响应”时</summary><p>先看正在结算的事件，再决定是否响应。可用瞬发牌会在手牌中点亮；“暂不响应”会保留这张牌。连续一圈无人加牌后，响应链从最后打出的牌开始逆序结算。并非每个窗口都值得用掉关键反击。</p></details><p class="flight-guide-view-note">地图可以“全图总览”“近看格面”或“专注星图”。点星域看完整效果，点空白处或按 Esc 关闭详情。此引导不暂停 AI 行动，当前提示会随局面更新。</p><div class="flight-guide-dialog-actions"><button type="button" class="secondary-button flight-guide-show-hand">查看我的手牌</button><button type="button" class="ghost-button flight-guide-enable"></button><button type="button" class="ghost-button flight-guide-close">继续航行 →</button></div></div>';
    overlay.append(dialog);
    document.body.append(overlay);

    function goalText(fromSetup) {
      const text = fromSetup ? (gameMode?.selectedOptions?.[0]?.textContent || '') : (modeValue?.textContent || '');
      const numbers = fromSetup ? text.match(/跨阶\s*(\d+)\s*\/\s*(\d+).*逃离\s*(\d+)/) : text.match(/(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/);
      if (!numbers) return '积累曲速，依次进入第二、第三宇宙，再满足当前模式的曲速门槛并抵达宇宙之眼。具体门槛以本局界面为准。';
      return `第一 → 第二宇宙消耗 ${numbers[1]} 曲速；第二 → 第三消耗 ${numbers[2]}。第三宇宙持有 ${numbers[3]} 曲速，准确停在宇宙之眼，或从右下虫洞途经它，即可逃离。`;
    }
    function context() {
      const title = phaseTitle.textContent.trim();
      const text = controls.textContent || '';
      const has = selector => Boolean(controls.querySelector(selector));
      if (has('#restartButton')) return ['本局已结算', '先看本局复盘，了解关键行动；准备好后再来一局。有人逃离后完成当前轮，同轮逃离算平局，认输则立即结束。', false];
      if (has('.ai-thinking')) return ['领航员正在行动', '现在由 AI 处理它的行动。你仍可查看自己的手牌、星图与公开记录；等操作区出现可用按钮后再行动。', false];
      if (has('#rollButton')) return ['第一步 · 公开掷骰', '点击下方“掷两枚骰子”。之后你和 AI 各选一枚作为步数，可以选择同一个点数。', false];
      if (has('#moveButton')) return ['第二步 · 选步，看落点', '先选骰面，再查看地图上的计划路线与落点效果。经过跃迁点可购买曲速；确认路线后，再锁定同步移动。', false];
      if (has('#confirmWarp')) return ['第三步 · 补充曲速', '按你的动力与下一阶门槛决定购买数量，也可以不买。可一次买多点，多余曲速跨阶后保留；有跨阶落点选项时一并确认。', false];
      if (has('#passResponse')) return ['响应机会 · 可以保牌', '先看当前事件与响应链，再决定是否用瞬发牌。合适的牌会点亮；暂不响应会保留手牌，不必逢窗口就出牌。', true];
      if (/整理你的手牌/.test(text)) return ['回合结束 · 整理手牌', '目前需要弃至最多 3 张。展开手牌，点选要弃置的牌；弃够后系统会继续结算。', true];
      if (/轮到你了/.test(text) || title === '个人回合') return ['个人回合 · 用牌或保留', '展开下方手牌，点牌后在牌上选目标并确认；可连续使用合法牌与装备。准备结束时，记得手牌上限为 3 张。', true];
      if (title === '效果选择') return ['完成当前效果选择', '按操作区提示选择目标、移动方式或牌。先读清效果再确认；这次选择完成后，系统会继续处理本轮。', false];
      if (title === '跃迁购买') return ['处理航行与跃迁', '双方路径已经锁定，系统正依次处理途中效果与跃迁购买。轮到你时，操作区会给出可选项。', false];
      if (title === '瞬发响应') return ['依次处理响应', '先看当前事件和公开响应链。轮到你时，可在手牌选择适用瞬发牌，或暂不响应、保留反击。', false];
      return ['跟随当前操作', '优先查看本区的阶段说明与可用按钮；地图、自己的资源和手牌随时可以查看。', false];
    }
    function setEnabled(value) {
      enabled = value;
      preference(value);
      refresh();
    }
    function refresh() {
      pending = false;
      const current = context();
      const startGoal = goalText(true);
      const liveGoal = goalText(false);
      const next = JSON.stringify([current, enabled, startGoal, liveGoal, Boolean(setup?.open)]);
      if (next === signature) return;
      signature = next;
      tip.hidden = !enabled || Boolean(setup?.open);
      tip.querySelector('.flight-guide-tip-title').textContent = current[0];
      tip.querySelector('.flight-guide-tip-text').textContent = current[1];
      tip.querySelector('.flight-guide-hand').hidden = !current[2];
      intro.querySelector('.flight-guide-start-goal').textContent = startGoal;
      dialog.querySelector('.flight-guide-goal').textContent = liveGoal;
      dialog.querySelector('.flight-guide-current-title').textContent = current[0];
      dialog.querySelector('.flight-guide-current-text').textContent = current[1];
      dialog.querySelector('.flight-guide-enable').textContent = enabled ? '关闭阶段提示' : '重新显示阶段提示';
    }
    function queue() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(refresh);
    }
    function showHand() {
      closeGuide();
      const button = document.getElementById('toggleHandButton');
      if (!button) return;
      if (button.getAttribute('aria-expanded') !== 'true') button.click();
      button.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      button.focus({ preventScroll: true });
    }
    help.addEventListener('click', () => {
      if (document.querySelector('dialog[open]')) return;
      refresh();
      overlay.hidden = false;
      dialog.querySelector('.flight-guide-close').focus({ preventScroll: true });
    });
    tip.querySelector('.flight-guide-dismiss').addEventListener('click', () => { setEnabled(false); help.focus({ preventScroll: true }); });
    tip.querySelector('.flight-guide-hand').addEventListener('click', showHand);
    dialog.querySelector('.flight-guide-show-hand').addEventListener('click', showHand);
    dialog.querySelector('.flight-guide-enable').addEventListener('click', () => setEnabled(!enabled));
    function closeGuide() {
      if (overlay.hidden) return;
      overlay.hidden = true;
      if (!document.querySelector('dialog[open]')) help.focus({ preventScroll: true });
    }
    dialog.querySelectorAll('.flight-guide-close').forEach(button => button.addEventListener('click', closeGuide));
    overlay.addEventListener('click', event => { if (event.target === overlay) closeGuide(); });
    document.addEventListener('keydown', event => {
      if (overlay.hidden || document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeGuide();
      } else if (event.key === 'Tab') {
        const focusable = [...dialog.querySelectorAll('button:not([disabled]), summary, a[href], [tabindex="0"]')].filter(element => element.getClientRects().length);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }
    }, true);
    // No native dialog is added: the existing game pauses AI for dialog[open].
    const observer = new MutationObserver(queue);
    [phaseTitle, controls, modeValue].filter(Boolean).forEach(element => observer.observe(element, { childList: true, subtree: true, characterData: true }));
    if (setup) observer.observe(setup, { attributes: true, attributeFilter: ['open'] });
    gameMode?.addEventListener('change', queue);
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

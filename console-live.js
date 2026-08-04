/* SOOP LCK 룬 오버레이 — 콘솔 주입 라이브 테스트 번들 (tools/build-console.py 생성)
   사용: SOOP 방송 탭 → F12 → Console → 전체 붙여넣기 → Enter */
/**
 * SOOP LCK 룬 오버레이 — UI 모듈 (vanilla JS, 프레임워크 없음)
 *
 * window.LCKOverlay.mount(hostElement, state) 로 Shadow DOM에 오버레이를 그린다.
 * state 형태는 demo/mock-data.js (tools/build-mock-data.py 생성) 참고.
 * content script와 데모 페이지가 동일하게 사용한다.
 *
 * 레이아웃: 블루팀 좌 / 레드팀 우 2열(같은 포지션이 같은 행), 카드 클릭 시
 * 룬·아이템 상세는 패널 하단 고정 영역에 표시 — 어느 행을 열어도 넘치지 않는다.
 */
(function () {
  "use strict";

  var TRINKETS = { 3340: 1, 3363: 1, 3364: 1 };
  var MAX_ITEM_SLOTS = 6;

  /* 상세 표시 항목 설정 — 설정 드로어에서 토글, localStorage 유지 (확장에서는 chrome.storage + 툴바 팝업) */
  var PREF_DEFS = [
    ['runeNames', '룬 이름'], ['items', '아이템'], ['skills', '스킬 순서'], ['kp', '킬관여'], ['wards', '와드']
  ];
  var PREFS = (function () {
    var d = { runeNames: 1, items: 1, skills: 1, kp: 1, wards: 1 };
    try { return Object.assign(d, JSON.parse(localStorage.getItem('lckov.show') || '{}')); }
    catch (e) { return d; }
  })();
  function savePrefs() { try { localStorage.setItem('lckov.show', JSON.stringify(PREFS)); } catch (e) {} }

  /* 스킬 레벨업 순서 → 마스터 우선순위 (R 제외, 찍은 횟수 → 먼저 찍은 순) */
  function skillOrder(abilities) {
    var count = {}, first = {};
    (abilities || []).forEach(function (a, i) {
      if (a === 'R') return;
      count[a] = (count[a] || 0) + 1;
      if (!(a in first)) first[a] = i;
    });
    var keys = Object.keys(count);
    if (!keys.length) return null;
    keys.sort(function (a, b) { return (count[b] - count[a]) || (first[a] - first[b]); });
    return keys.join(' › ');
  }

  var CSS = [
    ':host { all: initial; }',
    '* { margin: 0; padding: 0; box-sizing: border-box; }',
    '.root {',
    '  position: fixed; top: 24px; right: 24px; z-index: 2147483000;',
    '  --bg-a: 0.94; --blue: #55A0FF; --red: #FF6B6B; --gold: #E8C36B;',
    '  --tx: #EDEFF3; --mut: #9BA3AF; --line: rgba(255,255,255,0.08);',
    "  font-family: Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', -apple-system, 'Segoe UI', sans-serif;",
    '  font-size: 12px; color: var(--tx); user-select: none;',
    '  -webkit-font-smoothing: antialiased;',
    '}',
    '.root { --ui-scale: 1; }',
    '.panel { transform: scale(var(--ui-scale)); transform-origin: top right; }',
    '.root.origin-left .panel { transform-origin: top left; }',
    '.panel {',
    '  width: 604px; max-height: min(88vh, 720px); display: flex; flex-direction: column;',
    '  background: rgb(14 17 23 / var(--bg-a));',
    '  border: 1px solid var(--line); border-radius: 12px; overflow: hidden;',
    '  backdrop-filter: blur(16px) saturate(1.3); -webkit-backdrop-filter: blur(16px) saturate(1.3);',
    '  box-shadow: 0 12px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4);',
    '}',
    '.root.min .panel { display: none; }',

    /* ── 헤더 ── */
    '.hdr {',
    '  display: flex; align-items: center; gap: 8px; padding: 9px 10px 9px 12px;',
    '  background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015));',
    '  border-bottom: 1px solid var(--line); cursor: grab; flex: none;',
    '}',
    '.hdr:active { cursor: grabbing; }',
    '.hdr { position: relative; }',
    '.hdiff {',
    '  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);',
    '  display: inline-flex; align-items: baseline; gap: 4px; padding: 2.5px 10px;',
    '  border-radius: 999px; background: #05070B; border: 1px solid var(--line);',
    '  font-size: 10px; font-weight: 700; white-space: nowrap;',
    '}',
    '.hdiff b { font-size: 11px; font-variant-numeric: tabular-nums; }',
    '.live { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; color: #FF5C5C; }',
    '.live i { width: 6px; height: 6px; border-radius: 50%; background: #FF5C5C; animation: pulse 1.6s ease-in-out infinite; }',
    '@keyframes pulse { 0%,100% { opacity: 1; box-shadow: 0 0 0 0 rgba(255,92,92,0.5); } 50% { opacity: 0.6; box-shadow: 0 0 0 4px rgba(255,92,92,0); } }',
    '.title { font-size: 12.5px; font-weight: 700; letter-spacing: 0.02em; }',
    '.title .vs { color: var(--mut); font-weight: 400; font-size: 10.5px; margin: 0 3px; }',
    '.meta { margin-left: auto; display: flex; align-items: baseline; gap: 6px; }',
    '.set-label { font-size: 10px; color: var(--mut); }',
    '.clock { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--gold); }',
    '.hbtn {',
    '  width: 22px; height: 22px; border: 0; border-radius: 6px; background: transparent;',
    '  color: var(--mut); cursor: pointer; display: grid; place-items: center; flex: none;',
    '}',
    '.hbtn:hover { background: rgba(255,255,255,0.09); color: var(--tx); }',
    '.hbtn svg { width: 13px; height: 13px; }',

    /* ── 탭 ── */
    '.tabs { display: flex; gap: 3px; padding: 6px 10px; border-bottom: 1px solid var(--line); }',
    '.vtab {',
    '  padding: 4px 12px; border-radius: 999px; background: transparent; border: 1px solid transparent;',
    '  color: #7A8290; font-size: 10.5px; font-weight: 700; cursor: pointer; font-family: inherit;',
    '}',
    '.vtab:hover { color: var(--tx); }',
    '.vtab.on { color: var(--gold); border-color: rgba(232,195,107,0.5); background: rgba(232,195,107,0.08); }',
    '.view { display: none; } .view.on { display: block; }',

    /* ── 지표 비교 뷰 ── */
    '.mchips { display: flex; gap: 4px; padding: 8px 12px 6px; }',
    '.mgrid { display: grid; grid-template-columns: 1fr 1fr; padding-bottom: 8px; }',
    '.mcol + .mcol { border-left: 1px solid var(--line); }',
    '.mrow { display: flex; align-items: center; gap: 8px; padding: 4px 12px; height: 30px; }',
    '.mrow .mrk { width: 13px; flex: none; font-size: 10px; font-weight: 800; color: #566070; text-align: center; font-variant-numeric: tabular-nums; }',
    '.mrow .mrk.top { color: var(--gold); }',
    '.mrow .mnm { width: 66px; flex: none; font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.mrow .mkda { flex: 1; font-size: 10.5px; color: var(--mut); font-variant-numeric: tabular-nums; }',
    '.mbar { flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.07); overflow: hidden; }',
    '.mbar i { display: block; height: 100%; border-radius: 3px; }',
    '.mbar .bblue { background: linear-gradient(90deg, #2E6FDB, #55A0FF); }',
    '.mbar .bred { background: linear-gradient(90deg, #D64545, #FF6B6B); }',
    '.mrow .mv { flex: none; min-width: 54px; text-align: right; font-size: 10.5px; font-weight: 700; font-variant-numeric: tabular-nums; }',

    /* ── 골드 그래프 뷰 ── */
    '.gview { padding: 10px 14px 12px; }',
    '.ghead { display: flex; align-items: baseline; gap: 10px; padding-bottom: 6px; }',
    '.ghead .glabel { font-size: 10.5px; font-weight: 700; color: var(--mut); letter-spacing: 0.06em; }',
    '.ghead .gdiff { font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }',
    '.gsvg { width: 100%; display: block; }',

    /* ── 룬 아이콘 스트립 (간결 표시 · 10인 룬 뷰) ── */
    '.rstrip { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; padding: 3px 0; }',
    '.rstrip img { width: 20px; height: 20px; }',
    '.rstrip img.rkey { width: 27px; height: 27px; filter: drop-shadow(0 0 5px rgba(232,195,107,0.35)); }',
    '.rstrip img.rshard { width: 13px; height: 13px; opacity: 0.9; }',
    '.rstrip .rsep { width: 1px; height: 16px; background: var(--line); margin: 0 3px; }',
    '.rrow { display: flex; align-items: center; gap: 8px; padding: 4px 10px; min-height: 40px; cursor: pointer; }',
    '.rrow:hover { background: rgba(255,255,255,0.05); }',
    '.rrow .mnm { width: 62px; flex: none; font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.rrow .rstrip { flex-wrap: nowrap; gap: 3px; padding: 0; }',
    '.rrow .rstrip .rsep { margin: 0 2px; }',

    /* ── 라인 매치업 비교 ── */
    '.cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }',
    '.cmpcol { padding-left: 9px; border-left: 2px solid var(--blue); }',
    '.cmpcol.cred { border-left-color: var(--red); }',
    '.cmpbtn {',
    '  margin-left: auto; padding: 3px 9px; border-radius: 999px; background: rgba(255,255,255,0.05);',
    '  border: 1px solid var(--line); color: #C9CDD6; font-size: 10px; font-weight: 700;',
    '  cursor: pointer; font-family: inherit;',
    '}',
    '.cmpbtn:hover { color: var(--tx); background: rgba(255,255,255,0.1); }',

    /* ── 본문: 팀 2열 ── */
    '.body { overflow-y: auto; overscroll-behavior: contain; }',
    '.body::-webkit-scrollbar { width: 6px; }',
    '.body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius: 3px; }',
    '.teams { display: grid; grid-template-columns: 1fr 1fr; }',
    '.team + .team { border-left: 1px solid var(--line); }',
    '.thdr {',
    '  display: flex; align-items: center; gap: 6px; padding: 7px 12px 5px;',
    '  font-size: 10.5px; font-weight: 800; letter-spacing: 0.1em;',
    '}',
    '.thdr .dot { width: 7px; height: 7px; border-radius: 2px; }',
    '.team-blue .thdr { color: var(--blue); } .team-blue .dot { background: var(--blue); }',
    '.team-red .thdr { color: var(--red); } .team-red .dot { background: var(--red); }',
    '.tstat { margin-left: auto; font-weight: 600; font-size: 10px; letter-spacing: 0.02em; color: var(--mut); font-variant-numeric: tabular-nums; }',

    /* ── 선수 행 ── */
    '.row {',
    '  display: flex; align-items: center; gap: 8px; padding: 5px 10px 5px 12px; height: 44px;',
    '  cursor: pointer; position: relative; transition: background 0.12s;',
    '}',
    '.row:hover { background: rgba(255,255,255,0.05); }',
    '.row.sel { background: rgba(255,255,255,0.06); }',
    '.row::before {',
    '  content: ""; position: absolute; left: 0; top: 6px; bottom: 6px; width: 2px; border-radius: 1px;',
    '  background: transparent; transition: background 0.12s;',
    '}',
    '.team-blue .row.sel::before { background: var(--blue); }',
    '.team-red .row.sel::before { background: var(--red); }',
    '.ava { position: relative; flex: none; width: 32px; height: 32px; }',
    '.ava img, .ava .fb {',
    '  width: 32px; height: 32px; border-radius: 7px; display: block; object-fit: cover;',
    '  border: 1px solid rgba(255,255,255,0.14);',
    '}',
    '.ava .fb { display: grid; place-items: center; background: #2A2F3A; font-weight: 800; font-size: 13px; color: var(--mut); }',
    '.lv {',
    '  position: absolute; right: -4px; bottom: -4px; min-width: 15px; height: 15px; padding: 0 3px;',
    '  border-radius: 8px; background: #05070B; border: 1px solid rgba(255,255,255,0.2);',
    '  font-size: 9px; font-weight: 700; display: grid; place-items: center; font-variant-numeric: tabular-nums;',
    '}',
    '.hp { position: absolute; left: 0; right: 0; bottom: -1px; height: 2.5px; border-radius: 2px; background: rgba(255,255,255,0.12); overflow: hidden; }',
    '.hp i { display: block; height: 100%; border-radius: 2px; background: linear-gradient(90deg, #35C46E, #7ADC9C); }',
    '.who { flex: 1 1 auto; min-width: 0; }',
    '.nm { font-size: 12.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.ch { font-size: 10px; color: var(--mut); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.stat { flex: none; width: 76px; text-align: right; font-variant-numeric: tabular-nums; }',
    '.stat b { font-weight: 700; } .stat .d { color: #FF7A7A; font-style: normal; font-weight: 700; }',
    '.stat .sep { color: #566070; font-weight: 400; margin: 0 1px; }',
    '.stat .sub { font-size: 9.5px; margin-top: 1px; color: var(--mut); }',
    '.stat .sub .g { color: var(--gold); font-weight: 700; }',
    '.ks { flex: none; width: 24px; height: 24px; border-radius: 50%; background: #05070B; border: 1px solid rgba(232,195,107,0.45); padding: 1px; }',
    '.ks img { width: 100%; height: 100%; display: block; }',

    /* ── 룬·아이템 상세 (패널 하단 고정 영역) ── */
    '.dzone { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.22s ease; border-top: 1px solid transparent; }',
    '.dzone.open { grid-template-rows: 1fr; border-top-color: var(--line); }',
    '.dclip { overflow: hidden; min-height: 0; }',
    '.dwrap { padding: 8px 14px 13px; }',
    '.dhead { display: flex; align-items: baseline; gap: 7px; padding-bottom: 3px; }',
    '.dhead .nm { font-size: 12.5px; }',
    '.dhead .ch { font-size: 10.5px; margin: 0; }',
    '.runes { display: grid; grid-template-columns: 1.15fr 1fr 118px; gap: 0 18px; }',
    '.tree-hd { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 700; color: var(--mut); letter-spacing: 0.06em; padding: 5px 0 4px; }',
    '.tree-hd img { width: 14px; height: 14px; }',
    '.r { display: flex; align-items: center; gap: 7px; padding: 2.5px 0; }',
    '.r img { width: 20px; height: 20px; flex: none; }',
    '.r span { font-size: 11px; color: #C9CDD6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.r.key { padding: 3px 0 5px; }',
    '.r.key img { width: 30px; height: 30px; filter: drop-shadow(0 0 6px rgba(232,195,107,0.35)); }',
    '.r.key span { font-size: 12px; font-weight: 800; color: var(--gold); }',
    '.shards { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }',
    '.shard {',
    '  display: inline-flex; align-items: center; gap: 4px; padding: 2.5px 7px 2.5px 4px;',
    '  border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid var(--line);',
    '  font-size: 9.5px; color: #C9CDD6;',
    '}',
    '.shard img { width: 13px; height: 13px; }',
    '.itemgrid { display: grid; grid-template-columns: repeat(4, 26px); gap: 4px; align-content: start; }',
    '.slot {',
    '  width: 26px; height: 26px; border-radius: 6px; background: #05070B;',
    '  border: 1px solid rgba(255,255,255,0.13); overflow: hidden;',
    '}',
    '.slot img { width: 100%; height: 100%; display: block; }',
    '.slot.empty { background: rgba(255,255,255,0.03); border-style: dashed; border-color: rgba(255,255,255,0.1); }',
    '.slot.trinket { border-color: rgba(232,195,107,0.5); }',
    '.xstats { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }',
    '.xchip {',
    '  display: inline-flex; align-items: baseline; gap: 5px; padding: 3px 9px;',
    '  border-radius: 999px; background: rgba(255,255,255,0.05); border: 1px solid var(--line); font-size: 10px;',
    '}',
    '.xchip .k { color: #7A8290; font-weight: 700; letter-spacing: 0.04em; }',
    '.xchip .v { color: var(--tx); font-weight: 700; font-variant-numeric: tabular-nums; }',
    '.tglrow { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; }',
    '.tgl {',
    '  padding: 3px 9px; border-radius: 999px; background: rgba(255,255,255,0.04);',
    '  border: 1px solid var(--line); color: #7A8290; font-size: 10px; font-weight: 700;',
    '  cursor: pointer; font-family: inherit;',
    '}',
    '.tgl.on { color: var(--gold); border-color: rgba(232,195,107,0.5); background: rgba(232,195,107,0.08); }',

    /* ── 설정 드로어 ── */
    '.drawer { display: none; flex: none; padding: 10px 12px 11px; border-top: 1px solid var(--line); background: rgba(255,255,255,0.025); }',
    '.root.settings .drawer { display: block; }',
    '.ctl { display: flex; align-items: center; gap: 8px; padding: 4px 0; }',
    '.ctl label { font-size: 11px; color: var(--mut); width: 76px; flex: none; }',
    '.ctl output { font-size: 11px; font-weight: 700; width: 46px; text-align: right; flex: none; font-variant-numeric: tabular-nums; color: var(--gold); }',
    'input[type=range] { flex: 1; appearance: none; -webkit-appearance: none; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.16); outline: none; cursor: pointer; }',
    'input[type=range]::-webkit-slider-thumb { appearance: none; -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%; background: var(--gold); border: 2px solid #0E1117; }',
    '.note { margin-top: 7px; font-size: 9.5px; color: #566070; line-height: 1.5; }',
    '.srcsel, .clockin {',
    '  background: #05070B; color: var(--tx); border: 1px solid var(--line); border-radius: 7px;',
    '  padding: 6px 8px; font-size: 11px; font-family: inherit;',
    '}',
    '.srcsel { flex: 1; }',
    '.clockin { width: 74px; }',
    '.minibtn {',
    '  padding: 6px 12px; border-radius: 7px; background: rgba(232,195,107,0.12);',
    '  border: 1px solid rgba(232,195,107,0.45); color: var(--gold); font-size: 11px; font-weight: 700;',
    '  cursor: pointer; font-family: inherit;',
    '}',
    '.minibtn:hover { background: rgba(232,195,107,0.2); }',

    /* ── 방해금지 모드: 패널 숨기고 방송 HUD 위치에 투명 클릭 존 ── */
    '.root.dnd .panel, .root.dnd .pillwrap { display: none; }',
    '.dndzones, .dnd-handle { display: none; }',
    '.root.dnd .dndzones { display: block; }',
    '.root.dnd .dnd-handle { display: inline-flex; }',
    '.dndzone { position: fixed; cursor: pointer; border-radius: 8px; border: 1px solid transparent; transition: border-color 0.12s, background 0.12s; }',
    '.dndzone:hover, .dndzone.sel { border-color: rgba(232,195,107,0.55); background: rgba(232,195,107,0.07); }',
    /* 방해금지 켠 직후 존 위치 안내 (2초간 표시 후 사라짐) */
    '.root.dnd-intro .dndzone { border-color: rgba(232,195,107,0.55); background: rgba(232,195,107,0.07); }',
    '.dndzone .tag {',
    '  position: absolute; top: 50%; transform: translateY(-50%);',
    '  background: rgb(14 17 23 / 0.95); border: 1px solid var(--line); border-radius: 6px;',
    '  padding: 3px 8px; font-size: 10.5px; font-weight: 700; white-space: nowrap;',
    '  opacity: 0; pointer-events: none; transition: opacity 0.12s;',
    '}',
    '.dndzone:hover .tag, .dndzone.sel .tag { opacity: 1; }',
    '.dndzone.zleft .tag { left: calc(100% + 8px); } .dndzone.zright .tag { right: calc(100% + 8px); }',
    '.dnd-pop {',
    '  position: fixed; width: 502px; z-index: 1; transform: scale(var(--ui-scale));',
    '  background: rgb(14 17 23 / var(--bg-a)); border: 1px solid var(--line); border-radius: 12px;',
    '  backdrop-filter: blur(16px) saturate(1.3); -webkit-backdrop-filter: blur(16px) saturate(1.3);',
    '  box-shadow: 0 12px 40px rgba(0,0,0,0.55);',
    '}',
    '.dnd-handle {',
    '  position: fixed; top: 10px; right: 10px; align-items: center; gap: 6px; padding: 5px 10px;',
    '  border-radius: 999px; background: rgb(14 17 23 / 0.55); border: 1px solid var(--line);',
    '  color: var(--mut); font-size: 10.5px; font-weight: 700; font-family: inherit; cursor: pointer;',
    '  opacity: 0.3; transition: opacity 0.15s;',
    '}',
    '.dnd-handle:hover { opacity: 1; color: var(--tx); }',
    '.dndbtn {',
    '  flex: 1; text-align: left; padding: 6px 9px; border-radius: 7px; cursor: pointer;',
    '  background: rgba(255,255,255,0.06); border: 1px solid var(--line); color: #C9CDD6;',
    '  font-size: 10.5px; font-family: inherit;',
    '}',
    '.dndbtn:hover { background: rgba(255,255,255,0.1); color: var(--tx); }',

    /* ── 이벤트 토스트 (아이템 완성·오브젝트) ── */
    '.toasts {',
    '  position: fixed; top: 76px; left: 50%; transform: translateX(-50%);',
    '  display: flex; flex-direction: column; align-items: center; gap: 6px;',
    '  z-index: 3; pointer-events: none;',
    '}',
    '.toast {',
    '  display: inline-flex; align-items: center; gap: 8px; padding: 7px 13px;',
    '  border-radius: 999px; background: rgb(14 17 23 / 0.95); border: 1px solid var(--line);',
    '  box-shadow: 0 8px 24px rgba(0,0,0,0.5); font-size: 12px; font-weight: 700;',
    '  transition: opacity 0.4s;',
    '}',
    '.toast.out { opacity: 0; }',
    '.toast img { width: 20px; height: 20px; border-radius: 4px; }',
    '.toast .tdot { width: 7px; height: 7px; border-radius: 2px; flex: none; }',

    /* ── 접힘 상태 필 ── */
    '.root.hidden { display: none; }',
    '.pillwrap { display: none; align-items: center; gap: 6px; }',
    '.root.min .pillwrap { display: inline-flex; }',
    '.pill {',
    '  display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px 8px 10px;',
    '  border: 1px solid var(--line); border-radius: 999px; cursor: pointer;',
    '  background: rgb(14 17 23 / 0.92); color: var(--tx);',
    '  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);',
    '  box-shadow: 0 8px 24px rgba(0,0,0,0.5); font-size: 11.5px; font-weight: 700;',
    "  font-family: inherit; letter-spacing: 0.02em;",
    '}',
    '.pill img { width: 20px; height: 20px; }',
    '.pill .live { font-size: 9px; }',
    '.pill-x {',
    '  width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--line);',
    '  background: rgb(14 17 23 / 0.92); color: var(--mut); cursor: pointer;',
    '  display: grid; place-items: center; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);',
    '  box-shadow: 0 8px 24px rgba(0,0,0,0.5);',
    '}',
    '.pill-x:hover { color: var(--tx); background: rgb(30 34 42 / 0.95); }',
    '.pill-x svg { width: 11px; height: 11px; }',
  ].join('\n');

  /* ── DOM 헬퍼 (데이터는 전부 textContent로 — 피드 값 innerHTML 주입 금지) ── */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function img(src, alt) {
    var n = document.createElement('img');
    n.src = src; n.alt = alt || ''; n.draggable = false;
    return n;
  }
  function avatarImg(p) {
    var wrap = el('div', 'ava');
    if (p.championImg) {
      var im = img(p.championImg, p.championKr);
      im.addEventListener('error', function () {
        im.replaceWith(el('div', 'fb', (p.champion || '?')[0]));
      });
      wrap.appendChild(im);
    } else {
      wrap.appendChild(el('div', 'fb', (p.champion || '?')[0]));
    }
    var hp = el('div', 'hp');
    var bar = el('i');
    bar.style.width = Math.max(0, Math.min(100, (p.currentHealth / p.maxHealth) * 100)) + '%';
    hp.appendChild(bar);
    wrap.appendChild(hp);
    wrap.appendChild(el('span', 'lv', String(p.level)));
    return wrap;
  }
  function fmtGold(g) { return (g / 1000).toFixed(1) + 'k'; }
  function fmtClock(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  var ICONS = {
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  };
  function iconBtn(name, label) {
    var b = el('button', 'hbtn');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = ICONS[name]; // 정적 상수만 — 외부 데이터 아님
    return b;
  }

  function treeHeaderEl(dict, styleId, textOverride) {
    var st = styleId != null ? (dict.styles[styleId] || { name: '?', icon: null }) : null;
    var hd = el('div', 'tree-hd');
    if (st && st.icon) hd.appendChild(img(st.icon, st.name));
    hd.appendChild(el('span', null, textOverride || st.name));
    return hd;
  }
  function runeRowEl(dict, id, isKey) {
    var r = dict.runes[id] || { name: '룬 ' + id, icon: null };
    var row = el('div', isKey ? 'r key' : 'r');
    if (r.icon) row.appendChild(img(r.icon, r.name));
    row.appendChild(el('span', null, r.name));
    row.title = r.name;
    return row;
  }
  function runeIcoEl(dict, id, cls) {
    var r = dict.runes[id] || dict.shards[id] || {};
    if (!r.icon) return null;
    var im = img(r.icon, r.name);
    im.title = r.name;
    if (cls) im.className = cls;
    return im;
  }
  /* 룬 전체를 아이콘 한 줄로: 키스톤(크게) + 메인3 | 서브2 | 조각 */
  function runeStripEl(dict, p) {
    var strip = el('div', 'rstrip');
    function add(id, cls) {
      var n = runeIcoEl(dict, id, cls);
      if (n) strip.appendChild(n);
    }
    p.perks.primary.forEach(function (id, i) { add(id, i === 0 ? 'rkey' : ''); });
    strip.appendChild(el('span', 'rsep'));
    p.perks.secondary.forEach(function (id) { add(id, ''); });
    strip.appendChild(el('span', 'rsep'));
    p.perks.shards.forEach(function (id) { add(id, 'rshard'); });
    return strip;
  }
  function shardChipsEl(dict, ids) {
    var shards = el('div', 'shards');
    ids.forEach(function (id) {
      var s = dict.shards[id] || { name: '조각 ' + id, icon: null };
      var chip = el('span', 'shard');
      if (s.icon) chip.appendChild(img(s.icon, s.name));
      chip.appendChild(el('span', null, s.name));
      shards.appendChild(chip);
    });
    return shards;
  }

  /* 하단 상세 영역의 내용: 선수 이름 + 룬 2열 + 아이템 그리드 (+라인 상대 비교 버튼) */
  function buildDetailContent(p, dict, onCompare) {
    var wrap = el('div', 'dwrap');

    var dhead = el('div', 'dhead');
    dhead.appendChild(el('span', 'nm', p.name));
    dhead.appendChild(el('span', 'ch', p.championKr + ' · Lv' + p.level));
    if (onCompare) {
      var cb = el('button', 'cmpbtn', '↔ 라인 상대 비교');
      cb.type = 'button';
      cb.addEventListener('click', onCompare);
      dhead.appendChild(cb);
    }
    wrap.appendChild(dhead);

    var runes = el('div', 'runes');
    var left = el('div');
    var mid = el('div');
    var right = el('div');

    function treeHeader(styleId, textOverride) { return treeHeaderEl(dict, styleId, textOverride); }
    function runeRow(id, isKey) { return runeRowEl(dict, id, isKey); }

    if (!PREFS.runeNames) {
      /* 간결 표시: 이름 없이 아이콘만 */
      left.appendChild(treeHeader(p.perks.styleId));
      var lst = el('div', 'rstrip');
      p.perks.primary.forEach(function (id, i) {
        var n = runeIcoEl(dict, id, i === 0 ? 'rkey' : '');
        if (n) lst.appendChild(n);
      });
      left.appendChild(lst);
      mid.appendChild(treeHeader(p.perks.subStyleId));
      var mst = el('div', 'rstrip');
      p.perks.secondary.forEach(function (id) {
        var n = runeIcoEl(dict, id, '');
        if (n) mst.appendChild(n);
      });
      mst.appendChild(el('span', 'rsep'));
      p.perks.shards.forEach(function (id) {
        var n = runeIcoEl(dict, id, 'rshard');
        if (n) mst.appendChild(n);
      });
      mid.appendChild(mst);
    } else {
      left.appendChild(treeHeader(p.perks.styleId));
      p.perks.primary.forEach(function (id, i) { left.appendChild(runeRow(id, i === 0)); });

      mid.appendChild(treeHeader(p.perks.subStyleId));
      p.perks.secondary.forEach(function (id) { mid.appendChild(runeRow(id, false)); });
      mid.appendChild(shardChipsEl(dict, p.perks.shards));
    }

    /* 아이템 2×4 그리드: 일반 6칸 + 장신구(금테) — 표시 항목 설정으로 숨김 가능 */
    if (PREFS.items) {
      right.appendChild(treeHeader(null, '아이템'));
      var grid = el('div', 'itemgrid');
      var normal = p.items.filter(function (id) { return !TRINKETS[id]; });
      var trinket = p.items.filter(function (id) { return TRINKETS[id]; });
      var slot = function (id, extraCls) {
        var s = el('div', 'slot' + (extraCls || ''));
        var it = dict.items[id];
        if (it && it.icon) { s.appendChild(img(it.icon, it.name)); s.title = it.name; }
        return s;
      };
      normal.slice(0, MAX_ITEM_SLOTS).forEach(function (id) { grid.appendChild(slot(id)); });
      for (var i = normal.length; i < MAX_ITEM_SLOTS; i++) grid.appendChild(el('div', 'slot empty'));
      if (trinket.length) grid.appendChild(slot(trinket[0], ' trinket'));
      else grid.appendChild(el('div', 'slot empty trinket'));
      right.appendChild(grid);
    }

    runes.appendChild(left);
    runes.appendChild(mid);
    runes.appendChild(right);
    wrap.appendChild(runes);

    /* 방송이 안 보여주는 지표 칩: 스킬 마스터 순서·킬관여·딜 비중·와드 */
    var xstats = el('div', 'xstats');
    function xchip(k, v) {
      var c = el('span', 'xchip');
      c.appendChild(el('span', 'k', k));
      c.appendChild(el('span', 'v', v));
      return c;
    }
    var so = PREFS.skills ? skillOrder(p.abilities) : null;
    if (so) xstats.appendChild(xchip('스킬', so));
    if (PREFS.kp && p.killParticipation != null) xstats.appendChild(xchip('킬관여', Math.round(p.killParticipation * 100) + '%'));
    if (PREFS.wards && p.wardsPlaced != null) xstats.appendChild(xchip('와드 설치/제거', p.wardsPlaced + ' / ' + p.wardsDestroyed));
    if (xstats.childNodes.length) wrap.appendChild(xstats);
    return wrap;
  }

  /* 라인 매치업: 같은 포지션 두 선수의 룬을 나란히 */
  function buildCompareContent(a, b, dict, onBack) {
    var wrap = el('div', 'dwrap');
    var dhead = el('div', 'dhead');
    dhead.appendChild(el('span', 'nm', '라인 매치업'));
    dhead.appendChild(el('span', 'ch', a.championKr + ' vs ' + b.championKr));
    if (onBack) {
      var back = el('button', 'cmpbtn', '개별 보기');
      back.type = 'button';
      back.addEventListener('click', onBack);
      dhead.appendChild(back);
    }
    wrap.appendChild(dhead);
    var cmp = el('div', 'cmp');
    [a, b].forEach(function (p, idx) {
      var col = el('div', 'cmpcol' + (idx ? ' cred' : ''));
      var h = el('div', 'dhead');
      h.appendChild(el('span', 'nm', p.name));
      h.appendChild(el('span', 'ch', p.championKr));
      col.appendChild(h);
      if (!PREFS.runeNames) {
        col.appendChild(runeStripEl(dict, p));
      } else {
        col.appendChild(treeHeaderEl(dict, p.perks.styleId));
        p.perks.primary.forEach(function (id, i) { col.appendChild(runeRowEl(dict, id, i === 0)); });
        col.appendChild(treeHeaderEl(dict, p.perks.subStyleId));
        p.perks.secondary.forEach(function (id) { col.appendChild(runeRowEl(dict, id, false)); });
        col.appendChild(shardChipsEl(dict, p.perks.shards));
      }
      cmp.appendChild(col);
    });
    wrap.appendChild(cmp);

    /* 라인전 격차: 레벨 · CS · 골드 */
    var vs = el('div', 'xstats');
    function vschip(k, va, vb) {
      var c = el('span', 'xchip');
      c.appendChild(el('span', 'k', k));
      c.appendChild(el('span', 'v', va + ' : ' + vb));
      return c;
    }
    vs.appendChild(vschip('레벨', a.level, b.level));
    vs.appendChild(vschip('CS', a.creepScore, b.creepScore));
    vs.appendChild(vschip('골드', fmtGold(a.totalGold), fmtGold(b.totalGold)));
    var gdiff = a.totalGold - b.totalGold;
    var gtxt = Math.abs(gdiff) < 1000 ? Math.abs(gdiff) + ' G' : fmtGold(Math.abs(gdiff));
    var lead = el('span', 'xchip');
    lead.appendChild(el('span', 'v', (gdiff >= 0 ? a.name : b.name) + ' +' + gtxt));
    lead.querySelector('.v').style.color = gdiff >= 0 ? '#55A0FF' : '#FF6B6B';
    vs.appendChild(lead);
    wrap.appendChild(vs);
    return wrap;
  }

  function buildRow(p, dict) {
    var row = el('div', 'row');
    row.dataset.pid = p.participantId;
    row.appendChild(avatarImg(p));

    var who = el('div', 'who');
    who.appendChild(el('div', 'nm', p.name));
    who.appendChild(el('div', 'ch', p.championKr));
    row.appendChild(who);

    var stat = el('div', 'stat');
    var line = el('div');
    line.appendChild(el('b', null, String(p.kills)));
    line.appendChild(el('span', 'sep', ' / '));
    line.appendChild(el('i', 'd', String(p.deaths)));
    line.appendChild(el('span', 'sep', ' / '));
    line.appendChild(el('b', null, String(p.assists)));
    stat.appendChild(line);
    var sub = el('div', 'sub');
    sub.appendChild(el('span', 'g', fmtGold(p.totalGold)));
    sub.appendChild(el('span', null, ' · ' + p.creepScore + ' CS'));
    stat.appendChild(sub);
    row.appendChild(stat);

    var keyId = p.perks.primary[0];
    var keyRune = dict.runes[keyId];
    var ks = el('div', 'ks');
    if (keyRune && keyRune.icon) ks.appendChild(img(keyRune.icon, keyRune.name));
    ks.title = keyRune ? keyRune.name : '';
    row.appendChild(ks);
    return row;
  }

  function mount(host, state, opts) {
    opts = opts || {};
    var shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    shadow.textContent = '';
    var style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    var root = el('div', 'root');
    var panel = el('div', 'panel');

    /* 헤더 */
    var hdr = el('div', 'hdr');
    var live = el('span', 'live');
    live.appendChild(el('i'));
    live.appendChild(el('span', null, 'LIVE'));
    hdr.appendChild(live);
    var title = el('span', 'title');
    title.appendChild(el('span', null, state.blue));
    title.appendChild(el('span', 'vs', 'vs'));
    title.appendChild(el('span', null, state.red));
    hdr.appendChild(title);
    var meta = el('span', 'meta');
    meta.appendChild(el('span', 'set-label', state.gameNumber + '세트'));
    var clock = el('span', 'clock', fmtClock(state.gameTimeSec));
    meta.appendChild(clock);
    hdr.appendChild(meta);
    var gearBtn = iconBtn('gear', '설정');
    var closeBtn = iconBtn('x', '접기');
    hdr.appendChild(gearBtn);
    hdr.appendChild(closeBtn);
    panel.appendChild(hdr);

    /* 탭: 선수 / 지표 / 골드 그래프 */
    var tabsBar = el('div', 'tabs');
    panel.appendChild(tabsBar);

    /* 뷰 1: 팀 2열 + 하단 상세 영역 */
    var body = el('div', 'body');
    var viewPlayers = el('div', 'view on');
    var teams = el('div', 'teams');
    var byId = {};
    var blueList = state.players.filter(function (p) { return p.team === 'blue'; });
    var redList = state.players.filter(function (p) { return p.team === 'red'; });
    function laneOpp(p) {
      var mine = p.team === 'blue' ? blueList : redList;
      var other = p.team === 'blue' ? redList : blueList;
      return other[mine.indexOf(p)] || null;
    }
    ['blue', 'red'].forEach(function (side) {
      var members = side === 'blue' ? blueList : redList;
      var sec = el('section', 'team team-' + side);
      var thdr = el('div', 'thdr');
      thdr.appendChild(el('span', 'dot'));
      thdr.appendChild(el('span', null, side === 'blue' ? state.blue : state.red));
      var kills = members.reduce(function (a, p) { return a + p.kills; }, 0);
      var gold = members.reduce(function (a, p) { return a + p.totalGold; }, 0);
      thdr.appendChild(el('span', 'tstat', kills + 'K · ' + fmtGold(gold) + ' G'));
      sec.appendChild(thdr);
      members.forEach(function (p) {
        byId[p.participantId] = p;
        sec.appendChild(buildRow(p, state));
      });
      teams.appendChild(sec);
    });
    viewPlayers.appendChild(teams);

    var dzone = el('div', 'dzone');
    var dclip = el('div', 'dclip');
    dzone.appendChild(dclip);
    viewPlayers.appendChild(dzone);
    body.appendChild(viewPlayers);

    /* 헤더 정중앙 골드차 배지 — 어느 탭에서든 항상 보임 */
    (function () {
      var sum = function (list) { return list.reduce(function (a, p) { return a + p.totalGold; }, 0); };
      var diff = sum(blueList) - sum(redList);
      var chip = el('span', 'hdiff');
      chip.appendChild(el('span', null, diff >= 0 ? state.blue : state.red));
      chip.appendChild(el('b', null, '+' + fmtGold(Math.abs(diff))));
      chip.style.color = diff >= 0 ? '#55A0FF' : '#FF6B6B';
      chip.title = '팀 골드 차이';
      hdr.appendChild(chip);
    })();

    /* 뷰: 10인 룬 한눈에 (아이콘 스트립, 호버=이름·클릭=상세로 이동) */
    var viewRunes = el('div', 'view');
    (function () {
      var grid = el('div', 'mgrid');
      [blueList, redList].forEach(function (list) {
        var col = el('div', 'mcol');
        list.forEach(function (p) {
          var row = el('div', 'rrow');
          row.title = p.name + ' · ' + p.championKr + ' — 클릭하면 상세 보기';
          row.appendChild(el('span', 'mnm', p.name));
          row.appendChild(runeStripEl(state, p));
          row.addEventListener('click', function () {
            setTab('players');
            var r = teams.querySelector('.row[data-pid="' + p.participantId + '"]');
            if (r && openPid !== p.participantId) r.click();
          });
          col.appendChild(row);
        });
        grid.appendChild(col);
      });
      viewRunes.appendChild(grid);
    })();
    body.appendChild(viewRunes);

    /* 뷰 2: 10인 지표 비교 (골드·딜 비중·KDA) */
    var viewStats = el('div', 'view');
    (function () {
      var mdefs = [
        ['gold', '골드', function (p) { return p.totalGold; }, function (p) { return fmtGold(p.totalGold); }],
        ['ds', '딜 비중', function (p) { return p.championDamageShare || 0; },
         function (p) { return Math.round((p.championDamageShare || 0) * 100) + '%'; }],
        ['kda', 'KDA', function (p) { return (p.kills + p.assists) / Math.max(1, p.deaths); },
         function (p) { return p.kills + ' / ' + p.deaths + ' / ' + p.assists; }],
        ['cspm', 'CS/분', function (p) { return p.creepScore / Math.max(1, state.gameTimeSec / 60); },
         function (p) { return (p.creepScore / Math.max(1, state.gameTimeSec / 60)).toFixed(1); }],
        ['kp', '킬관여', function (p) { return p.killParticipation || 0; },
         function (p) { return Math.round((p.killParticipation || 0) * 100) + '%'; }],
        ['wards', '와드', function (p) { return p.wardsPlaced || 0; },
         function (p) { return (p.wardsPlaced || 0) + ' / ' + (p.wardsDestroyed || 0); }]
      ];
      var cur = 'gold';
      var chips = el('div', 'mchips');
      var grid = el('div', 'mgrid');
      function render() {
        var def;
        mdefs.forEach(function (m) { if (m[0] === cur) def = m; });
        grid.textContent = '';
        var max = 0;
        state.players.forEach(function (p) { max = Math.max(max, def[2](p)); });
        if (!max) max = 1;
        [blueList, redList].forEach(function (list, ti) {
          var col = el('div', 'mcol');
          /* 값 내림차순 정렬 + 팀 내 순위 (1위 금색) */
          var sorted = list.slice().sort(function (a, b) { return def[2](b) - def[2](a); });
          sorted.forEach(function (p, ri) {
            var row = el('div', 'mrow');
            row.title = p.name + ' · ' + p.championKr;
            row.appendChild(el('span', 'mrk' + (ri === 0 ? ' top' : ''), String(ri + 1)));
            row.appendChild(el('span', 'mnm', p.name));
            if (cur === 'kda') {
              /* KDA는 바 없이 "5 / 1 / 2 → 7" 식 수치 표기 */
              row.appendChild(el('span', 'mkda', p.kills + ' / ' + p.deaths + ' / ' + p.assists));
              var ratio = (p.kills + p.assists) / Math.max(1, p.deaths);
              row.appendChild(el('span', 'mv', String(Math.round(ratio * 10) / 10)));
            } else {
              var bar = el('div', 'mbar');
              var fill = el('i', ti === 0 ? 'bblue' : 'bred');
              fill.style.width = Math.max(2, Math.round(def[2](p) / max * 100)) + '%';
              bar.appendChild(fill);
              row.appendChild(bar);
              row.appendChild(el('span', 'mv', def[3](p)));
            }
            col.appendChild(row);
          });
          grid.appendChild(col);
        });
      }
      mdefs.forEach(function (m) {
        var b = el('button', 'tgl' + (m[0] === cur ? ' on' : ''), m[1]);
        b.type = 'button';
        b.addEventListener('click', function () {
          cur = m[0];
          Array.prototype.forEach.call(chips.children, function (c, i) {
            c.classList.toggle('on', mdefs[i][0] === cur);
          });
          render();
        });
        chips.appendChild(b);
      });
      render();
      viewStats.appendChild(chips);
      viewStats.appendChild(grid);
    })();
    body.appendChild(viewStats);

    /* 뷰 3: 팀 골드차 그래프 (SVG, goldHistory 기반) */
    var viewGold = el('div', 'view');
    function renderGoldView() {
      viewGold.textContent = '';
      var v = el('div', 'gview');
      var gh = state.goldHistory || [];
      if (gh.length < 2) {
        v.appendChild(el('div', 'note', '골드 시계열 수집 중입니다 — 잠시 후 다시 열어주세요.'));
        viewGold.appendChild(v);
        return;
      }
      var last = gh[gh.length - 1];
      var diff = last.b - last.r;
      var head = el('div', 'ghead');
      head.appendChild(el('span', 'glabel', '팀 골드 차이'));
      var gd = el('span', 'gdiff', (diff >= 0 ? state.blue : state.red) + ' +' + fmtGold(Math.abs(diff)));
      gd.style.color = diff >= 0 ? '#55A0FF' : '#FF6B6B';
      head.appendChild(gd);
      v.appendChild(head);

      var W = 560, H = 150, PL = 38, PR = 8, PY = 16;
      var maxT = gh[gh.length - 1].t;
      var maxAbs = 1000;
      gh.forEach(function (x) { maxAbs = Math.max(maxAbs, Math.abs(x.b - x.r)); });
      maxAbs = Math.ceil(maxAbs / 1000) * 1000;
      function X(t) { return (PL + (W - PL - PR) * (t / maxT)).toFixed(1); }
      function Y(d) { return (H / 2 - (H / 2 - PY) * (d / maxAbs)).toFixed(1); }
      /* 리드 팀 색으로 선 분절: 0선 교차점을 보간해 정확한 지점에서 색 전환 */
      var segs = [];
      var seg = null;
      gh.forEach(function (x, i) {
        var d = x.b - x.r;
        var c = d >= 0 ? '#55A0FF' : '#FF6B6B';
        var p = X(x.t) + ',' + Y(d);
        if (!seg) { seg = { c: c, pts: [p] }; segs.push(seg); return; }
        if (c === seg.c) { seg.pts.push(p); return; }
        var prev = gh[i - 1];
        var dPrev = prev.b - prev.r;
        var frac = dPrev / (dPrev - d);
        var tc = prev.t + (x.t - prev.t) * frac;
        var pc = X(tc) + ',' + Y(0);
        seg.pts.push(pc);
        seg = { c: c, pts: [pc, p] };
        segs.push(seg);
      });
      var lines = segs.map(function (s) {
        return '<polyline points="' + s.pts.join(' ') + '" fill="none" stroke="' + s.c + '" stroke-width="2" stroke-linejoin="round"/>';
      }).join('');

      /* 이벤트 마커 없음 (2026-08-04 결정: 시각 노이즈) — 킬·오브젝트 데이터는 goldHistory에 계속 수집 */
      var ticks = '';
      for (var m = 5; m * 60 <= maxT; m += 5) {
        ticks += '<text x="' + X(m * 60) + '" y="' + (H - 2) + '" fill="#566070" font-size="9" text-anchor="middle">' + m + '분</text>';
      }
      // 수치는 전부 내부 계산값 — 외부 문자열 없음
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('class', 'gsvg');
      svg.innerHTML =
        '<line x1="' + PL + '" y1="' + (H / 2) + '" x2="' + (W - PR) + '" y2="' + (H / 2) + '" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>' +
        '<line x1="' + PL + '" y1="' + PY + '" x2="' + (W - PR) + '" y2="' + PY + '" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>' +
        '<line x1="' + PL + '" y1="' + (H - PY) + '" x2="' + (W - PR) + '" y2="' + (H - PY) + '" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>' +
        '<text x="' + (PL - 5) + '" y="' + (PY + 3) + '" fill="#55A0FF" font-size="9" text-anchor="end">+' + (maxAbs / 1000) + 'k</text>' +
        '<text x="' + (PL - 5) + '" y="' + (H / 2 + 3) + '" fill="#566070" font-size="9" text-anchor="end">0</text>' +
        '<text x="' + (PL - 5) + '" y="' + (H - PY + 3) + '" fill="#FF6B6B" font-size="9" text-anchor="end">+' + (maxAbs / 1000) + 'k</text>' +
        ticks +
        lines;
      v.appendChild(svg);
      var legend = el('div', 'note',
        '가운데 위는 ' + state.blue + ' 리드, 아래는 ' + state.red + ' 리드 · 1분 간격');
      v.appendChild(legend);
      viewGold.appendChild(v);
    }
    renderGoldView();
    body.appendChild(viewGold);
    panel.appendChild(body);

    /* 탭 전환 */
    var TAB_DEFS = [['players', '선수', viewPlayers], ['runes', '룬', viewRunes], ['stats', '지표', viewStats], ['gold', '골드 그래프', viewGold]];
    var tabBtns = {};
    function setTab(name) {
      TAB_DEFS.forEach(function (t) {
        var on = t[0] === name;
        tabBtns[t[0]].classList.toggle('on', on);
        t[2].classList.toggle('on', on);
      });
      if (name === 'gold') renderGoldView(); // 열 때마다 최신 데이터로
    }
    TAB_DEFS.forEach(function (t) {
      var b = el('button', 'vtab' + (t[0] === 'players' ? ' on' : ''), t[1]);
      b.type = 'button';
      b.addEventListener('click', function () { setTab(t[0]); });
      tabBtns[t[0]] = b;
      tabsBar.appendChild(b);
    });

    /* 표시 항목 토글 시 열려 있는 상세를 다시 그리기 위한 훅 */
    var rerenderHooks = [];

    /* 설정 드로어 */
    var drawer = el('div', 'drawer');
    function sliderCtl(labelText, min, max, step, value, fmt, onInput) {
      var ctl = el('div', 'ctl');
      ctl.appendChild(el('label', null, labelText));
      var range = document.createElement('input');
      range.type = 'range'; range.min = min; range.max = max; range.step = step; range.value = value;
      var out = el('output', null, fmt(value));
      range.addEventListener('input', function () {
        out.textContent = fmt(Number(range.value));
        onInput(Number(range.value));
      });
      ctl.appendChild(range);
      ctl.appendChild(out);
      return ctl;
    }
    var store = { get: function (k, d) { try { var v = localStorage.getItem('lckov.' + k); return v == null ? d : Number(v); } catch (e) { return d; } },
                  set: function (k, v) { try { localStorage.setItem('lckov.' + k, String(v)); } catch (e) {} } };
    var delay = store.get('delay', -60);
    var alpha = store.get('alpha', 94);
    var uiScale = store.get('scale', 100);
    root.style.setProperty('--bg-a', alpha / 100);
    root.style.setProperty('--ui-scale', uiScale / 100);

    var scaleCtl = sliderCtl('UI 크기', 80, 180, 10, uiScale,
      function (v) { return v + '%'; },
      function (v) { root.style.setProperty('--ui-scale', v / 100); store.set('scale', v); });
    var alphaCtl = sliderCtl('투명도', 40, 100, 2, alpha,
      function (v) { return v + '%'; },
      function (v) { root.style.setProperty('--bg-a', v / 100); store.set('alpha', v); });

    /* 데이터 소스 선택 (라이브 클라이언트 연동 시): 경기·세트 선택 + 게임 시간 싱크 */
    if (opts.source) {
      var src = opts.source;
      var mCtl = el('div', 'ctl');
      mCtl.appendChild(el('label', null, '경기 선택'));
      var selEl = document.createElement('select');
      selEl.className = 'srcsel';
      var optAuto = document.createElement('option');
      optAuto.value = '';
      optAuto.textContent = '자동 (라이브 → 방송 제목 인식)';
      selEl.appendChild(optAuto);
      (src.matches || []).forEach(function (m) {
        var o = document.createElement('option');
        o.value = m.id;
        o.textContent = m.label;
        selEl.appendChild(o);
      });
      if (src.currentMatchId) selEl.value = String(src.currentMatchId);
      selEl.addEventListener('change', function () { src.onSelectMatch(selEl.value || null); });
      mCtl.appendChild(selEl);
      drawer.appendChild(mCtl);

      if (src.setCount > 1) {
        var setCtl = el('div', 'ctl');
        setCtl.appendChild(el('label', null, '세트'));
        var setRow = el('div', 'tglrow');
        for (var si = 1; si <= src.setCount; si++) {
          (function (num) {
            var b = el('button', 'tgl' + (num === src.setNumber ? ' on' : ''), num + '세트');
            b.type = 'button';
            b.addEventListener('click', function () { src.onSelectSet(num); });
            setRow.appendChild(b);
          })(si);
        }
        setCtl.appendChild(setRow);
        drawer.appendChild(setCtl);
      }

      if (src.canSync) {
        var syncCtl = el('div', 'ctl');
        syncCtl.appendChild(el('label', null, '게임 시간'));
        var clockIn = document.createElement('input');
        clockIn.className = 'clockin';
        clockIn.placeholder = '예: 15:45';
        var goBtn = el('button', 'minibtn', '이동');
        goBtn.type = 'button';
        goBtn.addEventListener('click', function () {
          var mm = /^(\d{1,2}):(\d{2})$/.exec(clockIn.value.trim());
          if (!mm) { clockIn.value = ''; clockIn.placeholder = 'mm:ss 형식'; return; }
          src.onSyncClock(Number(mm[1]) * 60 + Number(mm[2]));
        });
        syncCtl.appendChild(clockIn);
        syncCtl.appendChild(goBtn);
        syncCtl.appendChild(el('span', 'note', '화면 속 게임 시계를 입력하면 그 시점으로'));
        drawer.appendChild(syncCtl);
      }
    }

    /* 모드 프리셋: 개인 시청(기본) / 스트리머 송출(크게 + 불투명 — 재인코딩 대비) */
    var MODES = [
      ['personal', '개인 시청', { scale: 100, alpha: 94 }],
      ['streamer', '스트리머 송출', { scale: 150, alpha: 100 }]
    ];
    var curMode = (function () { try { return localStorage.getItem('lckov.mode') || 'personal'; } catch (e) { return 'personal'; } })();
    var modeCtl = el('div', 'ctl');
    modeCtl.appendChild(el('label', null, '모드'));
    var modeRow = el('div', 'tglrow');
    function setSlider(ctl, v, suffix) {
      ctl.querySelector('input').value = v;
      ctl.querySelector('output').textContent = v + suffix;
    }
    MODES.forEach(function (m) {
      var b = el('button', 'tgl' + (m[0] === curMode ? ' on' : ''), m[1]);
      b.type = 'button';
      b.addEventListener('click', function () {
        curMode = m[0];
        Array.prototype.forEach.call(modeRow.children, function (c, i) {
          c.classList.toggle('on', MODES[i][0] === curMode);
        });
        root.style.setProperty('--ui-scale', m[2].scale / 100);
        root.style.setProperty('--bg-a', m[2].alpha / 100);
        store.set('scale', m[2].scale);
        store.set('alpha', m[2].alpha);
        setSlider(scaleCtl, m[2].scale, '%');
        setSlider(alphaCtl, m[2].alpha, '%');
        try { localStorage.setItem('lckov.mode', curMode); } catch (e) {}
      });
      modeRow.appendChild(b);
    });
    modeCtl.appendChild(modeRow);
    drawer.appendChild(modeCtl);

    drawer.appendChild(scaleCtl);
    drawer.appendChild(sliderCtl('딜레이 보정', -300, 30, 10, delay,
      function (v) { return (v > 0 ? '+' : '') + v + '초'; },
      function (v) { store.set('delay', v); if (opts.onDelayChange) opts.onDelayChange(v); }));
    drawer.appendChild(alphaCtl);
    var dndCtl = el('div', 'ctl');
    dndCtl.appendChild(el('label', null, '방해금지'));
    var dndBtn = el('button', 'dndbtn', '켜기 — 패널을 숨기고, 중계 화면 좌우 선수 자리를 클릭해 룬 보기');
    dndBtn.type = 'button';
    dndCtl.appendChild(dndBtn);
    drawer.appendChild(dndCtl);
    var showCtl = el('div', 'ctl');
    showCtl.appendChild(el('label', null, '표시 항목'));
    var tglrow = el('div', 'tglrow');
    PREF_DEFS.forEach(function (def) {
      var b = el('button', 'tgl' + (PREFS[def[0]] ? ' on' : ''), def[1]);
      b.type = 'button';
      b.addEventListener('click', function () {
        PREFS[def[0]] = PREFS[def[0]] ? 0 : 1;
        b.classList.toggle('on', !!PREFS[def[0]]);
        savePrefs();
        rerenderHooks.forEach(function (f) { f(); });
      });
      tglrow.appendChild(b);
    });
    showCtl.appendChild(tglrow);
    drawer.appendChild(showCtl);
    drawer.appendChild(el('div', 'note',
      '단축키: Alt+L 표시/숨김 · Alt+K 방해금지 — 패치 ' + state.patch +
      ' · Riot 데이터 기반 비공식 무료 팬 프로젝트입니다. Riot Games가 보증하지 않습니다.'));
    panel.appendChild(drawer);
    root.appendChild(panel);

    /* 접힘 필 + 완전 숨김 버튼 */
    var pillwrap = el('div', 'pillwrap');
    var pill = el('button', 'pill');
    pill.type = 'button';
    pill.title = '패널 펼치기';
    var keyP = state.players[0] && state.runes[state.players[0].perks.primary[0]];
    if (keyP && keyP.icon) pill.appendChild(img(keyP.icon, ''));
    pill.appendChild(el('span', null, '룬 · 빌드'));
    var pl = el('span', 'live');
    pl.appendChild(el('i'));
    pl.appendChild(el('span', null, 'LIVE'));
    pill.appendChild(pl);
    pillwrap.appendChild(pill);
    var pillX = el('button', 'pill-x');
    pillX.type = 'button';
    pillX.title = '오버레이 완전히 숨기기 (확장 아이콘으로 다시 켤 수 있음)';
    pillX.innerHTML = ICONS.x; // 정적 상수
    pillwrap.appendChild(pillX);
    root.appendChild(pillwrap);

    /* 토스트 (최대 3개, 6초 후 자동 소멸) — 원격 설정의 공지 문구·킬스위치 안내 표시용 */
    var toasts = el('div', 'toasts');
    root.appendChild(toasts);
    function notify(o) {
      var t = el('div', 'toast');
      if (o.team) {
        var d0 = el('span', 'tdot');
        d0.style.background = o.team === 'blue' ? '#55A0FF' : '#FF6B6B';
        t.appendChild(d0);
      }
      if (o.icon) t.appendChild(img(o.icon, ''));
      t.appendChild(el('span', null, o.text));
      toasts.appendChild(t);
      while (toasts.children.length > 3) toasts.removeChild(toasts.firstChild);
      setTimeout(function () {
        t.classList.add('out');
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 450);
      }, 6000);
    }

    /* 방해금지 모드: 중계 화면의 좌우 선수 HUD 위치에 맞춘 클릭 존.
       기본 좌표(vh/px)는 표준 LCK 레이아웃 기준 — 시즌별 변경은 원격 설정(state.dndLayout)으로 대응 */
    /* 기본 좌표는 실제 LCK 방송 HUD 실측값 (2026-08-04, 16:9 기준):
       좌우 선수 바 5개가 화면 높이 12.8%부터 9.6% 간격 */
    var DND = state.dndLayout || { top: 12.8, step: 9.6, height: 8.6, width: 56 };
    var dndzones = el('div', 'dndzones');
    var dndPop = el('div', 'dnd-pop');
    dndPop.style.display = 'none';

    /* 존을 페이지의 video 사각형에 앵커링 — 플레이어가 화면 일부여도 중계 위에 정렬.
       (워치파티처럼 영상 안에서 다시 축소된 화면까지는 못 따라감 — 원격 설정으로 보정 예정) */
    var zoneList = [];
    function largestVideoRect() {
      var vids = document.querySelectorAll('video');
      var best = null, area = 0;
      for (var i = 0; i < vids.length; i++) {
        var r = vids[i].getBoundingClientRect();
        var a = r.width * r.height;
        if (a > area && r.width > 200) { area = a; best = r; }
      }
      return best;
    }
    function positionZones() {
      var r = largestVideoRect();
      var top0 = r ? r.top : 0;
      var h = r ? r.height : window.innerHeight;
      var leftX = r ? r.left : 0;
      var rightX = r ? Math.max(0, window.innerWidth - r.right) : 0;
      zoneList.forEach(function (z, idx) {
        var i = idx % 5;
        z.style.top = (top0 + h * (DND.top + i * DND.step) / 100) + 'px';
        z.style.height = (h * DND.height / 100) + 'px';
        z.style.width = DND.width + 'px';
        if (z.classList.contains('zleft')) { z.style.left = leftX + 'px'; z.style.right = 'auto'; }
        else { z.style.right = rightX + 'px'; z.style.left = 'auto'; }
      });
    }
    var zoneTimer = setInterval(function () {
      if (root.classList.contains('dnd')) positionZones();
    }, 1000);
    window.addEventListener('resize', positionZones);
    var dndOpenPid = null;
    var dndCmp = false;
    var dndSelZone = null;
    function renderDndDetail() {
      var p = byId[dndOpenPid];
      var opp = laneOpp(p);
      dndPop.textContent = '';
      if (dndCmp && opp) {
        dndPop.appendChild(buildCompareContent(p, opp, state, function () { dndCmp = false; renderDndDetail(); }));
      } else {
        dndPop.appendChild(buildDetailContent(p, state, opp && function () { dndCmp = true; renderDndDetail(); }));
      }
    }
    ['blue', 'red'].forEach(function (side) {
      state.players.filter(function (p) { return p.team === side; }).forEach(function (p) {
        var z = el('div', 'dndzone ' + (side === 'blue' ? 'zleft' : 'zright'));
        z.dataset.pid = p.participantId;
        var tag = el('span', 'tag', p.name + ' · ' + p.championKr);
        z.appendChild(tag);
        z.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation(); // SOOP 플레이어의 클릭(일시정지 등)으로 전파 방지
          if (dndSelZone) dndSelZone.classList.remove('sel');
          if (dndOpenPid === p.participantId) {
            dndOpenPid = null; dndSelZone = null;
            dndPop.style.display = 'none';
            return;
          }
          dndOpenPid = p.participantId; dndCmp = false; dndSelZone = z;
          z.classList.add('sel');
          renderDndDetail();
          var rect = z.getBoundingClientRect();
          dndPop.style.top = Math.max(8, Math.min(rect.top, window.innerHeight - 260)) + 'px';
          if (side === 'blue') {
            dndPop.style.left = (rect.right + 12) + 'px';
            dndPop.style.right = 'auto';
          } else {
            dndPop.style.right = (window.innerWidth - rect.left + 12) + 'px';
            dndPop.style.left = 'auto';
          }
          dndPop.style.transformOrigin = side === 'blue' ? 'top left' : 'top right';
          dndPop.style.display = 'block';
        });
        zoneList.push(z);
        dndzones.appendChild(z);
      });
    });
    positionZones();
    dndzones.appendChild(dndPop);
    root.appendChild(dndzones);
    var dndHandle = el('button', 'dnd-handle');
    dndHandle.type = 'button';
    var dh = el('span', 'live');
    dh.appendChild(el('i'));
    dndHandle.appendChild(dh);
    dndHandle.appendChild(el('span', null, '방해금지 해제'));
    root.appendChild(dndHandle);

    rerenderHooks.push(function () {
      if (dndOpenPid != null) renderDndDetail();
    });

    function setDnd(on) {
      root.classList.toggle('dnd', !!on);
      if (on) {
        root.classList.add('dnd-intro');
        setTimeout(function () { root.classList.remove('dnd-intro'); }, 2200);
      }
      if (!on) {
        dndPop.style.display = 'none';
        if (dndSelZone) dndSelZone.classList.remove('sel');
        dndOpenPid = null; dndSelZone = null;
      }
    }

    shadow.appendChild(root);

    /* ── 동작 ── */
    gearBtn.addEventListener('click', function () { root.classList.toggle('settings'); });
    closeBtn.addEventListener('click', function () { root.classList.add('min'); });
    pill.addEventListener('click', function () { root.classList.remove('min'); });
    pillX.addEventListener('click', function () {
      root.classList.add('hidden');
      if (opts.onHide) opts.onHide(); // 확장에서는 chrome.storage에 저장 → 툴바 아이콘으로 복구
    });
    dndBtn.addEventListener('click', function () { setDnd(true); });
    dndHandle.addEventListener('click', function () { setDnd(false); });

    /* 카드 클릭 → 하단 상세 영역에 표시 (같은 카드 재클릭 시 닫힘, 라인 상대 비교 지원) */
    var openPid = null;
    var openCmp = false;
    var selRow = null;
    function renderPanelDetail() {
      var p = byId[openPid];
      var opp = laneOpp(p);
      dclip.textContent = '';
      if (openCmp && opp) {
        dclip.appendChild(buildCompareContent(p, opp, state, function () { openCmp = false; renderPanelDetail(); }));
      } else {
        dclip.appendChild(buildDetailContent(p, state, opp && function () { openCmp = true; renderPanelDetail(); }));
      }
    }
    teams.addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('.row') : null;
      if (!row) return;
      var pid = Number(row.dataset.pid);
      if (selRow) selRow.classList.remove('sel');
      if (openPid === pid) {
        openPid = null; selRow = null;
        dzone.classList.remove('open');
        return;
      }
      openPid = pid; openCmp = false; selRow = row;
      row.classList.add('sel');
      renderPanelDetail();
      dzone.classList.add('open');
    });
    rerenderHooks.push(function () {
      if (openPid != null) renderPanelDetail();
    });

    /* 드래그 이동 (헤더) */
    (function () {
      var sx, sy, ox, oy, dragging = false;
      hdr.addEventListener('pointerdown', function (e) {
        if (e.target.closest('button')) return;
        dragging = true;
        var rect = root.getBoundingClientRect();
        root.style.left = rect.left + 'px';
        root.style.top = rect.top + 'px';
        root.style.right = 'auto';
        root.classList.add('origin-left'); // 스케일 기준점을 드래그 위치에 맞춤
        sx = e.clientX; sy = e.clientY; ox = rect.left; oy = rect.top;
        hdr.setPointerCapture(e.pointerId);
      });
      hdr.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var x = Math.min(Math.max(0, ox + e.clientX - sx), window.innerWidth - 60);
        var y = Math.min(Math.max(0, oy + e.clientY - sy), window.innerHeight - 40);
        root.style.left = x + 'px';
        root.style.top = y + 'px';
      });
      hdr.addEventListener('pointerup', function () { dragging = false; });
    })();

    /* 단축키: Alt+L 표시/숨김 · Alt+K 방해금지 (채팅 등 입력 중에는 무시)
       확장에서는 chrome.commands로 정식 등록 예정 — 이건 페이지 레벨 폴백 */
    function keyHandler(e) {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.code === 'KeyL') {
        e.preventDefault();
        root.classList.toggle('hidden');
      } else if (e.code === 'KeyK') {
        e.preventDefault();
        root.classList.remove('hidden');
        setDnd(!root.classList.contains('dnd'));
      }
    }
    /* 캡처 단계 등록 — SOOP 플레이어가 keydown 전파를 끊어도 먼저 받기 위함 */
    document.addEventListener('keydown', keyHandler, true);

    /* 데모용 시계 */
    var timer = null;
    if (opts.tickClock) {
      var t = state.gameTimeSec;
      timer = setInterval(function () { t += 1; clock.textContent = fmtClock(t); }, 1000);
    }

    return {
      root: root,
      setGameTime: function (sec) { clock.textContent = fmtClock(sec); },
      setHidden: function (h) { root.classList.toggle('hidden', !!h); }, // 확장 툴바 토글용
      setDnd: setDnd,
      setTab: setTab,
      notify: notify,
      setPref: function (k, v) { PREFS[k] = v ? 1 : 0; savePrefs(); rerenderHooks.forEach(function (f) { f(); }); },
      destroy: function () {
        if (timer) clearInterval(timer);
        document.removeEventListener('keydown', keyHandler, true); // 콘솔 버전은 폴링마다 재마운트 — 리스너 누적 방지
        if (zoneTimer) clearInterval(zoneTimer);
        window.removeEventListener('resize', positionZones);
        shadow.textContent = '';
      }
    };
  }

  window.LCKOverlay = { mount: mount };
})();

/**
 * SOOP LCK 룬 오버레이 — 라이브 데이터 클라이언트 (브라우저용)
 *
 * 라이엇 esports-api·livestats를 직접 폴링해 오버레이 state를 만든다.
 * 두 API 모두 CORS 개방(Access-Control-Allow-Origin: *)이라 어느 페이지에서든 동작 (2026-08-04 실측).
 * 지금은 콘솔 주입 테스트용으로 쓰고, 확장에서는 이 로직이 background service worker로 들어간다.
 *
 * 사용: LCKLive.start({ onState: function (state) { ... } })
 *  - 진행 중인 LCK/챌린저스 경기를 자동 감지
 *  - 없으면 최근 종료 경기를 리플레이 모드로 재생 (15분 지점부터 실시간 배속)
 */
(function () {
  "use strict";

  var API = "https://esports-api.lolesports.com/persisted/gw";
  var KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z"; // lolesports.com 공개 키
  var FEED = "https://feed.lolesports.com/livestats/v1";
  var DD = "https://ddragon.leagueoflegends.com";
  var LEAGUE_IDS = ["98767991310872058", "98767991335774713"]; // LCK, LCK CL — 원격 설정으로 이관 예정
  var LEAGUE_SLUGS = ["lck", "lck_challengers_league"];
  var CD_STATMODS = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/statmods/";
  var SHARDS = {
    5001: ["체력 (레벨 비례)", "statmodshealthscalingicon.png"],
    5005: ["공격 속도", "statmodsattackspeedicon.png"],
    5007: ["스킬 가속", "statmodscdrscalingicon.png"],
    5008: ["적응형 능력치", "statmodsadaptiveforceicon.png"],
    5010: ["이동 속도", "statmodsmovementspeedicon.png"],
    5011: ["체력", "statmodshealthplusicon.png"],
    5013: ["강인함/둔화 저항", "statmodstenacityicon.png"],
  };

  function log(msg) { console.log("%c[LCK 오버레이]%c " + msg, "color:#E8C36B;font-weight:bold", ""); }

  async function j(url, headers) {
    var r = await fetch(url, { headers: headers || {} });
    if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
    return r.json();
  }
  async function jOr(url, headers) {
    try {
      var r = await fetch(url, { headers: headers || {} });
      if (r.status === 204 || !r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }
  function api(path) { return j(API + "/" + path, { "x-api-key": KEY }); }
  function floor10(d) {
    d = new Date(d.getTime());
    d.setUTCMilliseconds(0);
    d.setUTCSeconds(d.getUTCSeconds() - (d.getUTCSeconds() % 10));
    return d;
  }
  function iso(d) { return d.toISOString().replace(/\.\d+Z$/, "Z"); }

  function isTarget(e) {
    if (e.type !== "match" || !e.match) return false;
    var lg = e.league || {};
    return LEAGUE_IDS.indexOf(String(lg.id || "")) >= 0 || LEAGUE_SLUGS.indexOf(lg.slug) >= 0;
  }
  async function findLiveMatch() {
    var d = await api("getLive?hl=ko-KR");
    var evs = ((d.data.schedule || {}).events || []).filter(isTarget);
    if (!evs.length) return null;
    var pick = evs[0];
    if (evs.length > 1) {
      /* 동시 라이브(LCK+CL 등): 방송 제목에 팀 코드가 있으면 그 경기 우선 (워치파티 대응) */
      var title = (document.title || "").toUpperCase();
      var hit = evs.filter(function (e) {
        return e.match.teams.every(function (t) {
          var code = String(t.code || t.name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
          return code && code !== "TBD" && new RegExp("(^|[^A-Z0-9])" + code + "([^A-Z0-9]|$)").test(title);
        });
      })[0];
      if (hit) pick = hit;
      log("동시 라이브 " + evs.length + "건 → " + (hit ? "방송 제목으로 선택" : "첫 경기 선택 (톱니에서 변경 가능)"));
    }
    return { matchId: pick.match.id,
             title: pick.match.teams.map(function (t) { return t.code || t.name; }).join(" vs ") };
  }

  /* ── 시간축 원칙: 오버레이의 기준 시각은 "시청자가 보고 있는 화면의 시각" ──
     라이브 되감기(타임시프트) 대응: 페이지의 video 요소에서 라이브 엣지 대비
     얼마나 뒤에 있는지(Δ)를 읽는다. video가 없거나 판별 불가면 0 (현재 시각 기준 폴백). */
  function findVideo() {
    try {
      var vids = document.querySelectorAll("video");
      var v = null, area = 0;
      for (var i = 0; i < vids.length; i++) {
        var r = vids[i].getBoundingClientRect();
        if (r.width * r.height > area) { area = r.width * r.height; v = vids[i]; }
      }
      return v;
    } catch (e) { return null; }
  }

  function videoBehindLive() {
    try {
      var v = findVideo();
      if (!v || !v.seekable || !v.seekable.length) return 0;
      var edge = v.seekable.end(v.seekable.length - 1);
      var behind = edge - v.currentTime;
      if (!isFinite(behind) || behind < 0) return 0;
      return behind > 8 ? behind : 0; // 8초 이내 오차는 라이브로 취급
    } catch (e) { return 0; }
  }

  /* 최근 12일 종료 경기 목록 (스포일러 방지: 스코어 미포함) */
  async function listRecent() {
    var out = [];
    for (var i = 0; i < LEAGUE_IDS.length; i++) {
      try {
        var sch = await api("getSchedule?hl=ko-KR&leagueId=" + LEAGUE_IDS[i]);
        var isCL = LEAGUE_IDS[i] === "98767991335774713";
        sch.data.schedule.events.forEach(function (e) {
          if (e.type !== "match" || e.state !== "completed") return;
          var when = new Date(e.startTime);
          if (Date.now() - when.getTime() > 12 * 86400000) return;
          var codes = e.match.teams.map(function (t) { return t.code || t.name; });
          out.push({ matchId: e.match.id, codes: codes, time: when.getTime(),
                     label: (when.getMonth() + 1) + "/" + when.getDate() + " · " + codes.join(" vs ") + (isCL ? " (CL)" : " (LCK)") });
        });
      } catch (err) {}
    }
    out.sort(function (a, b) { return b.time - a.time; });
    return out;
  }

  /* 방송 제목에서 팀 코드 2개가 모두 발견되는 경기 자동 인식 (워치파티 대응) */
  function matchFromTitle(list) {
    var title = (document.title || "").toUpperCase();
    var hits = list.filter(function (m) {
      return m.codes.every(function (c) {
        var code = String(c).toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (!code || code === "TBD") return false;
        return new RegExp("(^|[^A-Z0-9])" + code + "([^A-Z0-9]|$)").test(title);
      });
    });
    return hits[0] || null;
  }

  var ddCache = null;
  async function loadStatic(patchVersion) {
    if (ddCache) return ddCache;
    var versions = await j(DD + "/api/versions.json");
    var mm = patchVersion.split(".").slice(0, 2).join(".") + ".";
    var patch = versions.filter(function (v) { return v.indexOf(mm) === 0; })[0] || versions[0];
    var res = await Promise.all([
      j(DD + "/cdn/" + patch + "/data/ko_KR/runesReforged.json"),
      j(DD + "/cdn/" + patch + "/data/ko_KR/champion.json"),
      j(DD + "/cdn/" + patch + "/data/ko_KR/item.json"),
    ]);
    var runeMap = {}, styleMap = {};
    res[0].forEach(function (t) {
      styleMap[t.id] = { name: t.name, icon: DD + "/cdn/img/" + t.icon };
      t.slots.forEach(function (s) {
        s.runes.forEach(function (r) { runeMap[r.id] = { name: r.name, icon: DD + "/cdn/img/" + r.icon }; });
      });
    });
    var champKr = {};
    Object.keys(res[1].data).forEach(function (k) { champKr[res[1].data[k].id] = res[1].data[k].name; });
    var shardMap = {};
    Object.keys(SHARDS).forEach(function (k) { shardMap[k] = { name: SHARDS[k][0], icon: CD_STATMODS + SHARDS[k][1] }; });
    ddCache = { patch: patch, runeMap: runeMap, styleMap: styleMap, champKr: champKr, itemData: res[2].data, shardMap: shardMap };
    log("정적 데이터 로드 완료 (DDragon " + patch + ")");
    return ddCache;
  }

  function teamGold(team) {
    if (team.totalGold) return team.totalGold;
    return team.participants.reduce(function (a, p) { return a + p.totalGold; }, 0);
  }

  function buildState(win, det, dd, meta) {
    var md = win.gameMetadata;
    var wf = win.frames[win.frames.length - 1];
    var df = det.frames[det.frames.length - 1];
    var wstats = {};
    ["blueTeam", "redTeam"].forEach(function (s) {
      wf[s].participants.forEach(function (p) { wstats[p.participantId] = p; });
    });
    var dstats = {};
    df.participants.forEach(function (p) { dstats[p.participantId] = p; });
    function code(m) { return m.participantMetadata[0].summonerName.split(" ")[0]; }

    var players = [];
    var itemsMap = {};
    [["blueTeamMetadata", "blue"], ["redTeamMetadata", "red"]].forEach(function (pair) {
      md[pair[0]].participantMetadata.forEach(function (pm) {
        var w = wstats[pm.participantId], d = dstats[pm.participantId];
        if (!w || !d) return;
        var perks = d.perkMetadata.perks;
        d.items.forEach(function (id) {
          if (!itemsMap[id]) {
            var info = dd.itemData[String(id)];
            itemsMap[id] = { name: info ? info.name : "아이템 " + id,
                             icon: DD + "/cdn/" + dd.patch + "/img/item/" + id + ".png",
                             gold: info && info.gold ? info.gold.total : 0 };
          }
        });
        players.push({
          participantId: pm.participantId, team: pair[1], role: pm.role || "",
          name: pm.summonerName.split(" ").slice(1).join(" ") || pm.summonerName,
          champion: pm.championId,
          championKr: dd.champKr[pm.championId] || pm.championId,
          championImg: DD + "/cdn/" + dd.patch + "/img/champion/" + pm.championId + ".png",
          level: w.level, kills: w.kills, deaths: w.deaths, assists: w.assists,
          creepScore: w.creepScore, totalGold: w.totalGold,
          currentHealth: w.currentHealth, maxHealth: w.maxHealth,
          items: d.items,
          perks: { styleId: d.perkMetadata.styleId, subStyleId: d.perkMetadata.subStyleId,
                   primary: perks.slice(0, 4), secondary: perks.slice(4, 6), shards: perks.slice(6) },
          abilities: d.abilities,
          killParticipation: d.killParticipation,
          championDamageShare: d.championDamageShare,
          wardsPlaced: d.wardsPlaced, wardsDestroyed: d.wardsDestroyed,
        });
      });
    });
    return {
      patch: dd.patch, gameNumber: meta.gameNumber,
      blue: code(md.blueTeamMetadata), red: code(md.redTeamMetadata),
      gameTimeSec: meta.elapsed, players: players, goldHistory: meta.goldHistory,
      runes: dd.runeMap, styles: dd.styleMap, shards: dd.shardMap, items: itemsMap,
    };
  }

  /* 공통: 한 시점의 프레임을 받아 state로 변환해 전달 */
  async function fetchAndEmit(gameId, gameNumber, gameStart, target, goldHistory, opts) {
    var qs = "?startingTime=" + iso(floor10(target));
    var win = await jOr(FEED + "/window/" + gameId + qs);
    var det = await jOr(FEED + "/details/" + gameId + qs);
    if (!win || !det) { log("프레임 없음 (204) — 대기"); return; }
    var dd = await loadStatic(win.gameMetadata.patchVersion);
    var f = win.frames[win.frames.length - 1];
    var elapsed = Math.max(0, Math.round((new Date(f.rfc460Timestamp) - gameStart) / 1000));
    if (!goldHistory.length || elapsed - goldHistory[goldHistory.length - 1].t >= 30) {
      goldHistory.push({
        t: elapsed, b: teamGold(f.blueTeam), r: teamGold(f.redTeam),
        bk: f.blueTeam.totalKills || 0, rk: f.redTeam.totalKills || 0,
        bd: (f.blueTeam.dragons || []).length, rd: (f.redTeam.dragons || []).length,
        bb: f.blueTeam.barons || 0, rb: f.redTeam.barons || 0,
      });
    }
    /* 타임시프트로 과거 구간에 있으면 미래 히스토리를 잘라 스포일러 방지 */
    var visible = goldHistory.filter(function (x) { return x.t <= elapsed; });
    var state = buildState(win, det, dd, { gameNumber: gameNumber, elapsed: elapsed, goldHistory: visible });
    state.gameState = f.gameState;
    if (opts.onState) opts.onState(state);
  }

  async function start(opts) {
    opts = opts || {};
    var timer = null;

    /* ── 라이브: 매치 단위 추적 + 타임시프트 대응 ── */
    if (!opts.gameId) {
      log("진행 중인 LCK·챌린저스 경기 탐색...");
      var live = await findLiveMatch();
      if (live) {
        log("라이브: " + live.title + " (matchId " + live.matchId + ")");
        var ranges = {}; // gameId → { number, state, start, end }
        var histories = {}; // gameId → goldHistory (세트별 분리)
        var curId = null, curNum = 1, curStart = null;
        var lastRefresh = 0;

        async function refreshRanges() {
          var det = await api("getEventDetails?hl=ko-KR&id=" + live.matchId);
          var games = det.data.event.match.games.filter(function (g) { return g.state !== "unneeded"; });
          for (var i = 0; i < games.length; i++) {
            var g = games[i];
            var e = ranges[g.id] || (ranges[g.id] = { number: g.number });
            e.state = g.state;
            if (!e.start) {
              var w0 = await jOr(FEED + "/window/" + g.id);
              if (w0) e.start = new Date(w0.frames[0].rfc460Timestamp);
            }
            if (e.state === "completed" && !e.end && e.start) {
              var far = new Date(Date.now() + 86400000);
              var wE = await jOr(FEED + "/window/" + g.id + "?startingTime=" + iso(floor10(far)));
              if (wE) e.end = new Date(wE.frames[wE.frames.length - 1].rfc460Timestamp);
            }
          }
        }
        function pickGameAt(t) {
          var best = null;
          Object.keys(ranges).forEach(function (gid) {
            var e = ranges[gid];
            if (!e.start) return;
            if (e.start <= t && (!best || e.start > best.e.start)) best = { gid: gid, e: e };
          });
          if (!best) Object.keys(ranges).forEach(function (gid) {
            var e = ranges[gid];
            if (!e.start) return;
            if (!best || e.start < best.e.start) best = { gid: gid, e: e };
          });
          return best;
        }

        async function liveTick() {
          var nowMs = Date.now();
          if (nowMs - lastRefresh > 60000) {
            lastRefresh = nowMs;
            try { await refreshRanges(); } catch (e) { log("일정 갱신 실패: " + e.message); }
          }
          var behind = videoBehindLive();
          var delay = Number(localStorage.getItem("lckov.delay") || -60);
          var eff = new Date(nowMs - behind * 1000 + delay * 1000);
          var sel = pickGameAt(eff);
          if (!sel) { log("피드 대기 중 (밴픽이면 게임 시작 후 자동 감지)"); return; }
          if (sel.gid !== curId) {
            curId = sel.gid; curNum = sel.e.number; curStart = sel.e.start;
            if (!histories[curId]) histories[curId] = [];
            log((behind > 8 ? "타임시프트 −" + Math.round(behind) + "초 → " : "") + curNum + "세트 추적");
          }
          var target = eff;
          if (sel.e.end && target > sel.e.end) target = sel.e.end;       // 종료된 세트면 마지막 장면 유지
          var minT = new Date(sel.e.start.getTime() + 15000);
          if (target < minT) target = minT;                               // 피드 시작 직전 204 방지
          await fetchAndEmit(curId, curNum, curStart, target, histories[curId], opts);
        }

        await refreshRanges();
        lastRefresh = Date.now();
        await liveTick();
        timer = setInterval(function () { liveTick().catch(function (e) { log("폴링 오류: " + e.message); }); }, 10000);
        return { stop: function () { clearInterval(timer); }, live: true, matchId: live.matchId, title: live.title };
      }
      log("라이브 경기 없음");
    }

    /* ── 리플레이: 매치·세트 지정 (수동 선택 / 제목 인식 / 최근 경기 폴백) ── */
    if (opts.matchId) return startReplayMatch(opts.matchId, opts.setNumber, opts, "선택한 경기");
    var list = await listRecent();
    var hit = matchFromTitle(list);
    if (hit) {
      log("방송 제목에서 경기 인식: " + hit.label);
      return startReplayMatch(hit.matchId, 1, opts, "제목 인식");
    }
    if (list.length) {
      log("제목 인식 실패 → 최근 경기 재생 (오버레이 톱니 → 경기 선택에서 변경 가능)");
      return startReplayMatch(list[0].matchId, 1, opts, "최근 경기");
    }
    log("경기를 찾지 못했습니다");
    return null;
  }

  /* 특정 매치의 특정 세트를 리플레이 (게임 시간 점프 지원) */
  async function startReplayMatch(matchId, setNumber, opts, labelPrefix) {
    var det = await api("getEventDetails?hl=ko-KR&id=" + matchId);
    var m = det.data.event.match;
    var title = m.teams.map(function (t) { return t.code || t.name; }).join(" vs ");
    var games = m.games.filter(function (g) { return g.state === "completed"; });
    if (!games.length) { log("이 매치의 피드가 아직 없습니다"); return null; }
    var n = Math.min(Math.max(setNumber || 1, 1), games.length);
    var g = games[n - 1];
    var w0 = await jOr(FEED + "/window/" + g.id);
    if (!w0) { log("livestats 피드가 없습니다"); return null; }
    var gameStart = new Date(w0.frames[0].rfc460Timestamp);
    var replayClock = new Date(gameStart.getTime() + 60000);
    var goldHistory = [];
    log(labelPrefix + ": " + title + " " + n + "세트 — 화면과 시간을 맞추려면 톱니 → 게임 시간에 입력");

    /* 영상 앵커: 리플레이 시계를 video 재생 위치에 묶는다.
       시킹·일시정지가 데이터에 그대로 반영되고, '게임 시간' 입력은 오프셋 보정 1회. */
    var anchor = null; // { videoT: video.currentTime, gameMs: 그때의 게임 시각 }
    var v0 = findVideo();
    if (v0) anchor = { videoT: v0.currentTime, gameMs: replayClock.getTime() };

    async function tick() {
      var v = findVideo();
      if (anchor && v) {
        replayClock = new Date(anchor.gameMs + (v.currentTime - anchor.videoT) * 1000);
      } else {
        replayClock = new Date(replayClock.getTime() + 10000);
      }
      await fetchAndEmit(g.id, g.number, gameStart, replayClock, goldHistory, opts);
    }
    await tick();
    var timer = setInterval(function () { tick().catch(function (e) { log("폴링 오류: " + e.message); }); }, 10000);
    return {
      stop: function () { clearInterval(timer); },
      live: false, matchId: matchId, title: title, setNumber: n, setCount: games.length,
      setClock: function (sec) {
        replayClock = new Date(gameStart.getTime() + sec * 1000);
        var v = findVideo();
        anchor = v ? { videoT: v.currentTime, gameMs: replayClock.getTime() } : null;
        goldHistory.length = 0; // 점프 시 그래프 재수집 (연속성 없음)
        tick().catch(function (e) { log("이동 실패: " + e.message); });
      }
    };
  }

  window.LCKLive = { start: start, listRecent: listRecent };
})();


/* ── 부트스트랩: 오버레이 마운트 + 폴링마다 UI 상태 보존 ── */
(function () {
  if (window.__lckovConsole) {
    console.log("[LCK 오버레이] 이미 실행 중입니다 — 새로 시작하려면 페이지 새로고침 후 다시 붙여넣으세요");
    return;
  }
  window.__lckovConsole = true;
  var host = document.createElement("div");
  host.id = "lckov-host";
  document.documentElement.appendChild(host);

  var api = null;
  var handle = null;
  var matches = [];
  var sel = null;
  try { sel = JSON.parse(sessionStorage.getItem("lckov.sel") || "null"); } catch (e) {}
  function saveSel() { try { sessionStorage.setItem("lckov.sel", JSON.stringify(sel)); } catch (e) {} }
  var TABS = ["players", "runes", "stats", "gold"];
  function capture() {
    if (!api) return null;
    var r = api.root;
    var s = {
      min: r.classList.contains("min"), dnd: r.classList.contains("dnd"),
      settings: r.classList.contains("settings"), originLeft: r.classList.contains("origin-left"),
      left: r.style.left, top: r.style.top, right: r.style.right, tab: 0, openPid: null
    };
    var vtabs = r.querySelectorAll(".vtab");
    for (var i = 0; i < vtabs.length; i++) if (vtabs[i].classList.contains("on")) s.tab = i;
    var sel = r.querySelector(".row.sel");
    if (sel) s.openPid = sel.dataset.pid;
    return s;
  }
  function restore(s) {
    if (!api || !s) return;
    var r = api.root;
    if (s.min) r.classList.add("min");
    if (s.dnd) r.classList.add("dnd"); // setDnd 대신 직접 — 인트로 깜빡임 반복 방지
    if (s.settings) r.classList.add("settings");
    if (s.originLeft) r.classList.add("origin-left");
    if (s.left) { r.style.left = s.left; r.style.top = s.top; r.style.right = s.right; }
    if (s.tab) api.setTab(TABS[s.tab]);
    if (s.openPid) {
      var row = r.querySelector('.row[data-pid="' + s.openPid + '"]');
      if (row) row.click();
    }
  }

  /* 경기·세트 선택과 게임 시간 싱크를 오버레이 설정에 연결 */
  function makeSource() {
    return {
      matches: matches.map(function (m) { return { id: m.matchId, label: m.label }; }),
      currentMatchId: (handle && !handle.live && handle.matchId) || (sel && sel.matchId) || "",
      setCount: (handle && handle.setCount) || 1,
      setNumber: (handle && handle.setNumber) || 1,
      canSync: !!(handle && handle.setClock),
      onSelectMatch: function (id) {
        sel = id ? { matchId: id, setNumber: 1 } : null;
        saveSel();
        restart();
      },
      onSelectSet: function (n) {
        sel = { matchId: (sel && sel.matchId) || (handle && handle.matchId), setNumber: n };
        saveSel();
        restart();
      },
      onSyncClock: function (sec) { if (handle && handle.setClock) handle.setClock(sec); }
    };
  }
  function onState(state) {
    var s = capture();
    if (api) api.destroy();
    api = LCKOverlay.mount(host, state, { source: makeSource() });
    restore(s);
  }
  function boot() {
    LCKLive.start({ matchId: sel && sel.matchId, setNumber: sel && sel.setNumber, onState: onState })
      .then(function (h) {
        if (h) {
          handle = h;
          window.__lckovStop = h.stop;
          console.log("[LCK 오버레이] 실행 중 — 중지하려면 window.__lckovStop()");
        }
      });
  }
  function restart() {
    if (handle) handle.stop();
    handle = null;
    boot();
  }
  LCKLive.listRecent().then(function (m) { matches = m; }).catch(function () {});
  boot();
})();

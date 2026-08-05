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
    '.live.replay { color: #9BA3AF; }',
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

    /* ── 싱크 배너 ── */
    '.syncbar {',
    '  display: flex; align-items: center; gap: 7px; padding: 7px 12px;',
    '  background: rgba(232,195,107,0.09); border-bottom: 1px solid rgba(232,195,107,0.35);',
    '  font-size: 11px; color: #C9CDD6;',
    '}',
    '.syncbar b { color: var(--gold); font-size: 11px; letter-spacing: 0.04em; }',
    '.syncbar .synchint { color: #7A8290; font-size: 10px; margin-left: auto; }',

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
    /* ── 게임 화면 영역 보정 박스 (워치파티: 영상 속 축소된 중계 화면 지정) ── */
    '.calbox { position: fixed; z-index: 4; border: 2px dashed var(--gold); background: rgba(232,195,107,0.07); cursor: move; }',
    '.calbox .calhandle { position: absolute; right: -10px; bottom: -10px; width: 20px; height: 20px; border-radius: 50%; background: var(--gold); cursor: nwse-resize; }',
    '.calbox .calbar { position: absolute; left: 50%; top: 8px; transform: translateX(-50%); display: flex; gap: 6px; }',
    '.calbox .calhint {',
    '  position: absolute; left: 50%; top: 46px; transform: translateX(-50%); white-space: nowrap;',
    '  font-size: 11.5px; font-weight: 700; color: var(--gold); background: rgb(14 17 23 / 0.92);',
    '  padding: 4px 12px; border-radius: 999px; border: 1px solid var(--line);',
    '}',
    '.dndzone .tag {',
    '  position: absolute; top: 50%; transform: translateY(-50%);',
    '  background: rgb(14 17 23 / 0.95); border: 1px solid var(--line); border-radius: 6px;',
    '  padding: 3px 8px; font-size: 10.5px; font-weight: 700; white-space: nowrap;',
    '  opacity: 0; pointer-events: none; transition: opacity 0.12s;',
    '}',
    '.dndzone:hover .tag, .dndzone.sel .tag { opacity: 1; }',
    '.dndzone.zleft .tag { left: calc(100% + 8px); } .dndzone.zright .tag { right: calc(100% + 8px); }',
    '.dnd-pop {',
    '  display: none; position: fixed; width: 502px; z-index: 1;',
    '  transform: scale(calc(var(--ui-scale) * var(--dnd-scale, 1)));', // 게임 화면 크기 비례 축소
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
    /* state.live === false → 리플레이·다시보기: LIVE로 오해하지 않게 구분 표시 */
    var isLive = state.live !== false;
    var live = el('span', isLive ? 'live' : 'live replay');
    if (isLive) live.appendChild(el('i'));
    live.appendChild(el('span', null, isLive ? 'LIVE' : '다시보기'));
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

    /* 싱크 미완료 배너: 다시보기에서 매핑이 아직 없으면 헤더 바로 아래에 입력줄 상시 노출 */
    if (opts.source && opts.source.needsSync && opts.source.onSyncClock) {
      var syncBar = el('div', 'syncbar');
      syncBar.appendChild(el('b', null, '싱크 필요'));
      syncBar.appendChild(el('span', null, '화면 속 게임 시간 →'));
      var syncIn = document.createElement('input');
      syncIn.className = 'clockin';
      syncIn.placeholder = '예: 31:06';
      var syncBtn = el('button', 'minibtn', '맞추기');
      syncBtn.type = 'button';
      var doSyncBar = function () {
        var m = String(syncIn.value || '').trim().match(/^(\d{1,2})[::.\s](\d{2})$/);
        if (!m) { syncIn.focus(); return; }
        opts.source.onSyncClock(Number(m[1]) * 60 + Number(m[2]));
      };
      syncBtn.addEventListener('click', doSyncBar);
      syncIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSyncBar(); });
      syncBar.appendChild(syncIn);
      syncBar.appendChild(syncBtn);
      syncBar.appendChild(el('span', 'synchint', '한 번만 — 이후 세트·시킹 자동, 이 영상에 저장됨'));
      panel.appendChild(syncBar);
    }

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
    /* UI 크기: 기본은 화면 폭에 맞춰 자동(1920px 기준 100%) — 슬라이더를 만지면 수동 고정 */
    function autoScalePct() {
      var w = window.innerWidth || 1920;
      return Math.max(80, Math.min(180, Math.round(w / 1920 * 20) * 5));
    }
    var scaleAuto = store.get('scaleAuto', store.get('scale', -1) < 0 ? 1 : 0);
    var uiScale = scaleAuto ? autoScalePct() : store.get('scale', 100);
    root.style.setProperty('--bg-a', alpha / 100);
    root.style.setProperty('--ui-scale', uiScale / 100);

    var setScaleManual;
    var scaleCtl = sliderCtl('UI 크기', 80, 180, 10, uiScale,
      function (v) { return v + '%'; },
      function (v) { setScaleManual(v); });
    var scaleRange = scaleCtl.querySelector('input');
    var scaleOut = scaleCtl.querySelector('output');
    var scaleAutoBtn = el('button', 'tgl' + (scaleAuto ? ' on' : ''), '자동');
    scaleAutoBtn.type = 'button';
    scaleAutoBtn.title = '화면 폭에 맞춰 UI 크기 자동 조절';
    scaleCtl.appendChild(scaleAutoBtn);
    function applyAutoScale() {
      var v = autoScalePct();
      root.style.setProperty('--ui-scale', v / 100);
      scaleRange.value = v;
      scaleOut.textContent = v + '%';
    }
    setScaleManual = function (v) {
      scaleAuto = 0; store.set('scaleAuto', 0); store.set('scale', v);
      scaleAutoBtn.classList.remove('on');
      root.style.setProperty('--ui-scale', v / 100);
    };
    scaleAutoBtn.addEventListener('click', function () {
      scaleAuto = scaleAuto ? 0 : 1;
      store.set('scaleAuto', scaleAuto);
      scaleAutoBtn.classList.toggle('on', !!scaleAuto);
      if (scaleAuto) applyAutoScale();
    });
    function onScaleResize() { if (scaleAuto) applyAutoScale(); }
    window.addEventListener('resize', onScaleResize);
    document.addEventListener('fullscreenchange', onScaleResize);
    if (scaleAuto) applyAutoScale();
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

    /* 게임 화면 영역 보정 진입 (워치파티용) — 실제 UI는 아래 calBox */
    var calCtl = el('div', 'ctl');
    calCtl.appendChild(el('label', null, '게임 화면'));
    var calBtn = el('button', 'dndbtn', '영역 맞추기 — 워치파티처럼 화면 속 중계가 작을 때 (존·시계 인식 기준)');
    calBtn.type = 'button';
    calBtn.addEventListener('click', function () {
      root.classList.remove('settings');
      calShow();
    });
    calCtl.appendChild(calBtn);
    drawer.appendChild(calCtl);

    var colCtl = el('div', 'ctl');
    colCtl.appendChild(el('label', null, '선수 존'));
    var colBtn = el('button', 'dndbtn', '존 위치 맞추기 — 방해금지 클릭 자리가 챔피언 아이콘과 안 맞을 때');
    colBtn.type = 'button';
    colBtn.addEventListener('click', function () {
      root.classList.remove('settings');
      colShow();
    });
    colCtl.appendChild(colBtn);
    drawer.appendChild(colCtl);
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
    var pl = el('span', state.live !== false ? 'live' : 'live replay');
    if (state.live !== false) pl.appendChild(el('i'));
    pl.appendChild(el('span', null, state.live !== false ? 'LIVE' : '다시보기'));
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
    /* 기본 좌표는 실제 LCK 방송 HUD 실측값 (2026-08-04, 16:9 기준) — 좌우 선수 바 5개.
       width는 영상 높이 대비 % (40 초과면 legacy px). 존은 행 간 빈틈 없이 이어붙여
       중계/옵저버 레이아웃의 세로 오차가 있어도 근처 클릭이 해당 순번 선수로 이어지게 한다 */
    /* height·width는 앵커(게임 화면) 높이 대비 % — 실측: HUD 바 ≈ 높이의 10.5%w × 7.4%h */
    var DND = state.dndLayout || { top: 8, step: 9.6, height: 7.4, width: 10.5 };
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
        if (a > area && r.width > 200) { area = a; best = vids[i]; }
      }
      if (!best) return null;
      /* 레터박스 보정: 요소 사각형이 아니라 실제 영상 콘텐츠(16:9 등) 영역 기준으로 앵커 —
         위아래 검은 띠가 끼면 존·보정 박스가 밀리고 커지는 문제 방지 */
      var er = best.getBoundingClientRect();
      var iw = best.videoWidth, ih = best.videoHeight;
      if (!iw || !ih || !er.width || !er.height) return er;
      var sc = Math.min(er.width / iw, er.height / ih);
      var cw = iw * sc, chh = ih * sc;
      return { left: er.left + (er.width - cw) / 2, top: er.top + (er.height - chh) / 2,
               width: cw, height: chh, right: er.left + (er.width - cw) / 2 + cw };
    }
    /* 게임 화면 영역 (워치파티: 영상 속 축소 중계) — 영상 크기 대비 비율로 저장돼
       창 크기·전체화면이 바뀌어도 비례로 따라간다 */
    function getGameRect() {
      try {
        var g = JSON.parse(localStorage.getItem('lckov.gamerect') || 'null');
        if (g && g.w > 0.15 && g.h > 0.15) return g;
      } catch (e) {}
      return null;
    }
    function anchorRect() {
      var r = largestVideoRect();
      var b = r ? { left: r.left, top: r.top, width: r.width, height: r.height }
                : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      var g = getGameRect();
      if (g) {
        b = { left: b.left + b.width * g.x, top: b.top + b.height * g.y,
              width: b.width * g.w, height: b.height * g.h };
      }
      return b;
    }
    /* 사용자가 맞춘 선수 아이콘 열 위치 (게임 화면 영역 대비 비율) — 좌우 대칭 적용 */
    function getHudCol() {
      try {
        var c = JSON.parse(localStorage.getItem('lckov.hudcol') || 'null');
        if (c && c.b > c.t && c.w > 0.02) return c;
      } catch (e) {}
      return null;
    }
    function positionZones() {
      var b = anchorRect();
      var hc = getHudCol();
      var leftX, rightX, zw, tops = [], zh;
      if (hc) {
        var step = b.height * (hc.b - hc.t) / 5;
        zh = step;
        zw = b.width * hc.w;
        var inset = b.width * (hc.x || 0);
        leftX = b.left + inset;
        rightX = Math.max(0, window.innerWidth - (b.left + b.width) + inset);
        for (var i = 0; i < 5; i++) tops.push(b.top + b.height * hc.t + i * step);
      } else {
        zh = b.height * DND.height / 100;
        zw = DND.width > 40 ? DND.width : b.height * DND.width / 100;
        leftX = b.left;
        rightX = Math.max(0, window.innerWidth - (b.left + b.width));
        for (var j = 0; j < 5; j++) tops.push(b.top + b.height * (DND.top + j * DND.step) / 100);
      }
      zoneList.forEach(function (z, idx) {
        z.style.top = tops[idx % 5] + 'px';
        z.style.height = zh + 'px';
        z.style.width = zw + 'px';
        if (z.classList.contains('zleft')) { z.style.left = leftX + 'px'; z.style.right = 'auto'; }
        else { z.style.right = rightX + 'px'; z.style.left = 'auto'; }
      });
      /* 팝업도 게임 화면 크기에 비례해 축소 (앵커 높이 1000px 기준 1.0, 최소 0.5) */
      var k = Math.max(0.5, Math.min(1, b.height / 1000));
      root.style.setProperty('--dnd-scale', Math.round(k * 100) / 100);
    }
    var zoneTimer = setInterval(function () {
      if (root.classList.contains('dnd')) positionZones();
    }, 1000);
    window.addEventListener('resize', positionZones);
    document.addEventListener('fullscreenchange', positionZones);
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
          /* 화면 밖으로 나가지 않게 보정 (전체화면·작은 창) */
          var pr = dndPop.getBoundingClientRect();
          if (pr.bottom > window.innerHeight - 8) dndPop.style.top = Math.max(8, window.innerHeight - pr.height - 8) + 'px';
          if (pr.right > window.innerWidth - 8) { dndPop.style.left = 'auto'; dndPop.style.right = '8px'; }
          if (pr.left < 8) { dndPop.style.right = 'auto'; dndPop.style.left = '8px'; }
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

    /* ── 게임 화면 영역 보정 박스: 드래그로 이동, 우하단 핸들로 크기 조절 ── */
    var calBox = el('div', 'calbox');
    calBox.style.display = 'none';
    var calBar = el('div', 'calbar');
    var calDone = el('button', 'minibtn', '완료');
    var calReset = el('button', 'minibtn', '전체 화면(초기화)');
    var calCancel = el('button', 'minibtn', '취소');
    [calDone, calReset, calCancel].forEach(function (b) { b.type = 'button'; calBar.appendChild(b); });
    calBox.appendChild(calBar);
    calBox.appendChild(el('div', 'calhint', '중계(게임) 화면 테두리에 맞게 끌어서 조절하세요 — 존·시계 인식이 이 영역 기준이 됩니다'));
    var calHandle = el('div', 'calhandle');
    calBox.appendChild(calHandle);
    root.appendChild(calBox);
    function calShow() {
      var r = largestVideoRect() || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      var g = getGameRect() || { x: 0.01, y: 0.01, w: 0.72, h: 0.72 };
      calBox.style.left = (r.left + r.width * g.x) + 'px';
      calBox.style.top = (r.top + r.height * g.y) + 'px';
      calBox.style.width = (r.width * g.w) + 'px';
      calBox.style.height = (r.height * g.h) + 'px';
      calBox.style.display = 'block';
    }
    function wireDrag(box, handle) {
      var mode = null, sx = 0, sy = 0, box0 = null;
      box.addEventListener('mousedown', function (e) {
        if (e.target.tagName === 'BUTTON') return;
        mode = e.target === handle ? 'resize' : 'move';
        sx = e.clientX; sy = e.clientY;
        var cr = box.getBoundingClientRect();
        box0 = { left: cr.left, top: cr.top, width: cr.width, height: cr.height };
        e.preventDefault();
      });
      window.addEventListener('mousemove', function (e) {
        if (!mode) return;
        var dx = e.clientX - sx, dy = e.clientY - sy;
        if (mode === 'move') {
          box.style.left = (box0.left + dx) + 'px';
          box.style.top = (box0.top + dy) + 'px';
        } else {
          box.style.width = Math.max(40, box0.width + dx) + 'px';
          box.style.height = Math.max(60, box0.height + dy) + 'px';
        }
      });
      window.addEventListener('mouseup', function () { mode = null; });
    }
    wireDrag(calBox, calHandle);
    calDone.addEventListener('click', function () {
      var r = largestVideoRect() || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      var cr = calBox.getBoundingClientRect();
      var clamp01 = function (v) { return Math.max(0, Math.min(1, v)); };
      var g = {
        x: clamp01((cr.left - r.left) / r.width),
        y: clamp01((cr.top - r.top) / r.height),
        w: clamp01(cr.width / r.width),
        h: clamp01(cr.height / r.height),
      };
      try { localStorage.setItem('lckov.gamerect', JSON.stringify(g)); } catch (e) {}
      calBox.style.display = 'none';
      positionZones();
      notify({ text: '게임 화면 영역 저장 — 창 크기가 바뀌어도 비율로 따라갑니다' });
      if (opts.source && opts.source.onGameRect) opts.source.onGameRect(g);
    });
    calReset.addEventListener('click', function () {
      try { localStorage.removeItem('lckov.gamerect'); } catch (e) {}
      calBox.style.display = 'none';
      positionZones();
      notify({ text: '게임 화면 영역 초기화 (영상 전체 기준)' });
      if (opts.source && opts.source.onGameRect) opts.source.onGameRect(null);
    });
    calCancel.addEventListener('click', function () { calBox.style.display = 'none'; });

    /* ── 선수 존 위치 보정: 왼쪽 선수 아이콘 5줄 열을 덮게 맞추면 오른쪽은 자동 대칭 ── */
    var colBox = el('div', 'calbox');
    colBox.style.display = 'none';
    var colBar = el('div', 'calbar');
    var colDone = el('button', 'minibtn', '완료');
    var colReset = el('button', 'minibtn', '초기화');
    var colCancel = el('button', 'minibtn', '취소');
    [colDone, colReset, colCancel].forEach(function (b) { b.type = 'button'; colBar.appendChild(b); });
    colBox.appendChild(colBar);
    colBox.appendChild(el('div', 'calhint', '왼쪽 선수 아이콘 5줄 전체를 덮게 맞추세요 — 오른쪽은 자동 대칭'));
    var colHandle = el('div', 'calhandle');
    colBox.appendChild(colHandle);
    root.appendChild(colBox);
    wireDrag(colBox, colHandle);
    function colShow() {
      var a = anchorRect();
      var hc = getHudCol() || { x: 0, t: 0.08, b: 0.56, w: 0.13 };
      colBox.style.left = (a.left + a.width * (hc.x || 0)) + 'px';
      colBox.style.top = (a.top + a.height * hc.t) + 'px';
      colBox.style.width = (a.width * hc.w) + 'px';
      colBox.style.height = (a.height * (hc.b - hc.t)) + 'px';
      colBox.style.display = 'block';
    }
    colDone.addEventListener('click', function () {
      var a = anchorRect();
      var cr = colBox.getBoundingClientRect();
      var hc = {
        x: Math.max(0, (cr.left - a.left) / a.width),
        t: (cr.top - a.top) / a.height,
        b: (cr.top + cr.height - a.top) / a.height,
        w: Math.max(0.03, cr.width / a.width),
      };
      if (hc.b <= hc.t + 0.05) { notify({ text: '영역이 너무 작습니다 — 5줄 전체를 덮게 키워주세요' }); return; }
      try { localStorage.setItem('lckov.hudcol', JSON.stringify(hc)); } catch (e) {}
      colBox.style.display = 'none';
      positionZones();
      notify({ text: '선수 존 저장 — 화면 크기가 바뀌어도 비율로 따라갑니다' });
    });
    colReset.addEventListener('click', function () {
      try { localStorage.removeItem('lckov.hudcol'); } catch (e) {}
      colBox.style.display = 'none';
      positionZones();
      notify({ text: '선수 존 초기화 (표준 레이아웃 기준)' });
    });
    colCancel.addEventListener('click', function () { colBox.style.display = 'none'; });

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
      isCalibrating: function () { return calBox.style.display !== 'none' || colBox.style.display !== 'none'; }, // 보정 중 재마운트 방지용
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
        document.removeEventListener('fullscreenchange', positionZones);
        window.removeEventListener('resize', onScaleResize);
        document.removeEventListener('fullscreenchange', onScaleResize);
        shadow.textContent = '';
      }
    };
  }

  window.LCKOverlay = { mount: mount };
})();

/**
 * 게임 시계 OCR — 방송 화면 속 mm:ss 시계를 외부 라이브러리 없이 읽는다.
 *
 * 리워치 파티(과거 경기 재송출)에서는 스트리머가 영상을 멈추고 돌릴 때마다
 * 싱크가 깨지므로, 화면의 게임 시계를 직접 계속 읽는 것이 유일한 완전 자동화다.
 *
 * 동작 원리 (폰트·위치·크기 사전 지식 없음):
 *  A. 탐색   — 초 단위 숫자는 정확히 1Hz로 변한다. 저해상도로 프레임 차분을 누적해
 *              1Hz 주기성 픽셀 클러스터를 찾으면 그것이 시계의 초 자리다.
 *  B. 절단   — 그 행의 잉크 기둥 프로파일로 글자 칸(분:초 각 자리)을 분할한다.
 *  C. 자가학습 — 초 자리는 0..9를 순서대로 순환한다. ~25초 관찰로 글리프 10개를
 *              순서대로 수집하고, 십초 자리가 함께 변한 순간(9→0)으로 라벨을 고정한다.
 *  D. 읽기   — 이후 1초마다 각 칸을 학습된 글리프와 대조해 mm:ss를 출력한다.
 *
 * 사용: var h = LCKClockOCR.start(videoEl, function (ev) { ... });
 *   ev: { state: 'locating'|'calibrating'|'reading'|'lost', time?: 초, conf?: 0~1 }
 *   h.stop()
 */
(function () {
  "use strict";

  var SCAN_W = 1120;       // 탐색 단계 폭 — 실방송의 작은 시계 글자(수 px) 보존
  var GLYPH_W = 10, GLYPH_H = 14; // 정규화 글리프 크기 (자가학습 경로)
  var TG_W = 14, TG_H = 20;       // 타이트 정규화 글리프 (내장 템플릿 경로 — 0/6/8 구분에 해상도 필요)
  var DIFF_T = 18;         // 픽셀 변화 판정 임계 (0-255 luma)

  function lumaFrame(ctx, src, w, h, R) {
    if (R) ctx.drawImage(src, R.x, R.y, R.w, R.h, 0, 0, w, h);
    else ctx.drawImage(src, 0, 0, w, h);
    var d = ctx.getImageData(0, 0, w, h).data;
    var out = new Uint8Array(w * h);
    for (var i = 0, j = 0; j < out.length; i += 4, j++) {
      out[j] = (d[i] * 3 + d[i + 1] * 4 + d[i + 2]) >> 3;
    }
    return out;
  }

  /* 연결 요소 라벨링 (4방향) — 마스크에서 후보 상자 추출 */
  function components(mask, w, h) {
    var seen = new Uint8Array(mask.length);
    var boxes = [];
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = y * w + x;
        if (!mask[idx] || seen[idx]) continue;
        var q = [idx], minX = x, maxX = x, minY = y, maxY = y, n = 0;
        seen[idx] = 1;
        while (q.length) {
          var c = q.pop();
          n++;
          var cx = c % w, cy = (c - cx) / w;
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
          var nb = [c - 1, c + 1, c - w, c + w];
          for (var k = 0; k < 4; k++) {
            var m = nb[k];
            if (m < 0 || m >= mask.length || seen[m] || !mask[m]) continue;
            if (k < 2 && ((m % w === 0 && cx === w - 1) || (cx === 0 && m % w === w - 1))) continue;
            seen[m] = 1;
            q.push(m);
          }
        }
        boxes.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, n: n });
      }
    }
    return boxes;
  }

  /* 칸 비트맵 → 정규화 글리프 (이진 배열) */
  function glyphOf(ctx, video, box) {
    var c = glyphOf._c || (glyphOf._c = document.createElement("canvas"));
    c.width = GLYPH_W; c.height = GLYPH_H;
    var g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(video, box.x, box.y, box.w, box.h, 0, 0, GLYPH_W, GLYPH_H);
    var d = g.getImageData(0, 0, GLYPH_W, GLYPH_H).data;
    var lum = [], min = 255, max = 0;
    for (var i = 0; i < d.length; i += 4) {
      var v = (d[i] * 3 + d[i + 1] * 4 + d[i + 2]) >> 3;
      lum.push(v);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    var t = (min + max) / 2;
    var bits = new Uint8Array(lum.length);
    var ink = 0;
    for (var j = 0; j < lum.length; j++) {
      bits[j] = lum[j] > t ? 1 : 0; // 밝은 글자 가정
      ink += bits[j];
    }
    return { bits: bits, ink: ink / bits.length, contrast: max - min };
  }

  function similarity(a, b) {
    var same = 0;
    for (var i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
    return same / a.length;
  }
  /* 템플릿이 단일(자가학습) 또는 변형 배열(내장 시드)일 때 최고 유사도 */
  function simOf(bits, t) {
    if (t instanceof Uint8Array) return similarity(bits, t);
    var best = 0;
    for (var i = 0; i < t.length; i++) {
      var s = similarity(bits, t[i]);
      if (s > best) best = s;
    }
    return best;
  }

  /* ── 내장 숫자 템플릿: 볼드 산세리프 0~9를 캔버스로 렌더해 10×14 실루엣로 ──
     이 해상도에서는 폰트가 달라도 숫자 실루엣이 거의 같아 방송 폰트를 몰라도 읽힌다.
     자가학습(~40초)을 생략하는 즉시 읽기 경로의 시드 */
  var seedCache = null;
  function seedTemplates() {
    if (seedCache) return seedCache;
    var fonts = ['700 24px Arial', '800 24px "Segoe UI", sans-serif', '700 24px "Malgun Gothic", sans-serif'];
    var c = document.createElement('canvas');
    var g = c.getContext('2d', { willReadFrequently: true });
    var tmpl = {};
    for (var d0 = 0; d0 <= 9; d0++) tmpl[d0] = [];
    fonts.forEach(function (f) {
      for (var d = 0; d <= 9; d++) {
        c.width = 32; c.height = 32;
        g.fillStyle = '#000'; g.fillRect(0, 0, 32, 32);
        g.fillStyle = '#fff'; g.font = f;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(d), 16, 17);
        var img = g.getImageData(0, 0, 32, 32).data;
        var minX = 32, maxX = -1, minY = 32, maxY = -1;
        for (var y = 0; y < 32; y++) {
          for (var x = 0; x < 32; x++) {
            if (img[(y * 32 + x) * 4] > 128) {
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < minX) continue;
        var c2 = document.createElement('canvas');
        c2.width = TG_W; c2.height = TG_H;
        var g2 = c2.getContext('2d', { willReadFrequently: true });
        g2.drawImage(c, minX, minY, maxX - minX + 1, maxY - minY + 1, 0, 0, TG_W, TG_H);
        var d2 = g2.getImageData(0, 0, TG_W, TG_H).data;
        var bits = new Uint8Array(TG_W * TG_H);
        for (var i = 0, j = 0; i < d2.length; i += 4, j++) bits[j] = d2[i] > 128 ? 1 : 0;
        tmpl[d].push(bits);
      }
    });
    tmpl.__tight = true; // 이 템플릿은 잉크 경계 정규화(tightGlyph) 샘플과 비교해야 함
    seedCache = tmpl;
    return tmpl;
  }

  /* 잉크 경계로 타이트하게 잘라 정규화한 글리프 — 내장 템플릿(여백 없음)과 비교용.
     셀 여백이 넉넉해도 숫자만 뽑아 10×14로 맞춘다 */
  function tightGlyph(video, box) {
    var W = 28, H = 40;
    var c = tightGlyph._c || (tightGlyph._c = document.createElement("canvas"));
    c.width = W; c.height = H;
    var g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(video, box.x, box.y, box.w, box.h, 0, 0, W, H);
    var d = g.getImageData(0, 0, W, H).data;
    var lum = new Uint8Array(W * H);
    var min = 255, max = 0;
    for (var i = 0, j = 0; i < d.length; i += 4, j++) {
      lum[j] = (d[i] * 3 + d[i + 1] * 4 + d[i + 2]) >> 3;
      if (lum[j] < min) min = lum[j];
      if (lum[j] > max) max = lum[j];
    }
    if (max - min < 50) return null; // 대비 부족(빈 칸)
    var t = (min + max) / 2;
    var minX = W, maxX = -1, minY = H, maxY = -1, ink = 0;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (lum[y * W + x] > t) {
          ink++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || ink < 8) return null;
    var c2 = tightGlyph._c2 || (tightGlyph._c2 = document.createElement("canvas"));
    c2.width = TG_W; c2.height = TG_H;
    var g2 = c2.getContext("2d", { willReadFrequently: true });
    g2.drawImage(c, minX, minY, maxX - minX + 1, maxY - minY + 1, 0, 0, TG_W, TG_H);
    var d2 = g2.getImageData(0, 0, TG_W, TG_H).data;
    var bits = new Uint8Array(TG_W * TG_H);
    var bink = 0;
    for (var i2 = 0, j2 = 0; i2 < d2.length; i2 += 4, j2++) {
      var v = (d2[i2] * 3 + d2[i2 + 1] * 4 + d2[i2 + 2]) >> 3;
      bits[j2] = v > t ? 1 : 0;
      bink += bits[j2];
    }
    return { bits: bits, ink: bink / bits.length, contrast: max - min };
  }

  function classify(bits, tmpl, allow) {
    var best = -1, bestS = 0, second = 0;
    for (var d = 0; d <= 9; d++) {
      if (allow && allow.indexOf(d) < 0) continue;
      var s = simOf(bits, tmpl[d]);
      if (s > bestS) { second = bestS; bestS = s; best = d; }
      else if (s > second) second = s;
    }
    return { digit: best, conf: bestS, margin: bestS - second };
  }

  /* 한 프레임 판독 (신뢰도 미달이면 null). tmpl 생략 시 내장 템플릿 — 합성 검증에서도 사용 */
  function readClock(video, cells, tmpl) {
    tmpl = tmpl || seedTemplates();
    var grab = tmpl.__tight
      ? function (box) { return tightGlyph(video, box); }
      : function (box) { return glyphOf(null, video, box); };
    var gU = grab(cells.secU);
    var gT = grab(cells.secT);
    if (!gU || !gT || gU.contrast < 50) return null;
    var u = classify(gU.bits, tmpl);
    var t = classify(gT.bits, tmpl, [0, 1, 2, 3, 4, 5]);
    var mins = 0, mConf = 1;
    for (var i = 0; i < cells.minutes.length; i++) {
      var gm = grab(cells.minutes[i]);
      if (!gm || gm.ink < 0.04) continue; // 빈 칸(한 자리 분)
      var m = classify(gm.bits, tmpl);
      mins = mins * 10 + m.digit;
      mConf = Math.min(mConf, m.conf);
    }
    var conf = Math.min(u.conf, t.conf, mConf);
    if (conf < 0.75) return null;
    return mins * 60 + t.digit * 10 + u.digit;
  }

  function start(video, cb, getRegion) {
    var stopped = false;
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    var state = { phase: "locating" };

    function vw() { return video.videoWidth || video.width || 0; }
    function vh() { return video.videoHeight || video.height || 0; }
    /* 탐색 영역: 게임 화면 보정값(비율)이 있으면 그 부분만 — 워치파티의 작은 시계도
       확대 스캔되어 인식률이 오른다 */
    function region() {
      var W = vw(), H = vh();
      var g = getRegion && getRegion();
      if (g && W && H) return { x: g.x * W, y: g.y * H, w: g.w * W, h: g.h * H };
      return { x: 0, y: 0, w: W, h: H };
    }

    /* ── A. 탐색: 6초간 4Hz 샘플링으로 1Hz 변화 픽셀 찾기 ── */
    function locate(done) {
      var w = SCAN_W, h = 0, prev = null, count = null, ticks = 0;
      var timer = setInterval(function () {
        if (stopped) return clearInterval(timer);
        if (!vw()) return;
        var R = region();
        h = Math.round(R.h * w / R.w);
        canvas.width = w; canvas.height = h;
        var cur;
        try {
          cur = lumaFrame(ctx, video, w, h, R);
        } catch (e) {
          /* 교차 출처 영상(taint) 등으로 픽셀 읽기 차단 — OCR 불가, 조용히 종료 */
          clearInterval(timer);
          stopped = true;
          cb({ state: "blocked", error: e.name });
          return;
        }
        if (prev) {
          if (!count) count = new Uint16Array(cur.length);
          for (var i = 0; i < cur.length; i++) {
            if (Math.abs(cur[i] - prev[i]) > DIFF_T) count[i]++;
          }
        }
        prev = cur;
        if (++ticks >= 24) { // 6초
          clearInterval(timer);
          var mask = new Uint8Array(count.length);
          for (var j = 0; j < count.length; j++) {
            mask[j] = (count[j] >= 3 && count[j] <= 15) ? 1 : 0; // ≈1Hz (압축 번짐으로 2배 카운트 허용)
          }
          /* 숫자 글자 크기 + 공간 사전 조건: e스포츠 스코어바 시계는 항상 상단 중앙.
             게임 화면 속 쿨다운·부활 타이머(똑같이 1Hz)를 배제하는 결정적 필터 */
          var boxes = components(mask, w, h).filter(function (b) {
            return b.w >= 2 && b.w <= 20 && b.h >= 4 && b.h <= 24 && b.n >= 4 && b.n <= 120 &&
                   b.y + b.h <= h * 0.24 && b.x >= w * 0.2 && b.x + b.w <= w * 0.8;
          });
          /* 전형적 숫자 획 픽셀 수(~25)에 가까운 순 — 크기순이면 노이즈가 시계를 밀어냄 */
          boxes.sort(function (a, b) { return Math.abs(a.n - 25) - Math.abs(b.n - 25); });
          done(boxes.slice(0, 16), w, h, region());
        }
      }, 250);
    }

    /* ── A2. 주기성 검증: 진짜 시계는 메트로놈(간격 ≈1초, 편차 작음) ── */
    function verifyPeriodicity(boxes, w, h, R, done) {
      if (!boxes.length) return done(null);
      var times = boxes.map(function () { return []; });
      var prevFrame = null, ticks = 0;
      var timer = setInterval(function () {
        if (stopped) return clearInterval(timer);
        canvas.width = w; canvas.height = h;
        var cur = lumaFrame(ctx, video, w, h, R);
        var now = ticks * 0.125;
        if (prevFrame) {
          for (var i = 0; i < boxes.length; i++) {
            var b = boxes[i], diff = 0, n = 0;
            for (var y = b.y; y < b.y + b.h; y++) {
              for (var x = b.x; x < b.x + b.w; x++) {
                var idx = y * w + x;
                diff += Math.abs(cur[idx] - prevFrame[idx]);
                n++;
              }
            }
            /* 픽셀별 절대차 평균 — 잉크량이 비슷한 숫자 전환(7→1 등)도 획 위치가 다르면 잡힘.
               0.45초 내 재감지는 같은 전환의 압축 번짐으로 보고 병합 */
            if (diff / n > 6) {
              var last = times[i][times[i].length - 1];
              if (last == null || now - last > 0.45) times[i].push(now);
            }
          }
        }
        prevFrame = cur;
        if (++ticks >= 64) { // 8초
          clearInterval(timer);
          cb({ state: "vdebug", data: boxes.map(function (b, i) { return { b: b, ts: times[i] }; }) });
          var best = null, bestScore = 0;
          for (var j = 0; j < boxes.length; j++) {
            var ts = times[j];
            if (ts.length < 5 || ts.length > 11) continue;
            var iv = [], mean = 0;
            for (var k = 1; k < ts.length; k++) iv.push(ts[k] - ts[k - 1]);
            iv.forEach(function (v) { mean += v; });
            mean /= iv.length;
            if (mean < 0.8 || mean > 1.35) continue;
            var varsum = 0;
            iv.forEach(function (v) { varsum += (v - mean) * (v - mean); });
            var cv = Math.sqrt(varsum / iv.length) / mean;
            if (cv > 0.35) continue;
            var score = ts.length * (1 - cv);
            if (score > bestScore) { bestScore = score; best = boxes[j]; }
          }
          done(best);
        }
      }, 125);
    }

    /* ── B. 절단: 후보 초-자리 상자 주변 행에서 글자 칸 분할 (좌표는 영상 절대 px) ── */
    function segmentCells(candidate, scanW, scanH, R) {
      var sx = R.w / scanW, sy = R.h / scanH;
      var cy = R.y + (candidate.y + candidate.h / 2) * sy;
      var ch = Math.max(10, candidate.h * sy * 1.5);
      var y0 = Math.max(R.y, Math.round(cy - ch / 2));
      /* 초 자리 오른쪽 여유 + 왼쪽으로 분까지: 후보 폭의 ~9배 스캔 */
      var cw = candidate.w * sx;
      var x1 = Math.min(R.x + R.w, Math.round(R.x + (candidate.x + candidate.w) * sx + cw * 1.5));
      var x0 = Math.max(R.x, Math.round(R.x + candidate.x * sx - cw * 8));
      var w = x1 - x0, h = Math.round(ch);
      if (w < 10 || h < 8) return null;
      canvas.width = w; canvas.height = h;
      ctx.drawImage(video, x0, y0, w, h, 0, 0, w, h);
      var d = ctx.getImageData(0, 0, w, h).data;
      var min = 255, max = 0, lum = new Uint8Array(w * h);
      for (var i = 0, j = 0; i < d.length; i += 4, j++) {
        lum[j] = (d[i] * 3 + d[i + 1] * 4 + d[i + 2]) >> 3;
        if (lum[j] < min) min = lum[j];
        if (lum[j] > max) max = lum[j];
      }
      if (max - min < 60) return null; // 대비 부족
      var t = (min + max) / 2;
      var col = new Float32Array(w);
      for (var x = 0; x < w; x++) {
        var ink = 0;
        for (var y = 0; y < h; y++) if (lum[y * w + x] > t) ink++;
        col[x] = ink / h;
      }
      /* 잉크 기둥 → 칸 경계 (gap 기준 분할) */
      var rawCells = [], run = null;
      for (var x2 = 0; x2 < w; x2++) {
        if (col[x2] > 0.15) {
          if (!run) run = { a: x2 };
          run.b = x2;
        } else if (run && x2 - run.b > 1) {
          rawCells.push(run); run = null;
        }
      }
      if (run) rawCells.push(run);
      rawCells = rawCells.filter(function (c) { return c.b - c.a >= 1; });
      /* 작은 글자는 숫자끼리 붙어 한 덩어리가 됨 → 기준 글자 폭(cw)으로 등분 */
      var cells = [];
      rawCells.forEach(function (c) {
        var rw = c.b - c.a + 1;
        var k = Math.max(1, Math.round(rw / (cw * 1.15)));
        if (k === 1) { cells.push(c); return; }
        for (var i = 0; i < k; i++) {
          cells.push({ a: Math.round(c.a + rw * i / k), b: Math.round(c.a + rw * (i + 1) / k) - 1 });
        }
      });
      if (cells.length < 3) return null;
      /* 오른쪽에서: [초일][초십][콜론][분일]([분십]) — 콜론은 폭이 좁다 */
      var abs = cells.map(function (c) {
        return { x: x0 + c.a - 1, y: y0, w: c.b - c.a + 3, h: h };
      }).reverse(); // 오른쪽부터
      var secU = abs[0], secT = abs[1], rest = abs.slice(2);
      /* 콜론 제거: 폭이 초일의 60% 미만인 칸 */
      var minutes = rest.filter(function (c) { return c.w >= secU.w * 0.6; });
      if (!secU || !secT || !minutes.length) return null;
      return { secU: secU, secT: secT, minutes: minutes.slice(0, 2).reverse() };
    }

    /* ── C. 자가학습: 초 일의 자리 0..9 순환 수집, 십의 자리 변화 = 9→0 ── */
    function calibrate(cells, done) {
      var glyphs = [];   // { bits, tensChanged }
      var lastU = null, lastT = null, settle = 0;
      var timer = setInterval(function () {
        if (stopped) return clearInterval(timer);
        var gU = glyphOf(ctx, video, cells.secU);
        var gT = glyphOf(ctx, video, cells.secT);
        if (gU.contrast < 50) return;
        if (lastU && similarity(gU.bits, lastU.bits) > 0.93) { lastT = gT; settle = 0; return; } // 변화 없음
        /* 압축 번짐 대비: 전환 감지 후 한 샘플 더 기다려 안정된 글리프를 수집 */
        if (settle < 1) { settle++; return; }
        settle = 0;
        var tensChanged = lastT ? similarity(gT.bits, lastT.bits) < 0.9 : false;
        glyphs.push({ bits: gU.bits, tensChanged: tensChanged });
        lastU = gU; lastT = gT;
        if (glyphs.length >= 12) {
          clearInterval(timer);
          /* 9→0 전환(=십의 자리 동시 변화) 지점 찾기 */
          var zeroIdx = -1;
          for (var i = 1; i < glyphs.length; i++) {
            if (glyphs[i].tensChanged) { zeroIdx = i; break; }
          }
          if (zeroIdx < 0) return done(null);
          var tmpl = {};
          for (var k = 0; k < 10; k++) {
            var g = glyphs[zeroIdx + k];
            if (!g) { // 순환 이전 구간에서 보충
              g = glyphs[zeroIdx + k - 10];
            }
            if (!g) return done(null);
            tmpl[k] = g.bits;
          }
          done(tmpl);
        }
      }, 200);
    }

    /* 내장 템플릿 즉시 읽기: 6초간 관찰해 값이 1초/초로 흐르면 채택 (자가학습 생략) */
    function trySeeded(cells, done) {
      var tmpl = null;
      try { tmpl = seedTemplates(); } catch (e) {}
      if (!tmpl) return done(false);
      var reads = [], ticks = 0;
      var timer = setInterval(function () {
        if (stopped) return clearInterval(timer);
        var t = readClock(video, cells, tmpl);
        if (t != null) reads.push({ t: t, at: ticks });
        if (++ticks >= 6) {
          clearInterval(timer);
          var good = 0;
          for (var i = 1; i < reads.length; i++) {
            if (Math.abs((reads[i].t - reads[i - 1].t) - (reads[i].at - reads[i - 1].at)) <= 1) good++;
          }
          if (reads.length >= 4 && good >= reads.length - 2) {
            cb({ state: "seeded" });
            readLoop(cells, tmpl);
            done(true);
          } else {
            done(false);
          }
        }
      }, 1000);
    }

    /* ── D. 읽기 ── */
    function readLoop(cells, tmpl) {
      var misses = 0;
      var grab = tmpl.__tight
        ? function (box) { return tightGlyph(video, box); }
        : function (box) { return glyphOf(ctx, video, box); };
      var timer = setInterval(function () {
        if (stopped) return clearInterval(timer);
        var gU = grab(cells.secU);
        var gT = grab(cells.secT);
        if (!gU || !gT || gU.contrast < 50) {
          if (++misses > 15) { clearInterval(timer); restart(); }
          else cb({ state: "lost" });
          return;
        }
        var u = classify(gU.bits, tmpl);
        var t = classify(gT.bits, tmpl, [0, 1, 2, 3, 4, 5]);
        var mins = 0, mConf = 1;
        for (var i = 0; i < cells.minutes.length; i++) {
          var gm = grab(cells.minutes[i]);
          if (!gm || gm.ink < 0.04) continue; // 빈 칸 (한 자리 분)
          var m = classify(gm.bits, tmpl);
          mins = mins * 10 + m.digit;
          mConf = Math.min(mConf, m.conf);
        }
        var conf = Math.min(u.conf, t.conf, mConf);
        if (conf < (tmpl.__tight ? 0.75 : 0.78)) {
          if (++misses > 15) { clearInterval(timer); restart(); }
          else cb({ state: "lost" });
          return;
        }
        misses = 0;
        cb({ state: "reading", time: mins * 60 + t.digit * 10 + u.digit, conf: conf });
      }, 1000);
    }

    function restart() {
      if (!stopped) run();
    }

    function run() {
      cb({ state: "locating" });
      locate(function (candidates, w, h, R) {
        if (stopped) return;
        if (!candidates.length) return setTimeout(restart, 2000);
        cb({ state: "cand", boxes: candidates, scanW: w, scanH: h }); // 디버그
        verifyPeriodicity(candidates, w, h, R, function (best) {
          if (stopped) return;
          if (!best) return setTimeout(restart, 2000);
          proceed(best, w, h, R);
        });
      });
    }

    function proceed(candidate, w, h, R) {
        var cells = segmentCells(candidate, w, h, R);
        if (!cells) return setTimeout(restart, 5000);
        cb({ state: "cells", cells: cells }); // 디버그: 선택된 칸 좌표
        /* 1단계: 내장 템플릿 즉시 읽기 → 실패 시 2단계: 자가학습 */
        trySeeded(cells, function (ok) {
          if (stopped || ok) return;
          cb({ state: "calibrating" });
          calibrate(cells, function (tmpl) {
            if (stopped) return;
            if (!tmpl) return setTimeout(restart, 3000);
            readLoop(cells, tmpl);
          });
        });
    }

    run();
    return { stop: function () { stopped = true; } };
  }

  /* ── 스코어보드 중앙의 세트 스코어 읽기 (리그 로고 좌우의 흰 숫자 0/1/2) ──
     위치는 중계 화면 대비 비율(가로 42~58%, 세로 0.5~6.5%)이라 창 크기와 무관.
     반환: { left, right } 또는 null (인식 실패) */
  function readSetScore(video, getRegion) {
    try {
      var W = video.videoWidth, H = video.videoHeight;
      if (!W || !H) return null;
      var g = getRegion && getRegion();
      var R = g ? { x: g.x * W, y: g.y * H, w: g.w * W, h: g.h * H } : { x: 0, y: 0, w: W, h: H };
      var sw = 360, sh = 32;
      var c = readSetScore._c || (readSetScore._c = document.createElement("canvas"));
      c.width = sw; c.height = sh;
      var ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(video, R.x + R.w * 0.42, R.y + R.h * 0.005, R.w * 0.16, R.h * 0.06, 0, 0, sw, sh);
      var d = ctx.getImageData(0, 0, sw, sh).data;
      var mask = new Uint8Array(sw * sh);
      for (var i = 0, j = 0; i < d.length; i += 4, j++) {
        var r0 = d[i], g0 = d[i + 1], b0 = d[i + 2];
        var mx = Math.max(r0, g0, b0), mn = Math.min(r0, g0, b0);
        mask[j] = (mn > 175 && mx - mn < 55) ? 1 : 0; // 흰색(고휘도·저채도)만
      }
      var boxes = components(mask, sw, sh).filter(function (b) {
        return b.h >= sh * 0.3 && b.h <= sh * 0.95 && b.w >= 3 && b.w <= sw * 0.12 && b.n >= 12;
      });
      /* 중앙 로고(±6%) 제외하고, 중앙에 가장 가까운 좌/우 블롭이 스코어 숫자 */
      var cx = sw / 2, L = null, Rb = null;
      boxes.forEach(function (b) {
        var bc = b.x + b.w / 2;
        if (bc < cx - sw * 0.06) { if (!L || bc > L.x + L.w / 2) L = b; }
        else if (bc > cx + sw * 0.06) { if (!Rb || bc < Rb.x + Rb.w / 2) Rb = b; }
      });
      if (!L || !Rb) return null;
      function digitOf(b) {
        if (b.w <= b.h * 0.45) return 1;                      // '1' — 가늘다
        var cxp = Math.round(b.x + b.w / 2), cyp = Math.round(b.y + b.h / 2);
        return mask[cyp * sw + cxp] ? 2 : 0;                  // '0' — 가운데 구멍
      }
      return { left: digitOf(L), right: digitOf(Rb) };
    } catch (e) { return null; }
  }

  window.LCKClockOCR = { start: start, readSetScore: readSetScore, _readClock: readClock };
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
  /* 팬 별칭 사전 — 방송 제목이 별명으로 팀을 부르는 경우 대응 (API 팀명은 영문뿐이라 필수).
     2026 로스터 실측 코드 기준. 원격 설정으로 이관 예정 */
  var TEAM_NICKS = {
    T1: ["티원", "슼"],
    GEN: ["젠지"],
    HLE: ["한화", "한화생명"],
    DK: ["디플", "디플러스", "디케이", "담원"],
    KT: ["케이티", "케티", "롤스터"],
    NS: ["농심", "레드포스"],
    KRX: ["키움", "디알엑스", "DRX"],
    BRO: ["브리온", "한진"],
    DNS: ["든", "디엔", "수퍼스", "프릭스"],
    BFX: ["피어엑스", "비엔케이", "샌박"],
  };

  /* 방송 제목에 두 팀이 모두 등장하는가 (워치파티 인식)
     — 영문 코드(HLE·KT)는 단어 경계 매칭, 한글 팀명·별칭은 공백 무시 부분 일치.
     한 글자 별명("든"·"슼")은 "모든" 같은 오탐을 막기 위해 앞뒤가 한글이 아닐 때만 인정. */
  function aliasInTitle(alias) {
    var a = String(alias || "").toUpperCase();
    var title = (document.title || "").toUpperCase();
    if (/[가-힣]/.test(a)) {
      var h = a.replace(/[^A-Z0-9가-힣]/g, "");
      if (!h) return false;
      if (h.length === 1) return new RegExp("(^|[^가-힣])" + h + "([^가-힣]|$)").test(title);
      return title.replace(/\s+/g, "").indexOf(h) >= 0;
    }
    var ascii = a.replace(/[^A-Z0-9]/g, "");
    if (!ascii || ascii === "TBD") return false;
    return new RegExp("(^|[^A-Z0-9])" + ascii + "([^A-Z0-9]|$)").test(title);
  }
  function teamInTitle(team) {
    var aliases = [team.code, team.name].concat(TEAM_NICKS[String(team.code || "").toUpperCase()] || []);
    var stripped = String(team.name || "").replace(/\s*(e스포츠|esports|e-sports|게이밍|gaming)\s*$/i, "");
    if (stripped && stripped !== team.name) aliases.push(stripped);
    return aliases.some(aliasInTitle);
  }
  function teamsInTitle(teams) {
    return (teams || []).length > 0 && teams.every(teamInTitle);
  }
  /* 제목이 LCK 방송임을 표시하는가 (#LckWatchParty 태그, "LCK" 언급) */
  function titleSaysLck() {
    return /LCK/i.test(document.title || "");
  }
  async function findLiveMatch() {
    var d = await api("getLive?hl=ko-KR");
    var evs = ((d.data.schedule || {}).events || []).filter(isTarget);
    if (!evs.length) return null;
    var pick = evs[0];
    if (evs.length > 1) {
      /* 동시 라이브(LCK+CL 등): 방송 제목에 팀이 있으면 그 경기 우선 (워치파티 대응) */
      var hit = evs.filter(function (e) { return teamsInTitle(e.match.teams); })[0];
      if (hit) pick = hit;
      log("동시 라이브 " + evs.length + "건 → " + (hit ? "방송 제목으로 선택" : "첫 경기 선택 (톱니에서 변경 가능)"));
    }
    return { matchId: pick.match.id,
             title: pick.match.teams.map(function (t) { return t.code || t.name; }).join(" vs "),
             teams: pick.match.teams,
             streams: pick.streams || [] };
  }

  /* SOOP 라이브 페이지면 채널 ID 추출 (play.sooplive.co.kr/<채널>/...) */
  function soopChannelId() {
    try {
      if (!/play\.(sooplive|afreecatv)/.test(location.hostname)) return null;
      var m = location.pathname.match(/^\/([A-Za-z0-9_.-]+)/);
      return m ? m[1].toLowerCase() : null;
    } catch (e) { return null; }
  }

  /* 지금 보는 방송이 이 라이브 경기의 시청 페이지인가 —
     공식 중계 채널(스트림 parameter = SOOP 채널 ID)이거나, 제목에 두 팀이 있는 워치파티,
     또는 제목이 LCK 방송임을 밝힌 경우(#LckWatchParty 등 — 라이브 중엔 그 경기를 보는 중일 확률이 높다) */
  function isWatchingLive(live) {
    var ch = soopChannelId();
    var streams = live.streams || [];
    for (var i = 0; i < streams.length; i++) {
      var s = streams[i];
      if ((s.provider === "afreecatv" || s.provider === "soop") &&
          ch && String(s.parameter || "").toLowerCase() === ch) return true;
    }
    return teamsInTitle(live.teams) || titleSaysLck();
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

  /* 종료 세트의 마지막 프레임 조회용 시각: 미래 startingTime은 API가 400으로 거부하므로
     "세트 시작 + 2시간"과 "현재 − 1분" 중 이른 쪽 (경기는 2시간을 넘지 않는다) */
  function endProbeTime(start) {
    return new Date(Math.min(Date.now() - 60000, start.getTime() + 2 * 3600000));
  }

  /* 게임 화면 보정값(오버레이에서 저장, 영상 대비 비율) — 존·시계 OCR 공용 */
  function gameRegion() {
    try {
      var g = JSON.parse(localStorage.getItem("lckov.gamerect") || "null");
      if (g && g.w > 0.15 && g.h > 0.15) return g;
    } catch (e) {}
    return null;
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
          out.push({ matchId: e.match.id, teams: e.match.teams, time: when.getTime(),
                     label: (when.getMonth() + 1) + "/" + when.getDate() + " · " + codes.join(" vs ") + (isCL ? " (CL)" : " (LCK)") });
        });
      } catch (err) {}
    }
    out.sort(function (a, b) { return b.time - a.time; });
    return out;
  }

  /* SOOP 공식 다시보기 페이지면 VOD 번호 추출 */
  function soopVodId() {
    try {
      if (!/(^|\.)vod\./.test(location.hostname) && !/vod\.(sooplive|afreecatv)/.test(location.hostname)) return null;
      var m = location.pathname.match(/\/player\/(\d+)/);
      return m ? m[1] : null;
    } catch (e) { return null; }
  }

  /* 한 매치의 games.vods에서 이 VOD 번호가 달린 세트를 찾는다 */
  async function vodInfoFromMatch(matchId, vodId) {
    try {
      var det = await api("getEventDetails?hl=ko-KR&id=" + matchId);
      var m = det.data.event.match;
      var games = m.games;
      for (var gi = 0; gi < games.length; gi++) {
        var vods = games[gi].vods || [];
        for (var vi = 0; vi < vods.length; vi++) {
          var v = vods[vi];
          if ((v.provider === "afreecatv" || v.provider === "soop") && String(v.parameter) === String(vodId) && v.firstFrameTime) {
            return {
              matchId: matchId,
              gameId: games[gi].id,
              setNumber: games[gi].number,
              firstFrameMs: new Date(v.firstFrameTime).getTime(),
              title: m.teams.map(function (t) { return t.code || t.name; }).join(" vs "),
            };
          }
        }
      }
    } catch (err) {}
    return null;
  }

  /* VOD 번호 ↔ 라이엇 vods 매핑: 공식 다시보기면 경기·세트·firstFrameTime까지 확보 (완전 자동 싱크) */
  async function findOfficialVod(vodId) {
    var cacheKey = "lckov.vodmap." + vodId;
    try {
      var cached = sessionStorage.getItem(cacheKey);
      if (cached) return cached === "none" ? null : JSON.parse(cached);
    } catch (e) {}
    var list = await listRecent();
    for (var i = 0; i < Math.min(list.length, 15); i++) {
      var info = await vodInfoFromMatch(list[i].matchId, vodId);
      if (info) {
        try { sessionStorage.setItem(cacheKey, JSON.stringify(info)); } catch (e) {}
        return info;
      }
    }
    try { sessionStorage.setItem(cacheKey, "none"); } catch (e) {}
    return null;
  }

  /* 공식 다시보기: firstFrameTime + 영상 재생 위치 = 절대 시각 — 입력 없이 시킹·밴픽까지 자동 */
  async function startOfficialVod(info, opts) {
    var w0 = await jOr(FEED + "/window/" + info.gameId);
    if (!w0) { log("livestats 피드가 없습니다"); return null; }
    var gameStart = new Date(w0.frames[0].rfc460Timestamp);
    var goldHistory = [];
    var manualOffset = 0; // 미세 보정용 (선택)
    log("공식 다시보기 자동 싱크: " + info.title + " " + info.setNumber + "세트 — 시킹·밴픽 모두 자동 추적");

    async function tick() {
      var v = findVideo();
      if (!v) { log("video 요소를 찾지 못했습니다"); return; }
      var clock = new Date(info.firstFrameMs + v.currentTime * 1000 + manualOffset);
      if (clock < gameStart) {
        if (opts.onPregame) opts.onPregame();
        return;
      }
      await fetchAndEmit(info.gameId, info.setNumber, gameStart, clock, goldHistory, opts, false);
    }
    await tick();
    var timer = setInterval(function () { tick().catch(function (e) { log("폴링 오류: " + e.message); }); }, 10000);
    return {
      stop: function () { clearInterval(timer); },
      live: false, official: true, matchId: info.matchId, title: info.title,
      setNumber: info.setNumber, setCount: 1,
      setClock: function (sec) {
        var v = findVideo();
        if (!v) return;
        manualOffset = (gameStart.getTime() + sec * 1000) - (info.firstFrameMs + v.currentTime * 1000);
        goldHistory.length = 0;
        tick().catch(function (e) { log("이동 실패: " + e.message); });
      }
    };
  }

  /* 방송 제목에서 두 팀이 모두 발견되는 경기 자동 인식 (워치파티 대응) */
  function matchFromTitle(list) {
    var hits = list.filter(function (m) { return teamsInTitle(m.teams); });
    return hits[0] || null;
  }

  /* 과거 일정까지 페이지네이션하며 경기 검색 (1페이지 ≈ 4개월치, 최대 6페이지)
     pred를 주면 그 조건에 맞는 경기만 (예: teamsInTitle) */
  async function scheduleScan(maxDays, pred) {
    var out = [], seen = {};
    var cutoff = Date.now() - maxDays * 86400000;
    var thisYear = new Date().getFullYear();
    for (var i = 0; i < LEAGUE_IDS.length; i++) {
      try {
        var isCL = LEAGUE_IDS[i] === "98767991335774713";
        var token = null;
        for (var page = 0; page < 6; page++) {
          var sch = await api("getSchedule?hl=ko-KR&leagueId=" + LEAGUE_IDS[i] +
                              (token ? "&pageToken=" + encodeURIComponent(token) : ""));
          var s = sch.data.schedule;
          var oldest = Infinity;
          (s.events || []).forEach(function (e) {
            var when = new Date(e.startTime).getTime();
            if (when < oldest) oldest = when;
            if (e.type !== "match" || e.state !== "completed" || seen[e.match.id]) return;
            if (when < cutoff) return;
            if (pred && !pred(e.match.teams)) return;
            seen[e.match.id] = 1;
            var d = new Date(e.startTime);
            var codes = e.match.teams.map(function (t) { return t.code || t.name; });
            var ylabel = d.getFullYear() === thisYear ? "" : String(d.getFullYear()).slice(2) + "'";
            out.push({ matchId: e.match.id, teams: e.match.teams, time: when,
                       label: ylabel + (d.getMonth() + 1) + "/" + d.getDate() + " · " + codes.join(" vs ") + (isCL ? " (CL)" : " (LCK)") });
          });
          token = s.pages && s.pages.older;
          if (!token || oldest < cutoff) break;
        }
      } catch (err) {}
    }
    out.sort(function (a, b) { return b.time - a.time; });
    return out;
  }
  function scheduleScanByTitle(maxDays) { return scheduleScan(maxDays, teamsInTitle); }

  /* 시즌 전체 경기 목록 (다시보기 페이지의 경기 선택 드롭다운용, 30분 캐시) */
  async function listSeason() {
    try {
      var c = JSON.parse(sessionStorage.getItem("lckov.season") || "null");
      if (c && Date.now() - c.at < 1800000) return c.list;
    } catch (e) {}
    var list = await scheduleScan(400);
    try { sessionStorage.setItem("lckov.season", JSON.stringify({ at: Date.now(), list: list })); } catch (e) {}
    return list;
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
  async function fetchAndEmit(gameId, gameNumber, gameStart, target, goldHistory, opts, isLive) {
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
    /* 표시 시계는 프레임(10초 내림)이 아니라 요청한 목표 시각 기준 — 화면 시계와 초 단위로 맞는다 */
    var dispElapsed = Math.max(0, Math.round((target - gameStart) / 1000));
    var state = buildState(win, det, dd, { gameNumber: gameNumber, elapsed: dispElapsed, goldHistory: visible });
    state.gameState = f.gameState;
    state.live = !!isLive; // 오버레이 헤더 LIVE/다시보기 구분
    if (opts.onState) opts.onState(state);
    return state;
  }

  async function start(opts) {
    opts = opts || {};
    var auto = !!opts.auto; // 확장 자동 실행: 보고 있는 방송과 무관한 오버레이는 띄우지 않는다
    var timer = null;

    /* 우선순위: ① 톱니에서 고른 경기 ② 다시보기 페이지 ③ 라이브 ④ 리플레이 폴백
       — 다시보기·수동 선택 중에는 라이브 경기가 있어도 절대 라이브로 넘어가지 않는다 (스포일러 방지) */
    if (opts.matchId) {
      var vodId0 = soopVodId();
      if (vodId0) return startAnchoredVod(opts.matchId, vodId0, opts, "선택한 경기"); // 세트 선택은 opts.setNumber로 고정됨
      return startReplayMatch(opts.matchId, opts.setNumber, opts, "선택한 경기");
    }

    var vodId = soopVodId();
    if (vodId) {
      log("공식 다시보기 확인 중 (VOD " + vodId + ")...");
      var vodInfo = await findOfficialVod(vodId);
      if (vodInfo) return startOfficialVod(vodInfo, opts);
      log("공식 다시보기 아님 (워치파티 녹화 등) → 제목 인식 시도");
      return startReplayFallback(opts, auto, vodId);
    }

    /* ── 라이브: 매치 단위 추적 + 타임시프트 대응 ── */
    {
      log("진행 중인 LCK·챌린저스 경기 탐색...");
      var live = null;
      try {
        live = await findLiveMatch();
      } catch (e) {
        /* esports-api 실패(403·네트워크 등)로 자동 감지가 죽지 않게 — 다시보기·제목 경로로 폴백 */
        log("경기 정보 API 오류(" + (e && e.message ? e.message : e) + ") — 대체 경로 시도");
      }
      if (live && auto && !isWatchingLive(live)) {
        log("라이브(" + live.title + ") 진행 중이지만 이 방송과 무관 → 오버레이 대기");
        return null;
      }
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
              /* 미래 시각 조회는 400 — 그날 시간(시작+2h, 현재 이전)으로 마지막 프레임 조회 */
              var wE = await jOr(FEED + "/window/" + g.id + "?startingTime=" + iso(floor10(endProbeTime(e.start))));
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
          await fetchAndEmit(curId, curNum, curStart, target, histories[curId], opts, true);
        }

        /* 방송 시계 OCR → 딜레이 오프셋 자동 보정 (기본 −60초는 보수적 초기값일 뿐) */
        var ocrL = null, ocrLPrev = null, ocrLNoted = false;
        var vLive = findVideo();
        if (typeof LCKClockOCR !== "undefined" && vLive) {
          ocrL = LCKClockOCR.start(vLive, function (ev) {
            if (ev.state === "seeded") log("내장 숫자 템플릿으로 방송 시계 즉시 인식 — 학습 생략");
            if (ev.state === "calibrating" && !ocrLNoted) {
              ocrLNoted = true;
              log("방송 시계 인식 학습 중 — 성공하면 딜레이가 자동 보정됩니다");
            }
            if (ev.state !== "reading" || !curStart) return;
            var nowMs = Date.now();
            var trusted = false;
            if (ocrLPrev) {
              var dRead = ev.time - ocrLPrev.time;
              var dReal = (nowMs - ocrLPrev.at) / 1000;
              trusted = Math.abs(dRead - dReal) <= 2 && dRead >= 0 && dRead <= 30;
            }
            ocrLPrev = { time: ev.time, at: nowMs };
            if (!trusted || ev.conf < 0.8) return;
            var behind = videoBehindLive();
            var newDelay = Math.round(((curStart.getTime() + ev.time * 1000) - (nowMs - behind * 1000)) / 1000);
            var curDelay = Number(localStorage.getItem("lckov.delay") || -60);
            if (Math.abs(newDelay - curDelay) >= 3) {
              try { localStorage.setItem("lckov.delay", String(newDelay)); } catch (e) {}
              log("방송 시계 인식 → 딜레이 자동 보정 (" + newDelay + "초) — 오버레이가 방송 화면 시점과 일치합니다");
            }
          }, gameRegion);
        }

        await refreshRanges();
        lastRefresh = Date.now();
        await liveTick();
        timer = setInterval(function () { liveTick().catch(function (e) { log("폴링 오류: " + e.message); }); }, 10000);
        return { stop: function () { clearInterval(timer); if (ocrL) ocrL.stop(); }, live: true, matchId: live.matchId, title: live.title };
      }
      log("라이브 경기 없음");
    }

    /* ── 리플레이 폴백 (제목 인식 → 수동 실행일 때만 최근 경기) ── */
    return startReplayFallback(opts, auto);
  }

  async function startReplayFallback(opts, auto, vodId) {
    var list = await listRecent();
    var hit = matchFromTitle(list);
    if (hit) {
      log("방송 제목에서 경기 인식: " + hit.label);
      /* 다시보기 페이지면 절대 시각 매핑 모드 — 싱크 1회로 세트까지 전자동 */
      if (vodId) return startAnchoredVod(hit.matchId, vodId, opts, "제목 인식");
      return startReplayMatch(hit.matchId, 1, opts, "제목 인식");
    }
    /* 다시보기 페이지면 과거 일정까지 넓혀 제목 인식 (12일 제한 없음, 최대 ~13개월) */
    if (vodId) {
      log("최근 12일에 없음 → 과거 일정에서 검색...");
      var old = await scheduleScanByTitle(400);
      if (old.length) {
        /* 후보 중 이 VOD 번호가 달린 공식 다시보기가 있으면 완전 자동 싱크 */
        for (var i = 0; i < Math.min(old.length, 5); i++) {
          var info = await vodInfoFromMatch(old[i].matchId, vodId);
          if (info) return startOfficialVod(info, opts);
        }
        log("과거 경기 인식: " + old[0].label +
            (old.length > 1 ? " — 동일 매치업 " + old.length + "건, 다른 날 경기면 톱니 → 경기 선택에서 변경" : ""));
        var h = await startAnchoredVod(old[0].matchId, vodId, opts, "제목 인식");
        if (h) h.candidates = old;
        return h;
      }
    }
    if (auto && !titleSaysLck()) {
      /* 자동 실행에서는 LCK 무관 방송에 최근 경기를 마음대로 띄우지 않는다 */
      log("LCK 관련 방송이 아니어서 오버레이를 띄우지 않습니다");
      return null;
    }
    if (auto) log("LCK 방송으로 보이지만 경기 특정 실패 → 최근 경기 표시 (톱니 → 경기 선택에서 변경)");
    if (list.length) {
      log("제목 인식 실패 → 최근 경기 재생 (오버레이 톱니 → 경기 선택에서 변경 가능)");
      return startReplayMatch(list[0].matchId, 1, opts, "최근 경기");
    }
    /* 여기까지 왔는데 목록이 비었다 = esports-api 자체가 응답하지 않는 상태 */
    throw new Error("라이엇 경기 정보 API가 응답하지 않습니다 (요청 제한 또는 점검). 잠시 후 다시 시도해주세요.");
  }

  /* ── 워치파티 다시보기: 싱크 1회로 "영상 위치 ↔ 방송 절대 시각" 매핑을 만들어
     세트 전환·시킹·밴픽까지 전자동. 매핑은 VOD별로 저장되어 재방문 시 입력 불필요 ── */
  async function startAnchoredVod(matchId, vodId, opts, labelPrefix) {
    var det = await api("getEventDetails?hl=ko-KR&id=" + matchId);
    var m = det.data.event.match;
    var title = m.teams.map(function (t) { return t.code || t.name; }).join(" vs ");
    var games = m.games.filter(function (g) { return g.state === "completed"; });
    if (!games.length) { log("이 매치의 피드가 아직 없습니다"); return null; }

    /* 세트별 방송 절대 시각 범위 */
    var ranges = [];
    for (var i = 0; i < games.length; i++) {
      var g = games[i];
      var w0 = await jOr(FEED + "/window/" + g.id);
      if (!w0) continue;
      var start = new Date(w0.frames[0].rfc460Timestamp);
      var wE = await jOr(FEED + "/window/" + g.id + "?startingTime=" + iso(floor10(endProbeTime(start))));
      ranges.push({
        id: g.id, number: g.number, start: start,
        end: wE ? new Date(wE.frames[wE.frames.length - 1].rfc460Timestamp) : null,
        history: [],
      });
    }
    if (!ranges.length) { log("livestats 피드가 없습니다"); return null; }

    /* 사용자가 톱니에서 세트를 직접 골랐으면 그 세트로 고정 (세트별로 끊긴 영상 대응) */
    var pinIdx = null;
    if (opts.setNumber) {
      for (var pi = 0; pi < ranges.length; pi++) {
        if (ranges[pi].number === opts.setNumber) pinIdx = pi;
      }
    }

    /* 입력/인식된 게임 시계가 "몇 세트의 시계인지" 판별:
       ① 세트 고정이면 그 세트 ② 영상 길이가 세트 시작들을 가장 잘 덮는 후보 (풀 중계 영상이면 유일)
       ③ 동률(세트별로 끊긴 영상)이면 현재 세트 기준 + 불확실 → 스코어보드 인식으로 확정 시도 */
    function chooseEpoch(sec, vt, dur) {
      if (pinIdx != null) {
        return { ep: ranges[pinIdx].start.getTime() + sec * 1000 - vt * 1000, idx: pinIdx, sure: true };
      }
      var scored = ranges.map(function (r, i) {
        var ep = r.start.getTime() + sec * 1000 - vt * 1000;
        var covered = 0;
        for (var j = 0; j < ranges.length; j++) {
          var s = ranges[j].start.getTime();
          /* 세트가 영상에 실제로 담기려면 시작이 영상 끝보다 최소 10분 앞서야 한다
             (끝자락 걸침을 포함으로 세면 후보가 동률이 되어 오판) */
          if (s >= ep - 5 * 60000 && s <= ep + (dur - 600) * 1000) covered++;
        }
        return { ep: ep, idx: i, covered: covered };
      });
      var max = 0;
      scored.forEach(function (s) { if (s.covered > max) max = s.covered; });
      var top = scored.filter(function (s) { return s.covered === max; });
      if (top.length === 1) return { ep: top[0].ep, idx: top[0].idx, sure: true };
      var curIdx = ranges.indexOf(cur);
      var pick = top.filter(function (s) { return s.idx === curIdx; })[0] || top[0];
      return { ep: pick.ep, idx: pick.idx, sure: false };
    }

    var epochKey = "lckov.vodepoch." + vodId;
    var videoEpoch = null; // 영상 0초의 방송 절대 시각(ms)
    try { var sv = localStorage.getItem(epochKey); if (sv) videoEpoch = Number(sv) || null; } catch (e) {}

    var cur = pinIdx != null ? ranges[pinIdx] : ranges[0];
    if (videoEpoch != null) {
      log(labelPrefix + ": " + title + " — 저장된 싱크 사용, 세트·시간 전자동");
    } else {
      log(labelPrefix + ": " + title + " — 시계 자동 인식 시도 중. 톱니 → 게임 시간 입력 1회면 세트까지 전자동");
    }

    function setEpoch(ms, why) {
      videoEpoch = ms;
      if (handleObj) handleObj.synced = true;
      try { localStorage.setItem(epochKey, String(Math.round(ms))); } catch (e) {}
      ranges.forEach(function (r) { r.history.length = 0; });
      if (why) log(why + " — 이후 세트 전환·시킹 자동");
    }
    /* 세트 시작 20분 전(밴픽·브레이크)부터 그 세트 소속 */
    function pickByAbs(absMs) {
      var best = ranges[0];
      for (var i = 0; i < ranges.length; i++) {
        if (absMs >= ranges[i].start.getTime() - 20 * 60000) best = ranges[i];
      }
      return best;
    }

    var fallbackClock = new Date(cur.start.getTime() + 60000);
    var v0 = findVideo();
    var fallbackAnchor = v0 ? { videoT: v0.currentTime, gameMs: fallbackClock.getTime() } : null;
    var handleObj = null;

    /* 시킹 즉시 반영 — 10초 폴링을 기다리지 않는다 */
    function onSeeked() { tick().catch(function (e) { log("시킹 반영 실패: " + e.message); }); }
    if (v0 && v0.addEventListener) v0.addEventListener("seeked", onSeeked);

    /* 세트 판별이 애매할 때(세트별로 끊긴 영상): 스코어보드의 세트 스코어(로고 좌우 흰 숫자)로 확정 */
    var scoreTries = 0, scorePrev = null;
    function trySetScore() {
      if (pinIdx != null) return;
      var v = findVideo();
      if (!v || typeof LCKClockOCR === "undefined" || !LCKClockOCR.readSetScore) return;
      var s = LCKClockOCR.readSetScore(v, gameRegion);
      if (s && s.left + s.right < games.length) {
        if (scorePrev && scorePrev.left === s.left && scorePrev.right === s.right) {
          var n = s.left + s.right + 1; /* 세트 번호 = 좌+우 스코어 + 1 */
          var target = null;
          for (var i = 0; i < ranges.length; i++) if (ranges[i].number === n) target = ranges[i];
          if (target && cur !== target) {
            var prev = cur;
            cur = target;
            if (handleObj) handleObj.setNumber = cur.number;
            log("세트 스코어 인식 " + s.left + ":" + s.right + " → " + cur.number + "세트로 확정");
            if (videoEpoch != null) { /* 같은 시계값을 새 세트 기준으로 재매핑 */
              videoEpoch += cur.start.getTime() - prev.start.getTime();
              try { localStorage.setItem(epochKey, String(Math.round(videoEpoch))); } catch (e) {}
              ranges.forEach(function (r) { r.history.length = 0; });
              tick().catch(function (e) { log("세트 전환 실패: " + e.message); });
            }
          }
          return;
        }
        scorePrev = s;
      }
      if (++scoreTries < 8) setTimeout(trySetScore, 5000);
    }

    async function tick() {
      var v = findVideo();
      if (videoEpoch != null && v) {
        var abs = videoEpoch + v.currentTime * 1000;
        if (pinIdx == null) { /* 세트 고정이 아니면 영상 위치로 세트 자동 전환 */
          var sel = pickByAbs(abs);
          if (sel !== cur) {
            cur = sel;
            if (handleObj) handleObj.setNumber = cur.number;
            log(cur.number + "세트 추적");
            if (opts.onSetSwitch) opts.onSetSwitch(cur.number);
          }
        }
        var t = new Date(abs);
        if (t < cur.start) { if (opts.onPregame) opts.onPregame(); return; }
        if (cur.end && t > cur.end) t = cur.end;
        var minT = new Date(cur.start.getTime() + 15000);
        if (t < minT) t = minT;
        await fetchAndEmit(cur.id, cur.number, cur.start, t, cur.history, opts, false);
      } else {
        /* 미보정 임시 재생 (1세트) — 싱크가 잡히는 순간 위 경로로 전환 */
        if (fallbackAnchor && v) fallbackClock = new Date(fallbackAnchor.gameMs + (v.currentTime - fallbackAnchor.videoT) * 1000);
        else fallbackClock = new Date(fallbackClock.getTime() + 10000);
        await fetchAndEmit(cur.id, cur.number, cur.start, fallbackClock, cur.history, opts, false);
      }
    }

    /* 게임 시계 OCR — 읽기 성공 시 현재 세트 기준으로 매핑 성립/보정 */
    var ocr = null, ocrPrev = null, ocrNoted = false, ocrCycles = 0;
    if (typeof LCKClockOCR !== "undefined" && v0) {
      ocr = LCKClockOCR.start(v0, function (ev) {
        if (ev.state === "blocked") {
          log("영상 픽셀 접근 차단 — 시계 자동 인식 불가, 톱니 → 게임 시간에 입력하세요");
          return;
        }
        if (ev.state === "locating" && ++ocrCycles === 4) {
          log("게임 시계를 아직 못 찾음 — 톱니 → 게임 화면 영역 맞추기 후 재시도되며, 게임 시간 수동 입력도 가능");
        }
        if (ev.state === "seeded" && !ocrNoted) { ocrNoted = true; log("내장 숫자 템플릿으로 게임 시계 즉시 인식 — 학습 생략"); }
        if (ev.state === "calibrating" && !ocrNoted) {
          ocrNoted = true;
          log("게임 시계 인식 학습 중 (~30초)");
        }
        if (ev.state !== "reading") return;
        var vv = findVideo();
        if (!vv) return;
        var trusted = false;
        if (ocrPrev) {
          var dRead = ev.time - ocrPrev.time;
          var dVideo = vv.currentTime - ocrPrev.videoT;
          trusted = Math.abs(dRead - dVideo) <= 2 && dRead >= 0 && dRead <= 30;
        }
        ocrPrev = { time: ev.time, videoT: vv.currentTime };
        if (!trusted || ev.conf < 0.8) return;
        var durO = isFinite(vv.duration) ? vv.duration : 0;
        var pkO = chooseEpoch(ev.time, vv.currentTime, durO);
        var firstO = videoEpoch == null;
        setEpoch(pkO.ep, firstO ? "게임 시계 인식 성공 — " + ranges[pkO.idx].number + "세트 시계로 판별" : null);
        if (cur !== ranges[pkO.idx]) { cur = ranges[pkO.idx]; if (handleObj) handleObj.setNumber = cur.number; }
        if (firstO && !pkO.sure) trySetScore();
      }, gameRegion);
    }

    await tick();
    var timer = setInterval(function () { tick().catch(function (e) { log("폴링 오류: " + e.message); }); }, 10000);
    handleObj = {
      stop: function () {
        clearInterval(timer);
        if (ocr) ocr.stop();
        if (v0 && v0.removeEventListener) v0.removeEventListener("seeked", onSeeked);
      },
      live: false, matchId: matchId, title: title,
      synced: videoEpoch != null, /* false면 오버레이가 싱크 입력 배너를 노출 */
      setNumber: cur.number, setCount: games.length,
      setClock: function (sec) {
        var v = findVideo();
        var vt = v ? v.currentTime : 0;
        var dur = v && isFinite(v.duration) ? v.duration : 0;
        var pk = chooseEpoch(sec, vt, dur);
        setEpoch(pk.ep, "수동 싱크 완료 — " + ranges[pk.idx].number + "세트" +
                 (pk.sure ? " 시계로 판별" : " 기준 (영상이 한 세트 분량 — 다른 세트면 톱니 → 세트 선택 후 재입력)"));
        if (cur !== ranges[pk.idx]) { cur = ranges[pk.idx]; if (handleObj) handleObj.setNumber = cur.number; }
        if (!pk.sure) trySetScore();
        tick().catch(function (e) { log("이동 실패: " + e.message); });
      }
    };
    return handleObj;
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
    var calibrated = false; // 싱크가 맞춰졌는가 (시계 OCR 또는 수동 입력)
    var v0 = findVideo();
    if (v0) anchor = { videoT: v0.currentTime, gameMs: replayClock.getTime() };

    /* 게임 시계 OCR: 화면 속 mm:ss를 계속 읽어 자가 재동기화 —
       리워치 파티에서 스트리머가 영상을 멈추거나 돌려도 자동으로 따라간다 */
    var ocr = null;
    var ocrPrev = null; // { time, videoT } — 읽기 일관성 검사용
    var ocrNoted = false;
    var ocrCycles = 0;
    if (typeof LCKClockOCR !== "undefined" && v0) {
      ocr = LCKClockOCR.start(v0, function (ev) {
        if (ev.state === "blocked") {
          log("영상 픽셀 접근이 차단되어(보안 정책) 게임 시계 자동 인식 불가 — 톱니 → 게임 시간에 화면 속 시계를 입력하세요");
          return;
        }
        if (ev.state === "locating" && ++ocrCycles === 4) {
          log("게임 시계를 아직 못 찾음 (화면 속 시계가 작거나 가려짐) — 톱니 → 게임 시간으로 수동 싱크를 권장합니다");
        }
        if (ev.state === "seeded" && !ocrNoted) { ocrNoted = true; log("내장 숫자 템플릿으로 게임 시계 즉시 인식 — 학습 생략"); }
        if (ev.state === "calibrating" && !ocrNoted) {
          ocrNoted = true;
          log("게임 시계 자동 인식 학습 중 — 30초쯤 걸립니다 (그동안은 톱니 → 게임 시간으로 수동 보정 가능)");
        }
        if (ev.state !== "reading") return;
        var vv = findVideo();
        if (!vv) return;
        /* 안전장치: 오독이 싱크를 망치지 않도록, 연속 읽기가 영상 진행과
           같은 속도(±2초)로 흐를 때만 신뢰한다 */
        var trusted = false;
        if (ocrPrev) {
          var dRead = ev.time - ocrPrev.time;
          var dVideo = vv.currentTime - ocrPrev.videoT;
          trusted = Math.abs(dRead - dVideo) <= 2 && dRead >= 0 && dRead <= 30;
        }
        ocrPrev = { time: ev.time, videoT: vv.currentTime };
        if (!trusted || ev.conf < 0.8) return;
        if (!calibrated) log("게임 시계 인식 성공 (" + Math.floor(ev.time / 60) + ":" + ("0" + ev.time % 60).slice(-2) + ") — 이후 시킹·일시정지 자동 추적");
        calibrated = true;
        anchor = { videoT: vv.currentTime, gameMs: gameStart.getTime() + ev.time * 1000 };
      }, gameRegion);
    }

    var finishedTicks = 0;
    async function tick() {
      var v = findVideo();
      if (anchor && v) {
        replayClock = new Date(anchor.gameMs + (v.currentTime - anchor.videoT) * 1000);
        /* 싱크가 맞춰진 뒤라면 게임 시작 전(밴픽·대기 화면) 구간을 알 수 있다 → 픽 스포일러 차단 */
        if (calibrated && replayClock < gameStart) {
          if (opts.onPregame) opts.onPregame();
          return;
        }
      } else {
        replayClock = new Date(replayClock.getTime() + 10000);
      }
      var st = await fetchAndEmit(g.id, g.number, gameStart, replayClock, goldHistory, opts, false);
      /* 세트 자동 전환: 싱크가 맞은 상태에서 세트 종료 화면이 90초 이상 이어지면
         방송이 다음 세트로 넘어간 것 — 다음 세트가 있으면 갈아탄다 */
      if (calibrated && st && st.gameState === "finished" && g.number < games.length) {
        if (++finishedTicks === 9 && opts.onSetHint) {
          log("세트 종료 감지 → " + (g.number + 1) + "세트로 전환");
          opts.onSetHint(g.number + 1);
        }
      } else {
        finishedTicks = 0;
      }
    }
    /* 시킹 즉시 반영 */
    function onSeeked() { tick().catch(function (e) { log("시킹 반영 실패: " + e.message); }); }
    if (v0 && v0.addEventListener) v0.addEventListener("seeked", onSeeked);

    await tick();
    var timer = setInterval(function () { tick().catch(function (e) { log("폴링 오류: " + e.message); }); }, 10000);
    return {
      stop: function () {
        clearInterval(timer);
        if (ocr) ocr.stop();
        if (v0 && v0.removeEventListener) v0.removeEventListener("seeked", onSeeked);
      },
      live: false, matchId: matchId, title: title, setNumber: n, setCount: games.length,
      setClock: function (sec) {
        replayClock = new Date(gameStart.getTime() + sec * 1000);
        var v = findVideo();
        anchor = v ? { videoT: v.currentTime, gameMs: replayClock.getTime() } : null;
        calibrated = !!anchor;
        goldHistory.length = 0; // 점프 시 그래프 재수집 (연속성 없음)
        tick().catch(function (e) { log("이동 실패: " + e.message); });
      }
    };
  }

  window.LCKLive = { start: start, listRecent: listRecent, listSeason: listSeason };
})();


/* ── 부트스트랩: 오버레이 마운트 + 폴링마다 UI 상태 보존 ── */
(function () {
  if (window.__lckovConsole) {
    console.log("[LCK 오버레이] 이미 실행 중입니다 — 새로 시작하려면 페이지 새로고침 후 다시 붙여넣으세요");
    return;
  }
  window.__lckovConsole = true;
  console.log("[LCK 오버레이] 번들 0805-12:50 로드"); // ↻ 적용 여부 확인용
  /* 확장 content script에서만 true — 자동 실행이므로 무관한 방송에는 오버레이를 띄우지 않는다 */
  var AUTO = !!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
  /* 북마클릿(수동 실행)을 SOOP이 아닌 페이지에서 눌렀을 때는 한 번 확인 —
     리플레이 폴백이 무관한 페이지에 뜨는 것 방지 */
  var SOOP_PAGE = /(^|\.)(sooplive\.(co\.kr|com)|afreecatv\.com)$/.test(location.hostname);
  if (!AUTO && !SOOP_PAGE) {
    if (!window.confirm("SOOP 페이지가 아닙니다. 테스트용으로 여기에 오버레이를 띄울까요?")) {
      window.__lckovConsole = false;
      return;
    }
  }
  var host = document.createElement("div");
  host.id = "lckov-host";
  document.documentElement.appendChild(host);

  /* 전체화면 대응: 팝오버(top layer)로 띄우면 풀스크린 요소보다 항상 위에 그려지고,
     플레이어 래퍼의 transform·overflow로 인한 스케일·잘림도 받지 않는다.
     팝오버 미지원 브라우저는 풀스크린 요소 안으로 호스트를 옮기는 방식으로 폴백. */
  var popoverOk = false;
  if (typeof host.showPopover === "function") {
    try {
      host.setAttribute("popover", "manual");
      /* 팝오버 UA 기본 스타일 무효화 — 레이아웃에 영향 없는 0×0 고정점 */
      host.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;margin:0;border:0;padding:0;background:transparent;overflow:visible;";
      host.showPopover();
      popoverOk = true;
    } catch (e) { host.removeAttribute("popover"); host.style.cssText = ""; }
  }
  function placeHost() {
    if (popoverOk) {
      /* 풀스크린 진입 시 브라우저가 팝오버를 닫으므로 다시 열어 top layer 최상단으로 */
      try { host.hidePopover(); } catch (e) {}
      try { host.showPopover(); } catch (e) {}
      return;
    }
    var fs = document.fullscreenElement || document.webkitFullscreenElement || null;
    if (fs && fs.tagName === "VIDEO") fs = fs.parentElement; // video 자체에는 자식을 얹을 수 없음
    var target = fs || document.documentElement;
    if (target && host.parentNode !== target) target.appendChild(host);
  }
  document.addEventListener("fullscreenchange", placeHost);
  document.addEventListener("webkitfullscreenchange", placeHost);
  placeHost();

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
  function sourceMatches() {
    /* 과거 일정 검색으로 찾은 후보(handle.candidates)를 최근 목록 앞에 병합 */
    var out = [], seen = {};
    ((handle && handle.candidates) || []).concat(matches).forEach(function (m) {
      if (seen[m.matchId]) return;
      seen[m.matchId] = 1;
      out.push({ id: m.matchId, label: m.label });
    });
    return out;
  }
  function makeSource() {
    return {
      matches: sourceMatches(),
      currentMatchId: (handle && !handle.live && handle.matchId) || (sel && sel.matchId) || "",
      setCount: (handle && handle.setCount) || 1,
      setNumber: (handle && handle.setNumber) || 1,
      canSync: !!(handle && handle.setClock),
      needsSync: !!(handle && handle.live === false && handle.synced === false),
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
      onSyncClock: function (sec) { if (handle && handle.setClock) handle.setClock(sec); },
      onGameRect: function () { restart(); } /* 영역 변경 → OCR·존 재시작 */
    };
  }
  var pregame = false;
  var hinted = false;
  function onState(state) {
    if (api && api.isCalibrating && api.isCalibrating()) return; // 영역 조절 중 재마운트 금지
    var s = capture();
    if (api) api.destroy();
    /* tickClock: 폴링(10초) 사이에도 시계가 1초씩 흐르게 — 다음 폴링이 오차를 보정 */
    api = LCKOverlay.mount(host, state, { source: makeSource(), tickClock: true });
    restore(s);
    if (pregame) { api.root.classList.remove("min"); pregame = false; } // 밴픽 구간 벗어남 → 자동 복귀
    if (!hinted && handle && !handle.live) {
      hinted = true;
      api.notify({ text: handle.official
        ? "공식 다시보기 — 영상 위치에 자동 싱크됩니다"
        : "시계 자동 인식 시도 중 (~30초) — 급하면 톱니 → 게임 시간에 화면 속 시계를 입력하세요" });
    }
  }
  function onPregame() {
    /* 게임 시작 전(밴픽) 구간: 픽 스포일러 방지를 위해 필로 접기 (펼치기는 본인 선택) */
    if (!pregame && api) {
      pregame = true;
      api.root.classList.add("min");
      console.log("[LCK 오버레이] 게임 시작 전 구간 — 픽 노출 방지를 위해 접어둠");
    }
  }
  function onSetHint(n) {
    /* 리플레이 중 세트 종료 감지 → 같은 매치의 다음 세트로 갈아타기 */
    sel = { matchId: (handle && handle.matchId) || (sel && sel.matchId), setNumber: n };
    saveSel();
    if (api) api.notify({ text: n + "세트로 전환 — 시간 싱크를 다시 잡는 중" });
    restart();
  }
  function boot() {
    LCKLive.start({ auto: AUTO, matchId: sel && sel.matchId, setNumber: sel && sel.setNumber, onState: onState, onPregame: onPregame, onSetHint: onSetHint })
      .then(function (h) {
        if (h) {
          handle = h;
          window.__lckovStop = h.stop;
          console.log("[LCK 오버레이] 실행 중 — 중지하려면 window.__lckovStop()");
        } else if (AUTO && !sel) {
          /* 자동 모드: 아직 관련 방송 아님 — 경기 시작·제목 변경 대비 2분마다 재확인 */
          setTimeout(boot, 120000);
        }
      })
      .catch(function (e) {
        console.log("[LCK 오버레이] 시작 실패: " + e.message);
        if (AUTO) {
          if (!sel) setTimeout(boot, 120000);
        } else {
          /* 북마클릿(수동 실행)은 절대 조용히 죽지 않는다 — 알리고 재클릭 가능하게 원복 */
          window.__lckovConsole = false;
          try { host.remove(); } catch (e2) {}
          alert("[LCK 룬 오버레이] 시작 실패 — " + (e && e.message ? e.message : e));
        }
      });
  }
  function restart() {
    if (handle) handle.stop();
    handle = null;
    boot();
  }
  /* 경기 선택 드롭다운: 다시보기 페이지에서는 시즌 전체, 그 외에는 최근 12일 */
  var listApi = /(^|\.)vod\./.test(location.hostname) ? LCKLive.listSeason : LCKLive.listRecent;
  listApi().then(function (m) { matches = m; }).catch(function () {});
  boot();
})();

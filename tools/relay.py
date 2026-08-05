#!/usr/bin/env python3
"""lolesports.com /api/gql(homeEvents) → 구 esports-api 응답 모양 JSON 중계.

구 공개 esports-api가 2026-08 차단되어, 클라이언트가 읽던 응답 모양 그대로
정적 JSON을 생성해 data 브랜치(raw CDN)로 배포한다.

생성물 (outdir):
  getLive.json                → 구 getLive  (진행 중 이벤트)
  getSchedule-<leagueId>.json → 구 getSchedule (리그별, 과거 130일~미래 3일)
  event-<matchId>.json        → 구 getEventDetails (최근 20일 + 진행 중 매치)

사용: python3 tools/relay.py <outdir>
"""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

LEAGUES = ["98767991310872058", "98767991335774713"]  # LCK, LCK CL
HOME_EVENTS_HASH = "7246add6f577cf30b304e651bf9e25fc6a41fe49aeafb0754c16b5778060fc0a"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "accept": "application/graphql-response+json,application/json",
    "Referer": "https://lolesports.com/ko-KR/leagues/lck",
    "x-apollo-operation-name": "homeEvents",
    "apollographql-client-name": "Esports Web",
    "apollographql-client-version": "1.0.0",
}


def gql(variables):
    qs = urllib.parse.urlencode({
        "operationName": "homeEvents",
        "variables": json.dumps(variables, separators=(",", ":")),
        "extensions": json.dumps(
            {"clientLibrary": {"name": "@apollo/client", "version": "4.1.2"},
             "persistedQuery": {"version": 1, "sha256Hash": HOME_EVENTS_HASH}},
            separators=(",", ":")),
    })
    req = urllib.request.Request("https://lolesports.com/api/gql?" + qs, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as r:
        data = json.loads(r.read())
    if data.get("errors"):
        raise RuntimeError(str(data["errors"])[:300])
    return (data.get("data") or {}).get("esports", {}).get("events", []) or []


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def infer_provider(parameter):
    return "afreecatv" if str(parameter or "").isdigit() else "youtube"


def map_team(t):
    return {"code": t.get("code"), "name": t.get("name"), "image": t.get("image"),
            "result": {"gameWins": ((t.get("result") or {}).get("gameWins")) or 0,
                       "outcome": (t.get("result") or {}).get("outcome")}}


def map_game(g):
    vods = []
    for v in g.get("vods") or []:
        vods.append({"provider": infer_provider(v.get("parameter")),
                     "parameter": v.get("parameter"),
                     "startMillis": v.get("startMillis"), "endMillis": v.get("endMillis"),
                     "firstFrameTime": v.get("firstFrameTime")})
    return {"id": g.get("id"), "number": g.get("number"), "state": g.get("state"), "vods": vods}


def map_event(ev):
    match = ev.get("match") or {}
    teams = [map_team(t) for t in ev.get("matchTeams") or []]
    return {
        "type": "match" if ev.get("__typename") == "EventMatch" or match else "show",
        "state": ev.get("state") or match.get("state"),
        "startTime": ev.get("startTime"),
        "blockName": ev.get("blockName"),
        "league": {k: (ev.get("league") or {}).get(k) for k in ("id", "slug", "name")},
        "match": {"id": match.get("id"), "teams": teams,
                  "strategy": {k: (match.get("strategy") or {}).get(k) for k in ("type", "count")}},
        "streams": ev.get("streams") or [],
        "_games": [map_game(g) for g in match.get("games") or []],
    }


def feed_started(game_id):
    """livestats 피드에 프레임이 있으면 그 세트는 실제로 시작된 것"""
    try:
        req = urllib.request.Request("https://feed.lolesports.com/livestats/v1/window/" + str(game_id))
        with urllib.request.urlopen(req, timeout=10) as r:
            if r.status != 200:
                return False
            body = r.read()
        return bool(body) and bool(json.loads(body).get("frames"))
    except Exception:
        return False


def probe_live(sched_events, now):
    """gql 이벤트 상태가 늦게 갱신되는 문제(CL에서 실측) 보정:
    오늘 경기 중 gql이 미시작이라 해도 피드에 데이터가 흐르면 진행 중으로 승격"""
    found = []
    for e in sched_events:
        if e.get("state") == "completed":
            continue
        try:
            st = datetime.strptime(e.get("startTime", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if not (timedelta(hours=-12) <= now - st <= timedelta(hours=12)):
            continue
        started = [g for g in e["_games"] if feed_started(g.get("id"))]
        if not started:
            continue
        e["state"] = "inProgress"
        last = started[-1]
        for g in e["_games"]:
            if g is last:
                g["state"] = "inProgress"
            elif g in started:
                g["state"] = "completed"
        found.append(e)
    return found


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else "out"
    os.makedirs(outdir, exist_ok=True)
    now = datetime.now(timezone.utc)
    stamp = iso(now)

    live_raw = gql({"hl": "ko-KR", "sport": "lol", "leagues": LEAGUES,
                    "eventState": ["inProgress"], "eventType": "all", "pageSize": 20})
    sched_raw = gql({"hl": "ko-KR", "sport": "lol", "leagues": LEAGUES,
                     "eventDateStart": iso(now - timedelta(days=130)),
                     "eventDateEnd": iso(now + timedelta(days=3)),
                     "eventState": ["completed", "unstarted", "inProgress"],
                     "eventType": "all", "vodType": ["recap"], "pageSize": 300})

    live_events = [map_event(e) for e in live_raw]
    sched_events = [map_event(e) for e in sched_raw]

    have = set((e.get("match") or {}).get("id") for e in live_events)
    for e in probe_live(sched_events, now):
        if (e.get("match") or {}).get("id") not in have:
            live_events.append(e)

    def dump(name, obj):
        with open(os.path.join(outdir, name), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))

    def strip(evs):
        return [{k: v for k, v in e.items() if k != "_games"} for e in evs]

    dump("getLive.json", {"updatedAt": stamp,
                          "data": {"schedule": {"events": strip(live_events)}}})

    for lid in LEAGUES:
        evs = [e for e in sched_events if (e.get("league") or {}).get("id") == lid]
        dump("getSchedule-%s.json" % lid,
             {"updatedAt": stamp,
              "data": {"schedule": {"pages": {"older": None, "newer": None}, "events": strip(evs)}}})

    cutoff = now - timedelta(days=20)
    n_details = 0
    for e in sched_events + live_events:
        mid = (e.get("match") or {}).get("id")
        if not mid:
            continue
        try:
            recent = datetime.strptime(e.get("startTime", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) >= cutoff
        except ValueError:
            recent = False
        if not (recent or e.get("state") == "inProgress"):
            continue
        dump("event-%s.json" % mid,
             {"updatedAt": stamp,
              "data": {"event": {"id": mid, "type": "match",
                                 "match": {"id": mid, "teams": e["match"]["teams"],
                                           "strategy": e["match"]["strategy"],
                                           "games": e["_games"]}}}})
        n_details += 1

    print("live=%d sched=%d details=%d" % (len(live_events), len(sched_events), n_details))


if __name__ == "__main__":
    main()

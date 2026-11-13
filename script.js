const isMobile = () => window.matchMedia('(max-width: 700px)').matches;

// ===== 지도 생성 =====
// 모바일에서는 아래 시트에 가려지지 않게 로고/저작권 표시를 위쪽으로 옮겨요
const corner = isMobile() ? naver.maps.Position.TOP_LEFT : naver.maps.Position.BOTTOM_RIGHT;
const map = new naver.maps.Map('map', {
  center: new naver.maps.LatLng(37.5133, 127.1028), // 처음 중심 좌표 (곧 전체 보기로 자동 조정)
  zoom: 12,
  zoomControl: true,
  zoomControlOptions: { position: naver.maps.Position.TOP_RIGHT, style: naver.maps.ZoomControlStyle.SMALL },
  logoControlOptions: { position: corner },
  mapDataControlOptions: { position: corner },
  scaleControl: false,
});

// ===== 상태 값 =====
const places = PLACES.map((p, i) => ({ ...p, id: i })); // places.js의 장소에 번호(id) 붙이기
const markers = new Map(); // 장소 id -> 마커
let openId = null;         // 지금 말풍선이 열린 장소 id
let routeOn = true;        // 코스 선 표시 여부 (처음엔 켜짐)
let routeLines = [];

const ROSE = '#e5446d';

// 말풍선은 기본 테두리를 없애고 style.css의 .info 카드로 그려요
const infoWindow = new naver.maps.InfoWindow({
  content: '',
  borderWidth: 0,
  backgroundColor: 'transparent',
  disableAnchor: true,
  pixelOffset: new naver.maps.Point(0, -14), // 핀 위로 살짝 띄우기
});

// ===== 도우미 함수 =====
const $ = (id) => document.getElementById(id);

// 입력한 글자가 HTML로 해석되지 않게 안전하게 변환
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 2025-06-06 -> 2025년 6월 6일 금요일
function fmtDate(s) {
  const d = new Date(s + 'T00:00:00');
  if (!s || isNaN(d)) return s || '';
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}

const firstLine = (s) => String(s ?? '').split('\n')[0].trim();

// ===== 핀 (번호가 적힌 물방울 모양) =====
function pinIcon(p, active) {
  return {
    content: `<div class="pin${active ? ' active' : ''}"><span>${p.id + 1}</span></div>`,
    anchor: new naver.maps.Point(16, 38), // 물방울 끝이 정확한 위치를 가리키도록
  };
}

places.forEach((p) => {
  const marker = new naver.maps.Marker({
    position: new naver.maps.LatLng(p.lat, p.lng),
    map,
    icon: pinIcon(p, false),
    title: p.name,
    zIndex: 100 + p.id,
  });
  naver.maps.Event.addListener(marker, 'click', () => toggleInfo(p.id)); // 핀을 누를 때마다 켜기/끄기
  markers.set(p.id, marker);
});

function refreshPins() {
  places.forEach((p) => {
    const m = markers.get(p.id);
    const active = p.id === openId;
    m.setIcon(pinIcon(p, active));
    m.setZIndex(active ? 1000 : 100 + p.id);
  });
}

// ===== 말풍선 켜기/끄기 =====
function showInfo(id) {
  const p = places.find((x) => x.id === id);
  infoWindow.setContent(`
    <div class="info">
      <div class="step">${p.id + 1}번째 장소</div>
      <h3>${esc(p.name)}</h3>
      ${p.date ? `<div class="date">${esc(fmtDate(p.date))}</div>` : ''}
      ${p.memo ? `<div class="memo">${esc(p.memo)}</div>` : ''}
    </div>`);
  infoWindow.open(map, markers.get(id));
  openId = id;
  refreshPins();
  renderList();
  document.querySelector('#list li.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function closeInfo() {
  infoWindow.close();
  openId = null;
  refreshPins();
  renderList();
}

// 같은 핀을 다시 누르면 닫고, 다른 핀이면 그 핀의 말풍선을 연다
function toggleInfo(id) {
  if (openId === id) closeInfo();
  else showInfo(id);
}

// 지도 빈 곳을 누르면 말풍선 닫기
naver.maps.Event.addListener(map, 'click', () => { if (openId !== null) closeInfo(); });

// ===== 패널 목록 (코스 순서 타임라인) =====
function renderList() {
  const ul = $('list');
  ul.innerHTML = '';
  places.forEach((p) => {
    const li = document.createElement('li');
    if (p.id === openId) li.className = 'active';
    const sub = p.date ? `<span class="date">${esc(fmtDate(p.date))}</span>` : '';
    const preview = p.memo ? `<span class="preview">${esc(firstLine(p.memo))}</span>` : '';
    li.innerHTML = `
      <button class="stop" type="button" aria-current="${p.id === openId}">
        <span class="num">${p.id + 1}</span>
        <span><span class="name">${esc(p.name)}</span>${sub}${preview}</span>
      </button>`;
    li.querySelector('button').onclick = () => {
      if (openId === p.id) return closeInfo();
      focusPlace(p);
      showInfo(p.id);
    };
    ul.appendChild(li);
  });
}

// 장소로 이동 — 패널에 가려지지 않는 쪽 가운데로
function focusPlace(p) {
  const [dx, dy] = isMobile()
    ? [0, Math.round(window.innerHeight * 0.13)] // 아래 시트에 안 가리게 장소를 위로 (말풍선 공간은 남기고)
    : [-190, 0];                                 // 왼쪽 패널만큼 장소를 오른쪽으로
  const proj = map.getProjection();
  const pt = proj.fromCoordToOffset(new naver.maps.LatLng(p.lat, p.lng));
  map.panTo(proj.fromOffsetToCoord(new naver.maps.Point(pt.x + dx, pt.y + dy)));
}

// ===== 코스 선 (places.js에 적은 순서대로 핀 연결) =====
function drawRoute() {
  routeLines.forEach((l) => l.setMap(null));
  routeLines = [];
  if (!routeOn) return;
  for (let i = 0; i < places.length - 1; i++) {
    routeLines.push(new naver.maps.Polyline({
      map,
      path: [
        new naver.maps.LatLng(places[i].lat, places[i].lng),
        new naver.maps.LatLng(places[i + 1].lat, places[i + 1].lng),
      ],
      strokeColor: ROSE,
      strokeWeight: 3,
      strokeOpacity: 0.75,
      strokeLineCap: 'round',
      endIcon: naver.maps.PointingIcon.OPEN_ARROW, // 다음 장소 방향 표시
      endIconSize: 10,
    }));
  }
}

$('btn-route').onclick = () => {
  routeOn = !routeOn;
  const b = $('btn-route');
  b.classList.toggle('on', routeOn);
  b.setAttribute('aria-pressed', routeOn);
  b.textContent = routeOn ? '코스 선 숨기기' : '코스 선 보기';
  drawRoute();
};

// 모든 핀이 한 화면에 보이도록 지도 맞추기 (패널에 가려지는 영역은 빼고)
function fitAll() {
  if (!places.length) return;
  if (places.length === 1) {
    map.setCenter(new naver.maps.LatLng(places[0].lat, places[0].lng));
    map.setZoom(15);
    return;
  }
  const bounds = new naver.maps.LatLngBounds();
  places.forEach((p) => bounds.extend(new naver.maps.LatLng(p.lat, p.lng)));
  const pad = isMobile()
    ? { top: 60, right: 40, bottom: Math.round(window.innerHeight * 0.46) + 30, left: 40 }
    : { top: 70, right: 70, bottom: 70, left: 420 };
  map.fitBounds(bounds, pad);
}
$('btn-fit').onclick = fitAll;

// ===== 개발용: 주소 끝에 ?dev 를 붙이면 지도 클릭 시 좌표를 보여줘요 =====
if (location.search.includes('dev')) {
  naver.maps.Event.addListener(map, 'click', (e) => {
    const line = `{ name: '', date: '', memo: '', lat: ${e.coord.y.toFixed(6)}, lng: ${e.coord.x.toFixed(6)} },`;
    $('devbox').textContent = line;
    $('devbox').hidden = false;
    navigator.clipboard?.writeText(line); // 자동 복사 (places.js에 바로 붙여넣기)
  });
}

// ===== 시작 =====
$('count').textContent = `함께 간 곳 ${places.length}곳`;
renderList();
drawRoute();
fitAll();
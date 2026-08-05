const startScreen = document.getElementById('start-screen');
const loadingScreen = document.getElementById('loading-screen');
const startBtn = document.getElementById('start-btn');
const mainScreen = document.getElementById('main-screen');
const statusText = document.getElementById('status-text');
const locationLabel = document.getElementById('location-label');
const liveClock = document.getElementById('live-clock');

const expectedShindo = document.getElementById('expected-shindo');
const pCountdown = document.getElementById('p-countdown');
const sCountdown = document.getElementById('s-countdown');

const eewBanner = document.getElementById('eew-banner');
const eewSerial = document.getElementById('eew-serial');
const eewHypo = document.getElementById('eew-hypo');
const eewTime = document.getElementById('eew-time');
const eewMag = document.getElementById('eew-mag');
const eewDepth = document.getElementById('eew-depth');

const distanceVal = document.getElementById('distance-val');
const mapLegend = document.getElementById('map-legend');
const historyList = document.getElementById('history-list');

let userLocation = null;
let ws = null;
let timerId = null;
let waveTimerId = null;
let isFirstConnected = false;

let map = null;
let userMarker = null;
let epicenterMarker = null;
let distanceLine = null;
let pWaveCircle = null;
let sWaveCircle = null;

const P_WAVE_SPEED = 7.0; // km/s
const S_WAVE_SPEED = 4.0; // km/s

// 現在時刻のリアルタイム更新
setInterval(() => {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  liveClock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}, 1000);

const calculateSurfaceDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

startBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  loadingScreen.classList.remove('hidden'); // ローディング表示
  getUserLocation();
  connectWebSocket();
});

const getUserLocation = () => {
  if (!navigator.geolocation) {
    userLocation = { lat: 35.6812, lng: 139.7671 }; // 取得できない場合のデフォルト（東京）
    locationLabel.textContent = "📍 位置情報取得失敗(東京)";
    initMap();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      locationLabel.textContent = `📍 ${userLocation.lat.toFixed(2)}, ${userLocation.lng.toFixed(2)}`;
      initMap();
    },
    () => {
      userLocation = { lat: 35.6812, lng: 139.7671 };
      locationLabel.textContent = "📍 位置情報拒否(東京)";
      initMap();
    }
  );
};

const initMap = () => {
  if (!map && userLocation) {
    map = L.map('map').setView([userLocation.lat, userLocation.lng], 7);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap & CARTO',
      maxZoom: 19
    }).addTo(map);

    userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
      color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.8, radius: 6
    }).addTo(map).bindPopup("現在地");
  }
};

const connectWebSocket = () => {
  statusText.textContent = '🟡 接続中...';
  ws = new WebSocket('wss://api.p2pquake.net/v2/ws');

  ws.onopen = () => {
    statusText.textContent = '🟢 接続中';
    
    // 初回接続成功時にローディングを消してメイン画面を表示
    if (!isFirstConnected) {
      isFirstConnected = true;
      loadingScreen.classList.add('hidden');
      mainScreen.classList.remove('hidden');
      // マップのサイズを再計算して表示崩れを防ぐ
      setTimeout(() => { if (map) map.invalidateSize(); }, 100);
    }
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.code === 556) {
      processEEW(data.earthquake);
    }
  };

  ws.onclose = () => {
    statusText.textContent = '🔴 切断 (再接続中...)';
    setTimeout(() => {
      connectWebSocket();
    }, 3000);
  };

  ws.onerror = (error) => {
    console.error("WebSocketエラー:", error);
    ws.close();
  };
};

const processEEW = (eew) => {
  eewBanner.classList.remove('hidden');
  mapLegend.classList.remove('hidden');

  eewHypo.textContent = eew.hypocenter.name;
  eewMag.textContent = eew.hypocenter.magnitude;
  eewDepth.textContent = eew.hypocenter.depth;
  eewTime.textContent = eew.originTime.split(' ')[1] || eew.originTime;

  addHistoryItem(eew);

  if (userLocation && eew.hypocenter.latitude > -90) {
    const epiLat = eew.hypocenter.latitude;
    const epiLng = eew.hypocenter.longitude;
    const depth = eew.hypocenter.depth;

    drawMapElements(epiLat, epiLng);

    const surfaceDist = calculateSurfaceDistance(userLocation.lat, userLocation.lng, epiLat, epiLng);
    const totalDist = Math.sqrt(surfaceDist ** 2 + depth ** 2);
    distanceVal.textContent = totalDist.toFixed(1);

    const approxShindo = Math.max(1, Math.min(7, Math.floor(eew.hypocenter.magnitude - (totalDist / 100))));
    expectedShindo.textContent = approxShindo;

    const originTimestamp = new Date(eew.originTime.replace(/\//g, '-')).getTime();
    startCountdowns(originTimestamp, totalDist, depth);
    startWaveAnimation(epiLat, epiLng, depth, originTimestamp);
  }
};

const addHistoryItem = (eew) => {
  const emptyEl = historyList.querySelector('.history-empty');
  if (emptyEl) emptyEl.remove();

  const item = document.createElement('div');
  item.className = 'history-item';
  const timeStr = eew.originTime.split(' ')[1] || eew.originTime;
  item.innerHTML = `
    <span>${timeStr} ${eew.hypocenter.name}</span>
    <span>M${eew.hypocenter.magnitude}</span>
  `;
  historyList.prepend(item);
};

const drawMapElements = (lat, lng) => {
  if (!map) return;
  if (epicenterMarker) map.removeLayer(epicenterMarker);
  if (distanceLine) map.removeLayer(distanceLine);

  epicenterMarker = L.circleMarker([lat, lng], {
    color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.8, radius: 8
  }).addTo(map);

  distanceLine = L.polyline([[userLocation.lat, userLocation.lng], [lat, lng]], {
    color: '#475569', dashArray: '4, 8', weight: 2
  }).addTo(map);

  map.fitBounds(L.latLngBounds([userLocation.lat, userLocation.lng], [lat, lng]), { padding: [40, 40] });
};

const startCountdowns = (originTimestamp, totalDist, depth) => {
  if (timerId) clearInterval(timerId);

  const pTravelTime = Math.sqrt(totalDist ** 2 + depth ** 2) / P_WAVE_SPEED;
  const sTravelTime = totalDist / S_WAVE_SPEED;
  const pTarget = originTimestamp + pTravelTime * 1000;
  const sTarget = originTimestamp + sTravelTime * 1000;

  timerId = setInterval(() => {
    const now = Date.now();
    const pDiff = Math.ceil((pTarget - now) / 1000);
    const sDiff = Math.ceil((sTarget - now) / 1000);

    pCountdown.textContent = pDiff > 0 ? `${pDiff} 秒` : "到達済";
    sCountdown.textContent = sDiff > 0 ? `${sDiff} 秒` : "到達済";

    if (sDiff <= 0) clearInterval(timerId);
  }, 100);
};

const startWaveAnimation = (lat, lng, depth, originTimestamp) => {
  if (waveTimerId) clearInterval(waveTimerId);
  if (pWaveCircle) map.removeLayer(pWaveCircle);
  if (sWaveCircle) map.removeLayer(sWaveCircle);

  pWaveCircle = L.circle([lat, lng], { radius: 0, color: '#3b82f6', weight: 1, fill: false, dashArray: '3, 3' }).addTo(map);
  sWaveCircle = L.circle([lat, lng], { radius: 0, color: '#ef4444', weight: 1, fillColor: '#ef4444', fillOpacity: 0.2 }).addTo(map);

  waveTimerId = setInterval(() => {
    const elapsed = (Date.now() - originTimestamp) / 1000;
    if (elapsed > 0) {
      const pDist = P_WAVE_SPEED * elapsed;
      const sDist = S_WAVE_SPEED * elapsed;
      pWaveCircle.setRadius(Math.max(0, Math.sqrt(pDist ** 2 - depth ** 2) * 1000));
      sWaveCircle.setRadius(Math.max(0, Math.sqrt(sDist ** 2 - depth ** 2) * 1000));
    }
  }, 50);
};

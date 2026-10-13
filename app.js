'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const { distance, validatePoints, Proximity } = window.RoadlyCore;
  const config = window.ROADLY_CONFIG;
  const proximity = new Proximity();
  let map, userMarker, destinationMarker, routeLine, cameraLayer;
  let fix = null, watch = null, tracking = false, following = false;
  let imported = [], warnings = false, demoTimer = null, demoActive = false, demoPoints = [];
  let searchAbort, routeAbort, searchRevision = 0, routeRevision = 0;
  let lastSearch = 0, lastRoute = 0, selected = null;
  const searchCache = new Map();
  let stepsData = [];
  const { Guide, instruction } = window.RoadlyNavigation;
  let routeData = null, guide = null, navigating = false, navVoice = true, wakeLock = null;
  let navAnnounced = new Set(), calculating = false, pendingRoute = false, lastAutoRoute = 0;
  function navigationHint(text, meters = 'Navigation', arrow = '↑') {
    $('navInstruction').textContent = text; $('navMeters').textContent = meters; $('navArrow').textContent = arrow;
  }
  async function keepAwake() {
    if (!navigating || document.hidden || !navigator.wakeLock || wakeLock) return;
    try { const lock = await navigator.wakeLock.request('screen');
      if (!navigating || document.hidden) { await lock.release(); return; }
      wakeLock = lock; lock.addEventListener('release', () => { if(wakeLock===lock)wakeLock=null; });
    } catch (_) { /* Navigation remains usable while the screen stays on manually. */ }
  }
  function stopNavigation() {
    navigating = false; guide = null; navAnnounced.clear(); stopSpeech();
    wakeLock?.release().catch(()=>{}); wakeLock = null;
    document.body.classList.remove('navigating'); $('navBanner').hidden = true;
    $('navigate').textContent = 'Navigation starten ↑';
  }
  function updateNavigation() {
    if (!navigating || !guide || document.hidden) return;
    const result = guide.update(fix);
    if(result.state==='unchanged') return;
    if(result.state==='gps') { navigationHint('GPS ungenau oder unterbrochen. Auf neuen Standort warten.', 'Warte auf GPS', '◎'); return; }
    if(result.state==='offroute') {
      navigationHint(calculating?'Neue Route wird berechnet …':'Du bist abseits der Route. Standort wird geprüft.', 'Route prüfen', '↻');
      if(result.reroute && !calculating && navigator.onLine && Date.now()-lastAutoRoute>30000) {
        lastAutoRoute=Date.now(); calculateRoute(true);
      }
      return;
    }
    if(calculating) return;
    if(result.state==='arrived') {
      stopNavigation(); $('navBanner').hidden=false; navigationHint('Du hast das Routenziel erreicht.', 'Angekommen', '⚑');
      $('duration').textContent='Angekommen'; $('distance').textContent='0 m'; $('arrival').textContent='';
      if(navVoice)speak('Du hast dein Ziel erreicht.'); notice('Navigation beendet.'); return;
    }
    const text=instruction(result.step);
    const modifier=result.step.maneuver?.modifier||'';
    const arrow=result.step.maneuver?.type==='arrive'?'⚑':modifier.includes('left')?'↰':modifier.includes('right')?'↱':modifier==='uturn'?'↶':'↑';
    const meters=result.meters<1000?`${Math.max(0,Math.round(result.meters/10)*10)} m`:`${(result.meters/1000).toLocaleString('de-DE',{maximumFractionDigits:1})} km`;
    navigationHint(text,`In ${meters}`,arrow);
    $('duration').textContent=`${Math.max(1,Math.ceil(result.seconds/60))} Min.`;
    $('distance').textContent=result.remaining<1000?`${Math.round(result.remaining)} m`:`${(result.remaining/1000).toLocaleString('de-DE',{maximumFractionDigits:1})} km`;
    $('arrival').textContent=`ca. ${new Date(Date.now()+result.seconds*1000).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}`;
    const stage=result.meters<45?'now':result.meters<250?'soon':result.meters<700?'ahead':null;
    const key=`${result.index}:${stage}`;
    if(navVoice && stage && !navAnnounced.has(key) && !window.speechSynthesis?.speaking) {
      navAnnounced.add(key);
      if(stage==='now'){navAnnounced.add(`${result.index}:soon`);navAnnounced.add(`${result.index}:ahead`);}
      if(stage==='soon')navAnnounced.add(`${result.index}:ahead`);
      if(!window.speechSynthesis?.speaking)speak(`${stage==='now'?'Jetzt':`In ${meters}`} ${text}`);
    }
  }
  $('voiceNavigation').addEventListener('change',e=>{navVoice=e.target.checked;if(!navVoice)stopSpeech();});
  $('navigate').addEventListener('click',()=>{
    if(navigating){stopNavigation();notice('Navigation beendet. Die Route bleibt sichtbar.');return;}
    if(!routeData||!selected)return;
    if(!fresh()){tracking=true;startWatch();notice('Bitte auf einen genauen GPS-Standort warten und erneut starten.');return;}
    try{guide=new Guide(routeData);}catch(e){notice(e.message);return;}
    navigating=true;tracking=true;following=true;navAnnounced.clear();
    $('results').hidden=true;document.body.classList.add('navigating');$('navBanner').hidden=false;
    $('navigate').textContent='Navigation beenden ×';
    if(map)map.setView([fix.lat,fix.lon],17);
    if(watch===null)startWatch(); keepAwake();
    if(navVoice)speak('Navigation gestartet.'); updateNavigation();notice('');
  });
  const notice = text => { $('notice').textContent = text; $('notice').hidden = !text; };
  const status = text => { $('status').textContent = text; };
  const fresh = () => fix && Date.now() - fix.time <= 15000 && fix.accuracy <= 100;
  function speak(text) {
    if (!('speechSynthesis' in window)) { notice('Sprachausgabe wird hier nicht unterstützt. Visuelle Warnungen bleiben verfügbar.'); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE'; utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }
  function stopSpeech() { window.speechSynthesis?.cancel(); }
  function pointIcon(type, symbol) {
    return L.divIcon({ className: type, html: symbol, iconSize: [32, 32], iconAnchor: [16, 16] });
  }
  if (window.L) {
    map = L.map('map', { zoomControl: false, attributionControl: true }).setView([48.7758, 9.1829], 13);
    const tiles = L.tileLayer(config.tiles, {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    let tileFailures = 0;
    tiles.on('tileerror', () => { if (++tileFailures === 3) notice('Kartenkacheln konnten nicht geladen werden. Internetverbindung prüfen.'); });
    cameraLayer = L.layerGroup().addTo(map);
    map.on('dragstart', () => { following = false; });
    map.on('click', e => {
      if (demoActive || navigating) return;
      setDestination({ lat: e.latlng.lat, lon: e.latlng.lng, name: 'Gewählter Kartenpunkt' });
    });
  } else { $('mapFallback').hidden = false; notice('Kartenbibliothek nicht geladen. Seite bei bestehender Internetverbindung neu öffnen.'); }

  function drawCameraPoints() {
    if (!cameraLayer) return;
    cameraLayer.clearLayers();
    const points = demoActive ? demoPoints : warnings ? imported : [];
    points.forEach(p => {
      const label = document.createElement('span'); label.textContent = p.label;
      L.marker([p.lat, p.lon], { icon: pointIcon('camera-marker', '!') }).bindPopup(label).addTo(cameraLayer);
    });
  }
  function drawFix() {
    if (!map || !fix) return;
    if (!userMarker) userMarker = L.marker([fix.lat, fix.lon], { icon: pointIcon('vehicle-marker', '↑') }).addTo(map);
    else userMarker.setLatLng([fix.lat, fix.lon]);
    if (following) map.panTo([fix.lat, fix.lon], { animate: false });
  }
  function updateWarning() {
    const nearby = proximity.check(fix, demoActive ? demoPoints : imported, demoActive || warnings);
    $('warning').hidden = !nearby;
    if (!nearby) return;
    $('warningTitle').textContent = demoActive ? 'Test-Messstelle voraus' : nearby.point.label;
    $('warningDistance').textContent = `${Math.round(nearby.meters)} m Luftlinie · ${demoActive ? 'simulierte Position' : 'importierter, ungeprüfter Punkt'}`;
    if (nearby.speak) speak(`${demoActive ? 'Testwarnung. ' : ''}Messstelle in ungefähr ${Math.round(nearby.meters)} Metern Luftlinie.`);
  }
  function updateSpeed() {
    const value = fresh() && Number.isFinite(fix.speed) && fix.speed >= 0 ? Math.round(fix.speed * 3.6) : '–';
    $('speed').textContent = value;
    $('speedLabel').textContent = demoActive ? 'km/h · DEMO' : 'km/h · GPS';
  }
  function applyFix(next) { fix = next; drawFix(); updateSpeed(); updateNavigation(); updateWarning(); }
  function stopWatch() { if (watch !== null) navigator.geolocation?.clearWatch(watch); watch = null; }
  function startWatch() {
    if (!navigator.geolocation || !window.isSecureContext) { notice('Standort benötigt eine HTTPS-Seite und einen Browser mit Standortfreigabe.'); return; }
    stopWatch(); status('GPS wird gesucht');
    watch = navigator.geolocation.watchPosition(p => {
      if (demoActive || document.hidden || !tracking) return;
      const c = p.coords;
      applyFix({ lat: c.latitude, lon: c.longitude, accuracy: c.accuracy, speed: c.speed, time: p.timestamp });
      status(fresh() ? 'GPS aktiv' : 'GPS ungenau');
      $('mapTag').textContent = navigating ? 'NAVIGATION · NORDEN OBEN' : 'DEIN STANDORT · KARTENANSICHT';
      if(pendingRoute && fresh() && !calculating){pendingRoute=false;calculateRoute(false);}
    }, e => {
      fix = null; updateSpeed(); updateWarning(); updateNavigation(); status('Kein GPS');
      notice(e.code === 1 ? 'Standort nicht erlaubt. Erlaube Safari bzw. Roadly den Zugriff in den iPhone-Einstellungen.' : 'Standort gerade nicht verfügbar. Gehe an einen Ort mit besserem GPS-Empfang.');
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  }
  function locate() {
    if (demoActive) stopDemo();
    tracking = true; following = true; startWatch();
    if (map && fresh()) map.setView([fix.lat, fix.lon], 16);
    if(!navigating)notice('Standort wird angefragt. Nach der Freigabe kannst du deine Route starten.');
  }
  $('locate').addEventListener('click', locate);
  $('stopLocation').addEventListener('click', () => {
    if (demoActive) stopDemo();
    stopNavigation(); pendingRoute=false; routeRevision++; routeAbort?.abort(); calculating=false; tracking = false; following = false; stopWatch(); fix = null;
    if (map && userMarker) { map.removeLayer(userMarker); userMarker = null; }
    updateSpeed(); updateWarning(); stopSpeech(); status('Standort aus'); $('settings').close(); notice('Standort ausgeschaltet.');
  });
  async function getJSON(url, signal) {
    const response = await fetch(url, { signal, credentials: 'omit' });
    if (!response.ok) throw Error(response.status === 429 ? 'Dienst ausgelastet. Bitte später erneut versuchen.' : 'Der Datendienst ist gerade nicht erreichbar.');
    return response.json();
  }
  $('searchForm').addEventListener('submit', async e => {
    e.preventDefault();
    const query = $('search').value.trim();
    if (query.length < 2) return;
    if (Date.now() - lastSearch < 1500) return;
    lastSearch = Date.now();
    if (demoActive) stopDemo();
    searchAbort?.abort(); searchAbort = new AbortController();
    const revision = ++searchRevision, controller = searchAbort;
    const timeout = setTimeout(() => controller.abort(), 15000);
    $('searchButton').disabled = true; $('searchButton').textContent = '…'; $('results').hidden = true;
    $('search').blur(); notice('Ziele werden gesucht …');
    try {
      let features = searchCache.get(query.toLowerCase());
      if (!features) {
        const url = new URL(config.search);
        url.search = new URLSearchParams({ q: query, lang: 'de', limit: '5' });
        const data = await getJSON(url, controller.signal);
        if (!Array.isArray(data.features)) throw Error('Ungültige Antwort der Zielsuche.');
        features = data.features;
        if (searchCache.size >= 30) searchCache.delete(searchCache.keys().next().value);
        searchCache.set(query.toLowerCase(), features);
      }
      if (revision !== searchRevision) return;
      $('results').replaceChildren();
      features.forEach(feature => {
        const p = feature.properties || {}, coordinates = feature.geometry?.coordinates;
        if (!Array.isArray(coordinates) || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return;
        const name = p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || p.city || 'Kartenpunkt';
        const subtitle = [...new Set([p.street, p.housenumber, p.postcode, p.city, p.country].filter(Boolean))].join(' ');
        const button = document.createElement('button'); button.className = 'result'; button.type = 'button';
        const title = document.createElement('b'), sub = document.createElement('span');
        title.textContent = name; sub.textContent = subtitle; button.append(title, sub);
        button.addEventListener('click', () => { $('results').hidden = true; setDestination({ lat: coordinates[1], lon: coordinates[0], name }); });
        $('results').append(button);
      });
      $('results').hidden = !$('results').children.length;
      notice($('results').hidden ? 'Keine Treffer. Versuche Straße und Ort.' : 'Wähle dein Ziel aus der Liste.');
    } catch (error) {
      if (revision === searchRevision) notice(error.name === 'AbortError' ? 'Suche dauerte zu lange. Bitte erneut versuchen.' : error.message);
    } finally {
      clearTimeout(timeout);
      if (revision === searchRevision) { $('searchButton').disabled = false; $('searchButton').textContent = '↗'; }
    }
  });
  function clearRoute() {
    stopNavigation(); routeRevision++; routeAbort?.abort(); calculating=false; pendingRoute=false; routeData=null; selected = null; stepsData = [];
    if (map && routeLine) map.removeLayer(routeLine);
    if (map && destinationMarker) map.removeLayer(destinationMarker);
    routeLine = null; destinationMarker = null;
    $('routeCard').hidden = true; $('welcome').hidden = false;
  }
  function showDestination(point) {
    selected = point; $('routeCard').hidden = false; $('welcome').hidden = true;
    $('destinationName').textContent = point.name;
    $('duration').textContent = '–'; $('distance').textContent = ''; $('arrival').textContent = '';
    $('directionsButton').disabled = true;
    $('navigate').disabled = true;
    if (map) {
      destinationMarker = L.marker([point.lat, point.lon], { icon: pointIcon('goal-marker', '⚑') }).addTo(map);
      map.setView([point.lat, point.lon], 14);
    }
  }
  async function setDestination(point) {
    if (demoActive) stopDemo();
    clearRoute(); following = false; showDestination(point);
    if (!fresh()) { pendingRoute=true; tracking=true; startWatch(); notice('Erlaube deinen Standort. Sobald GPS bereit ist, wird die Route automatisch berechnet.'); return; }
    await calculateRoute(false);
  }
  async function calculateRoute(rerouting=false) {
    if(!selected||!fresh()||calculating)return;
    const point=selected;
    if (Date.now() - lastRoute < 1500) { notice('Bitte kurz warten und das Ziel erneut wählen.'); return; }
    lastRoute = Date.now(); calculating=true;
    const revision = ++routeRevision;
    routeAbort = new AbortController(); const controller = routeAbort;
    const timeout = setTimeout(() => controller.abort(), 18000);
    const start = { ...fix };
    notice(rerouting?'Neue Route wird berechnet …':'Autoroute wird berechnet …');
    try {
      const url = `${config.routing}${start.lon},${start.lat};${point.lon},${point.lat}?overview=full&geometries=geojson&steps=true`;
      const data = await getJSON(url, controller.signal);
      if (revision !== routeRevision) return;
      const route = data.routes?.[0];
      if (data.code !== 'Ok' || !route || !Number.isFinite(route.duration) || !Number.isFinite(route.distance) || !Array.isArray(route.geometry?.coordinates)) throw Error('Keine befahrbare Route gefunden.');
      const newGuide = new Guide(route);
      routeData=route; guide=newGuide; navAnnounced.clear();
      $('navigate').disabled=false;
      if (map) {
        if(routeLine)map.removeLayer(routeLine);
        routeLine = L.geoJSON(route.geometry, { style: { color: '#c0f5b9', weight: 6, opacity: 0.95 } }).addTo(map);
        if(!navigating)map.fitBounds(routeLine.getBounds(), { padding: [45, 45] });
      }
      $('duration').textContent = `${Math.max(1, Math.ceil(route.duration / 60))} Min.`;
      $('distance').textContent = `${(route.distance / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`;
      $('arrival').textContent = `ca. ${new Date(Date.now() + route.duration * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
      stepsData = (route.legs || []).flatMap(leg => leg.steps || []);
      $('directionsButton').disabled = !stepsData.length;
      notice(navigating?'Route aktualisiert.':'Route bereit. Tippe auf „Navigation starten“.');
      if(navigating){calculating=false;updateNavigation();}
    } catch (error) {
      if (revision === routeRevision) notice(error.name === 'AbortError' ? 'Routenberechnung dauerte zu lange. Bitte erneut versuchen.' : error.message);
    } finally { clearTimeout(timeout); if(revision===routeRevision)calculating=false; }
  }
  $('clearRoute').addEventListener('click', () => { clearRoute(); notice(''); });
  $('directionsButton').addEventListener('click', () => {
    const modifiers = { left: 'links', right: 'rechts', 'slight left': 'leicht links', 'slight right': 'leicht rechts', 'sharp left': 'scharf links', 'sharp right': 'scharf rechts', straight: 'geradeaus', uturn: 'wenden' };
    $('steps').replaceChildren();
    stepsData.forEach(step => {
      const type = step.maneuver?.type, modifier = modifiers[step.maneuver?.modifier] || '';
      let action = type === 'depart' ? 'Losfahren' : type === 'arrive' ? 'Ziel erreicht' : type === 'roundabout' || type === 'rotary' ? `Kreisverkehr${step.maneuver.exit ? `, Ausfahrt ${step.maneuver.exit}` : ''}` : type === 'turn' ? `Abbiegen ${modifier}` : type === 'merge' ? `Einfädeln ${modifier}` : type === 'on ramp' ? `Auffahrt ${modifier}` : type === 'off ramp' ? `Ausfahrt ${modifier}` : type === 'fork' ? `${modifier || 'Spur'} halten` : `Weiter ${modifier}`;
      const li = document.createElement('li');
      li.textContent = `${action}${step.name ? ` · ${step.name}` : ''} (${Math.round(step.distance || 0)} m)`; $('steps').append(li);
    }); $('directions').showModal();
  });
  function stopDemo() {
    clearInterval(demoTimer); demoTimer = null; demoActive = false; demoPoints = []; fix = null;
    clearRoute(); proximity.reset(); stopSpeech(); drawCameraPoints();
    if (map && userMarker) { map.removeLayer(userMarker); userMarker = null; }
    $('demoBadge').hidden = true; $('demo').textContent = 'Blitzerwarnung testen →';
    $('mapTag').textContent = 'KARTENANSICHT'; status('Bereit'); updateSpeed(); updateWarning();
  }
  function startDemo() {
    if (demoActive) { stopDemo(); notice('Simulation beendet. Mit ◎ kannst du deinen echten Standort einschalten.'); return; }
    stopWatch(); tracking = false; following = false; clearRoute();
    searchAbort?.abort(); searchRevision++; $('searchButton').disabled = false; $('searchButton').textContent = '↗'; $('results').hidden = true;
    demoActive = true; proximity.reset();
    demoPoints = [{ id: 'simulation-only', lat: 48.7839, lon: 9.1829, label: 'Fiktive Test-Messstelle' }];
    drawCameraPoints(); $('demoBadge').hidden = false; $('demo').textContent = 'Simulation beenden ×';
    $('mapTag').textContent = 'TESTFAHRT · KEINE ECHTE ROUTE'; status('Simulation');
    notice('Beschleunigte Testfahrt: Warnung bei 500 m. Position, Geschwindigkeit und Messstelle sind simuliert.');
    speak('Simulation gestartet. Du hörst gleich eine Testwarnung.');
    const startLat = 48.7758; let tick = 0;
    const render = () => {
      const lat = startLat + tick * 0.00027;
      applyFix({ lat, lon: 9.1829, accuracy: 5, speed: 15, time: Date.now() });
    };
    if (map) map.fitBounds([[startLat, 9.178], [48.786, 9.188]], { padding: [30, 30] });
    render();
    demoTimer = setInterval(() => {
      tick++; render();
      if (tick >= 31) {
        clearInterval(demoTimer); demoTimer = null;
        notice('Test beendet. Die 500-m-Warnung wurde geprüft. Tippe auf „Simulation beenden“, um zur normalen Karte zurückzukehren.');
        fix.speed = 0; updateSpeed();
      }
    }, 400);
  }
  $('demo').addEventListener('click', startDemo);
  $('enableWarnings').addEventListener('change', e => {
    warnings = e.target.checked; proximity.reset(); drawCameraPoints(); updateWarning();
    if (!warnings) stopSpeech();
    if (warnings && !imported.length) { $('settings').close(); notice('Keine Messstellen importiert. Die Simulation funktioniert unabhängig davon.'); }
  });
  $('testSound').addEventListener('click', () => speak('Dies ist eine Testwarnung. Fiktive Messstelle in fünfhundert Metern.'));
  $('cameraFile').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      if (file.size > 2000000) throw Error('Datei zu groß. Maximal 2 MB.');
      imported = validatePoints(JSON.parse(await file.text()));
      proximity.reset(); drawCameraPoints(); updateWarning();
      $('pointCount').textContent = `${imported.length} Punkte importiert`;
      $('dataStatus').textContent = `○ ${imported.length} importierte Punkte · nicht live`;
      notice(`${imported.length} Punkte importiert. Du kannst Warnungen in den Einstellungen aktivieren.`);
    } catch (error) { notice(`Import fehlgeschlagen: ${error.message}`); }
    e.target.value = ''; $('settings').close();
  });
  $('deletePoints').addEventListener('click', () => {
    imported = []; proximity.reset(); drawCameraPoints(); updateWarning(); stopSpeech();
    $('pointCount').textContent = '0 Punkte importiert'; $('dataStatus').textContent = '○ Keine Live-Blitzerdaten';
  });
  $('settingsOpen').addEventListener('click', () => $('settings').showModal());
  $('installOpen').addEventListener('click', () => $('install').showModal());
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopWatch(); stopSpeech();
      if (demoActive) { stopDemo(); notice('Simulation beim Verlassen pausiert. Zum Testen neu starten.'); }
      fix = null; updateSpeed(); updateWarning(); if(navigating)navigationHint('App wieder öffnen, um die Navigation fortzusetzen.', 'Pausiert', 'Ⅱ'); status('Pausiert');
    } else if (tracking) {startWatch();keepAwake();}
    else status(navigator.onLine ? 'Bereit' : 'Offline');
  });
  window.addEventListener('offline', () => { status('Offline'); notice('Du bist offline. Karten, Zielsuche und Routen benötigen Internet.'); });
  window.addEventListener('online', () => { status(fresh() ? 'GPS aktiv' : 'Bereit'); notice('Wieder online. Fehlgeschlagene Suche oder Route bitte erneut starten.'); });
  setInterval(() => { updateSpeed(); updateWarning(); updateNavigation(); if (tracking && !document.hidden && !fresh()) status('Warte auf GPS'); }, 2000);
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js').catch(() => { /* Online use remains available. */ });
})();

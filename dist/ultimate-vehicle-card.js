/*!
 * Ultimate Vehicle Card
 * Universele Home Assistant voertuigkaart (brandstof / elektrisch / hybride)
 * met batterij- en brandstofmeters, statussensoren, kilometerteller en
 * een kaartweergave die GPS-coordinaten vertaalt naar een kaart + HA-zone.
 *
 * Auteur: Sven2410
 * Licentie: MIT
 */

const UVC_VERSION = '1.0.0';

console.info(
  '%c ULTIMATE-VEHICLE-CARD %c v' + UVC_VERSION + ' ',
  'background:#026FA1;color:#fff;border-radius:4px 0 0 4px;padding:2px 6px;font-weight:600;',
  'background:#2b2b2b;color:#fff;border-radius:0 4px 4px 0;padding:2px 6px;'
);

/* Statussensoren die als tegel worden getoond. Volgorde = weergavevolgorde. */
const UVC_TILES = [
  ['ignition_entity',       'mdi:power',                   'Contact'],
  ['lock_entity',           'mdi:lock',                    'Vergrendeling'],
  ['door_entity',           'mdi:car-door',                'Deuren'],
  ['window_entity',         'mdi:window-closed-variant',   'Ramen'],
  ['ev_plug_entity',        'mdi:power-plug',              'Stekker'],
  ['ev_charge_status_entity','mdi:ev-station',             'Laadstatus'],
  ['ev_charge_power_entity','mdi:flash',                   'Laadvermogen'],
  ['climate_status_entity', 'mdi:air-conditioner',         'Klimaat'],
  ['climate_time_entity',   'mdi:timer-outline',           'Klimaat resterend'],
];

/* Nederlandse vertaling van veelvoorkomende (Engelse) enum-states. */
const UVC_STATE_NL = {
  on: 'Aan', off: 'Uit',
  open: 'Open', opened: 'Open', closed: 'Gesloten', close: 'Gesloten',
  locked: 'Vergrendeld', unlocked: 'Ontgrendeld',
  partly_locked: 'Deels vergrendeld', partial: 'Deels',
  not_plugged_in: 'Niet ingeplugd', plugged_in: 'Ingeplugd',
  connected: 'Verbonden', disconnected: 'Losgekoppeld',
  charging: 'Laden', not_charging: 'Laadt niet', complete: 'Voltooid',
  inactive: 'Inactief', active: 'Actief',
  home: 'Thuis', not_home: 'Onderweg', away: 'Weg',
  unavailable: 'Niet beschikbaar', unknown: 'Onbekend', none: '—',
};

/* Scroll-bewuste tap-detectie (mobiel + desktop). Voert fn alleen uit bij een
   echte tik (minder dan 8px beweging) en altijd op touchend, nooit touchstart. */
const uvcTap = (el, fn) => {
  if (!el) return;
  let sy = 0, sx = 0, fired = false;
  el.addEventListener('touchstart', (e) => {
    sy = e.touches[0].clientY; sx = e.touches[0].clientX; fired = false;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (Math.abs(e.changedTouches[0].clientY - sy) > 8 ||
        Math.abs(e.changedTouches[0].clientX - sx) > 8) return;
    e.preventDefault(); fired = true; fn();
  }, { passive: false });
  el.addEventListener('click', () => { if (fired) { fired = false; return; } fn(); });
};

class UltimateVehicleCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._hass = null;
    this._domBuilt = false;
    this._sig0 = '';
    this._els = {};
    this._mapKey = '';
  }

  static getConfigElement() {
    return document.createElement('ultimate-vehicle-card-editor');
  }

  static getStubConfig() {
    return { title: 'Voertuig', vehicle_type: 'hybrid', show_map: true };
  }

  setConfig(config) {
    if (!config) throw new Error('Ongeldige configuratie');
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._domBuilt) this._updateDOM();
    else this._render();
  }

  getCardSize() { return 8; }

  /* ---------- render orkestratie ---------- */

  _render() {
    if (!this._config || !this._hass) return;
    const sig = this._sig();
    if (!this._domBuilt || sig !== this._sig0) {
      this._buildDOM();
      this._domBuilt = true;
      this._sig0 = sig;
    }
    this._updateDOM();
  }

  /* Structurele handtekening: alleen wijzigingen hierin vereisen een herbouw.
     Waarde-updates (state, titel) gaan altijd via _updateDOM. */
  _sig() {
    const c = this._config || {};
    const keys = ['battery_entity', 'fuel_entity', 'ev_range_entity',
      'fuel_range_entity', 'odometer_entity', 'location_entity',
      'address_entity'].concat(UVC_TILES.map((t) => t[0]));
    const present = keys.map((k) => (c[k] ? 1 : 0)).join('');
    const map = (c.location_entity && c.show_map !== false) ? 1 : 0;
    return [c.vehicle_type || '', c.image ? 1 : 0, map, present].join('|');
  }

  /* ---------- helpers ---------- */

  _st(id) {
    if (!id || !this._hass || !this._hass.states) return null;
    return this._hass.states[id] || null;
  }

  _fmt(st) {
    if (!st) return '—';
    try { if (this._hass.formatEntityState) return this._hass.formatEntityState(st); } catch (e) {}
    const u = st.attributes && st.attributes.unit_of_measurement;
    return u ? st.state + ' ' + u : String(st.state);
  }

  _stateNL(st) {
    if (!st) return '—';
    const k = String(st.state).toLowerCase();
    if (UVC_STATE_NL[k]) return UVC_STATE_NL[k];
    return this._fmt(st);
  }

  _num(st) {
    if (!st) return null;
    const n = parseFloat(String(st.state).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  _lvlColor(p) {
    if (p == null) return 'var(--primary-color)';
    if (p <= 15) return 'var(--error-color, #d32f2f)';
    if (p <= 40) return 'var(--warning-color, #f9a825)';
    return 'var(--success-color, #43a047)';
  }

  _batteryIcon(p) {
    if (p == null) return 'mdi:battery';
    if (p <= 15) return 'mdi:battery-low';
    if (p <= 50) return 'mdi:battery-medium';
    if (p >= 97) return 'mdi:battery';
    return 'mdi:battery-high';
  }

  _moreInfo(id) {
    if (!id) return;
    this.dispatchEvent(new CustomEvent('hass-more-info', {
      detail: { entityId: id }, bubbles: true, composed: true,
    }));
  }

  /* GPS-parser: ondersteunt lat/lon-attributen, JSON (ook met enkele quotes),
     "lat,lon" strings en een regex-fallback. */
  _parseCoords(st) {
    if (!st) return null;
    const a = st.attributes || {};
    let lat = a.latitude != null ? a.latitude : a.lat;
    let lon = a.longitude != null ? a.longitude : (a.lon != null ? a.lon : a.lng);
    if (typeof lat === 'number' && typeof lon === 'number') return { lat, lon };

    const s = st.state;
    if (typeof s === 'string') {
      if (s.indexOf('lat') !== -1 || s.indexOf('{') !== -1) {
        try {
          const o = JSON.parse(s.replace(/'/g, '"'));
          const la = o.lat != null ? o.lat : o.latitude;
          const lo = o.lon != null ? o.lon : (o.lng != null ? o.lng : o.longitude);
          if (isFinite(la) && isFinite(lo)) return { lat: +la, lon: +lo };
        } catch (e) {}
        const lm = s.match(/lat[^\-0-9]*(-?\d+\.?\d*)/i);
        const om = s.match(/lo(?:n|ng|ngitude)?[^\-0-9]*(-?\d+\.?\d*)/i);
        if (lm && om) return { lat: parseFloat(lm[1]), lon: parseFloat(om[1]) };
      }
      if (s.indexOf(',') !== -1) {
        const p = s.split(',').map((x) => parseFloat(x.trim()));
        if (p.length >= 2 && isFinite(p[0]) && isFinite(p[1])) return { lat: p[0], lon: p[1] };
      }
    }
    return null;
  }

  _dist(la1, lo1, la2, lo2) {
    const R = 6371000, toR = Math.PI / 180;
    const dLa = (la2 - la1) * toR, dLo = (lo2 - lo1) * toR;
    const A = Math.sin(dLa / 2) ** 2 +
      Math.cos(la1 * toR) * Math.cos(la2 * toR) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(A));
  }

  /* Vind de kleinste HA-zone die de coordinaten bevat. */
  _findZone(lat, lon) {
    const states = this._hass.states || {};
    let best = null, bestR = Infinity;
    for (const id in states) {
      if (id.indexOf('zone.') !== 0) continue;
      const a = states[id].attributes || {};
      if (typeof a.latitude !== 'number' || typeof a.longitude !== 'number') continue;
      const r = a.radius || 100;
      const d = this._dist(lat, lon, a.latitude, a.longitude);
      if (d <= r && r < bestR) { best = a.friendly_name || id.slice(5); bestR = r; }
    }
    return best;
  }

  /* ---------- DOM opbouw (eenmalig per structuur) ---------- */

  _buildDOM() {
    const c = this._config;
    const root = this.shadowRoot;
    root.innerHTML = '';
    this._els = {};

    const style = document.createElement('style');
    style.textContent = this._css();
    root.appendChild(style);

    const card = document.createElement('ha-card');
    const wrap = document.createElement('div');
    wrap.className = 'uvc';
    card.appendChild(wrap);

    /* Header */
    const header = document.createElement('div');
    header.className = 'uvc-header';
    header.innerHTML =
      '<div class="uvc-titles">' +
        '<div class="uvc-title"></div>' +
        '<div class="uvc-name"></div>' +
      '</div>';
    const badge = document.createElement('div');
    badge.className = 'uvc-badge';
    badge.innerHTML = '<ha-icon></ha-icon><span></span>';
    header.appendChild(badge);
    wrap.appendChild(header);
    this._els.title = header.querySelector('.uvc-title');
    this._els.name = header.querySelector('.uvc-name');
    this._els.badge = badge;
    this._els.badgeIcon = badge.querySelector('ha-icon');
    this._els.badgeText = badge.querySelector('span');

    /* Hero-afbeelding */
    if (c.image) {
      const hero = document.createElement('div');
      hero.className = 'uvc-hero';
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => { hero.style.display = 'none'; });
      hero.appendChild(img);
      wrap.appendChild(hero);
      this._els.hero = hero;
      this._els.heroImg = img;
    }

    /* Meters (batterij / brandstof) */
    if (c.battery_entity || c.fuel_entity) {
      const gauges = document.createElement('div');
      gauges.className = 'uvc-gauges';
      if (c.battery_entity) {
        this._els.battery = this._buildGauge('battery', c.battery_entity, c.ev_range_entity);
        gauges.appendChild(this._els.battery.el);
      }
      if (c.fuel_entity) {
        this._els.fuel = this._buildGauge('fuel', c.fuel_entity, c.fuel_range_entity);
        gauges.appendChild(this._els.fuel.el);
      }
      wrap.appendChild(gauges);
    }

    /* Kilometerteller */
    if (c.odometer_entity) {
      const odo = document.createElement('div');
      odo.className = 'uvc-odo uvc-clickable';
      odo.innerHTML =
        '<ha-icon icon="mdi:counter"></ha-icon>' +
        '<span class="odo-label">Kilometerstand</span>' +
        '<span class="odo-val"></span>';
      wrap.appendChild(odo);
      uvcTap(odo, () => this._moreInfo(c.odometer_entity));
      this._els.odo = odo;
      this._els.odoVal = odo.querySelector('.odo-val');
    }

    /* Statustegels */
    const tiles = UVC_TILES.filter((t) => c[t[0]]);
    if (tiles.length) {
      const grid = document.createElement('div');
      grid.className = 'uvc-tiles';
      this._els.tiles = [];
      tiles.forEach(([key, icon, label]) => {
        const tile = document.createElement('div');
        tile.className = 'uvc-tile uvc-clickable';
        tile.innerHTML =
          '<ha-icon icon="' + icon + '"></ha-icon>' +
          '<div class="t-label">' + label + '</div>' +
          '<div class="t-val"></div>';
        grid.appendChild(tile);
        uvcTap(tile, () => this._moreInfo(c[key]));
        this._els.tiles.push({ key, val: tile.querySelector('.t-val') });
      });
      wrap.appendChild(grid);
    }

    /* Locatie / kaart */
    if (c.location_entity && c.show_map !== false) {
      const loc = document.createElement('div');
      loc.className = 'uvc-loc';
      loc.innerHTML =
        '<div class="loc-head">' +
          '<ha-icon icon="mdi:map-marker"></ha-icon>' +
          '<span class="loc-text"></span>' +
          '<a class="loc-open" target="_blank" rel="noopener noreferrer">Openen</a>' +
        '</div>' +
        '<div class="loc-mapwrap"><iframe class="loc-map" title="Kaart" loading="lazy"></iframe></div>';
      wrap.appendChild(loc);
      this._els.loc = loc;
      this._els.locText = loc.querySelector('.loc-text');
      this._els.locOpen = loc.querySelector('.loc-open');
      this._els.locMap = loc.querySelector('.loc-map');
    }

    /* Lege staat */
    if (!c.battery_entity && !c.fuel_entity && !c.odometer_entity &&
        !tiles.length && !c.location_entity) {
      const hint = document.createElement('div');
      hint.className = 'uvc-hint';
      hint.textContent = 'Configureer sensoren in de editor om deze kaart te vullen.';
      wrap.appendChild(hint);
    }

    root.appendChild(card);
  }

  _buildGauge(kind, entityId, rangeId) {
    const el = document.createElement('div');
    el.className = 'uvc-gauge uvc-clickable';
    el.innerHTML =
      '<div class="g-top">' +
        '<ha-icon></ha-icon>' +
        '<span class="g-label"></span>' +
        '<span class="g-val"></span>' +
      '</div>' +
      '<div class="g-bar"><div class="g-fill"></div></div>' +
      '<div class="g-sub"></div>';
    uvcTap(el, () => this._moreInfo(entityId));
    return {
      el, entityId, rangeId, kind,
      icon: el.querySelector('ha-icon'),
      label: el.querySelector('.g-label'),
      val: el.querySelector('.g-val'),
      fill: el.querySelector('.g-fill'),
      sub: el.querySelector('.g-sub'),
    };
  }

  /* ---------- DOM updaten (bij elke hass-wijziging) ---------- */

  _updateDOM() {
    const c = this._config;
    if (!c) return;

    if (this._els.title) this._els.title.textContent = c.title || 'Voertuig';
    if (this._els.name) {
      this._els.name.textContent = c.name || '';
      this._els.name.style.display = c.name ? '' : 'none';
    }

    /* Badge aandrijving */
    if (this._els.badge) {
      const map = {
        fuel: ['mdi:gas-station', 'Brandstof'],
        electric: ['mdi:lightning-bolt', 'Elektrisch'],
        hybrid: ['mdi:ev-plug-type2', 'Hybride'],
      };
      const b = map[c.vehicle_type];
      if (b) {
        this._els.badge.style.display = '';
        this._els.badgeIcon.setAttribute('icon', b[0]);
        this._els.badgeText.textContent = b[1];
      } else {
        this._els.badge.style.display = 'none';
      }
    }

    if (this._els.heroImg && c.image) this._els.heroImg.src = c.image;

    if (this._els.battery) this._updateGauge(this._els.battery, false);
    if (this._els.fuel) this._updateGauge(this._els.fuel, true);

    if (this._els.odoVal) this._els.odoVal.textContent = this._fmt(this._st(c.odometer_entity));

    if (this._els.tiles) {
      this._els.tiles.forEach((t) => {
        const st = this._st(c[t.key]);
        t.val.textContent = this._stateNL(st);
      });
    }

    if (this._els.loc) this._updateLocation();
  }

  _updateGauge(g, isFuel) {
    const st = this._st(g.entityId);
    const p = this._num(st);
    const clamped = p == null ? 0 : Math.max(0, Math.min(100, p));
    g.icon.setAttribute('icon', isFuel ? 'mdi:gas-station' : this._batteryIcon(p));
    g.label.textContent = isFuel ? 'Brandstof' : 'Laadtoestand';
    g.val.textContent = st ? this._fmt(st) : '—';
    g.fill.style.width = clamped + '%';
    g.fill.style.background = this._lvlColor(p);

    const rst = this._st(g.rangeId);
    if (rst) {
      g.sub.style.display = '';
      g.sub.textContent = 'Bereik ' + this._fmt(rst);
    } else {
      g.sub.style.display = 'none';
    }
  }

  _updateLocation() {
    const c = this._config;
    const st = this._st(c.location_entity);
    const co = this._parseCoords(st);

    if (!co) {
      this._els.locText.textContent = 'Locatie onbekend';
      this._els.locOpen.style.display = 'none';
      return;
    }

    /* Label: adres-sensor > HA-zone > coordinaten */
    let label = null;
    const ast = this._st(c.address_entity);
    if (ast && ast.state && ['unknown', 'unavailable', ''].indexOf(String(ast.state).toLowerCase()) === -1) {
      label = ast.state;
    }
    if (!label) label = this._findZone(co.lat, co.lon);
    if (!label) label = co.lat.toFixed(5) + ', ' + co.lon.toFixed(5);
    this._els.locText.textContent = label;

    /* Externe kaart-link */
    this._els.locOpen.style.display = '';
    this._els.locOpen.href =
      'https://www.openstreetmap.org/?mlat=' + co.lat + '&mlon=' + co.lon +
      '#map=16/' + co.lat + '/' + co.lon;

    /* Ingebedde kaart (alleen herladen bij verplaatsing) */
    const key = co.lat.toFixed(5) + ',' + co.lon.toFixed(5);
    if (key !== this._mapKey) {
      this._mapKey = key;
      const d = 0.006;
      const bbox = (co.lon - d) + ',' + (co.lat - d / 2) + ',' +
                   (co.lon + d) + ',' + (co.lat + d / 2);
      this._els.locMap.src =
        'https://www.openstreetmap.org/export/embed.html?bbox=' +
        encodeURIComponent(bbox) + '&layer=mapnik&marker=' + co.lat + ',' + co.lon;
    }
  }

  /* ---------- stijl ---------- */

  _css() {
    return `
      :host { display: block; }
      ha-card { padding: 0; }
      .uvc {
        display: flex; flex-direction: column; gap: 14px;
        padding: 16px;
        color: var(--primary-text-color);
      }
      .uvc-header {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
      }
      .uvc-title { font-size: 1.3rem; font-weight: 600; line-height: 1.2; }
      .uvc-name { font-size: 0.85rem; color: var(--secondary-text-color); margin-top: 2px; }
      .uvc-badge {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 10px; border-radius: 999px;
        background: color-mix(in srgb, var(--primary-color) 16%, transparent);
        color: var(--primary-color);
        font-size: 0.78rem; font-weight: 600; white-space: nowrap;
      }
      .uvc-badge ha-icon { --mdc-icon-size: 18px; }

      .uvc-hero {
        width: 100%; border-radius: 18px; overflow: hidden;
        background: var(--secondary-background-color);
      }
      .uvc-hero img { width: 100%; height: auto; display: block; object-fit: cover; }

      .uvc-gauges { display: flex; flex-direction: column; gap: 12px; }
      .uvc-gauge {
        display: flex; flex-direction: column; gap: 6px;
        padding: 12px 14px; border-radius: 16px;
        background: var(--secondary-background-color);
      }
      .g-top { display: flex; align-items: center; gap: 10px; }
      .g-top ha-icon { color: var(--primary-color); --mdc-icon-size: 22px; }
      .g-label { flex: 1; font-size: 0.9rem; font-weight: 500; }
      .g-val { font-size: 1rem; font-weight: 700; }
      .g-bar {
        height: 10px; border-radius: 999px; overflow: hidden;
        background: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
      }
      .g-fill {
        height: 100%; border-radius: 999px; width: 0%;
        background: var(--primary-color);
        transition: width .5s ease, background .3s ease;
      }
      .g-sub { font-size: 0.78rem; color: var(--secondary-text-color); }

      .uvc-odo {
        display: flex; align-items: center; gap: 10px;
        padding: 12px 14px; border-radius: 16px;
        background: var(--secondary-background-color);
      }
      .uvc-odo ha-icon { color: var(--primary-color); --mdc-icon-size: 22px; }
      .odo-label { flex: 1; font-size: 0.9rem; font-weight: 500; }
      .odo-val { font-size: 1.05rem; font-weight: 700; }

      .uvc-tiles {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
        gap: 10px;
      }
      .uvc-tile {
        display: flex; flex-direction: column; align-items: center; gap: 4px;
        padding: 12px 8px; border-radius: 14px; text-align: center;
        background: var(--secondary-background-color);
      }
      .uvc-tile ha-icon { color: var(--primary-color); --mdc-icon-size: 26px; }
      .t-label { font-size: 0.72rem; color: var(--secondary-text-color); line-height: 1.1; }
      .t-val { font-size: 0.85rem; font-weight: 600; line-height: 1.15; }

      .uvc-loc {
        display: flex; flex-direction: column; gap: 8px;
        padding: 12px 14px; border-radius: 16px;
        background: var(--secondary-background-color);
      }
      .loc-head { display: flex; align-items: center; gap: 8px; }
      .loc-head ha-icon { color: var(--primary-color); --mdc-icon-size: 20px; }
      .loc-text { flex: 1; font-size: 0.9rem; font-weight: 500; }
      .loc-open {
        font-size: 0.8rem; font-weight: 600; text-decoration: none;
        color: var(--primary-color);
        padding: 6px 8px; border-radius: 8px;
        touch-action: manipulation; -webkit-tap-highlight-color: transparent;
      }
      .loc-mapwrap {
        border-radius: 14px; overflow: hidden;
        border: 1px solid var(--divider-color);
      }
      .loc-map { width: 100%; height: 180px; border: 0; display: block; }

      .uvc-hint {
        font-size: 0.85rem; color: var(--secondary-text-color);
        padding: 8px 2px;
      }

      .uvc-clickable {
        cursor: pointer; min-height: 44px;
        touch-action: manipulation; -webkit-tap-highlight-color: transparent;
        transition: transform .1s ease, filter .15s ease;
      }
      .uvc-clickable:active { transform: scale(.985); }
      @media (hover: hover) { .uvc-clickable:hover { filter: brightness(1.08); } }
    `;
  }
}

/* ============================ EDITOR ============================ */
/* Volgt het verplichte patroon: ha-form, eenmalige _init via _ready-vlag,
   exact een value-changed listener, HA-native selectors, geen shadow DOM. */

class UltimateVehicleCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
    this._ready = false;
    this._schema = this._buildSchema();
    this._fields = this._flatFields(this._schema);
  }

  set hass(h) {
    this._hass = h;
    if (this._ready) { const f = this.querySelector('ha-form'); if (f) f.hass = h; }
    else this._init();
  }

  setConfig(c) {
    this._config = { ...c };
    if (this._ready) { const f = this.querySelector('ha-form'); if (f) f.data = this._data(); }
    else this._init();
  }

  _data() { return { ...this._config }; }

  _fire() {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: { ...this._config } }, bubbles: true, composed: true,
    }));
  }

  _flatFields(schema, out = []) {
    for (const item of schema) {
      if (item.schema) this._flatFields(item.schema, out);
      else if (item.name) out.push(item.name);
    }
    return out;
  }

  _buildSchema() {
    const ent = { entity: {} };
    return [
      { type: 'grid', schema: [
        { name: 'title', label: 'Titel', selector: { text: {} } },
        { name: 'name', label: 'Voertuignaam', selector: { text: {} } },
      ] },
      { name: 'vehicle_type', label: 'Aandrijving', selector: { select: {
        mode: 'dropdown', options: [
          { value: 'fuel', label: 'Brandstof' },
          { value: 'electric', label: 'Elektrisch' },
          { value: 'hybrid', label: 'Hybride' },
        ] } } },
      { name: 'image', label: 'Afbeelding pad of URL (bijv. /local/auto.png)', selector: { text: {} } },
      { type: 'expandable', title: 'Batterij & Brandstof', schema: [
        { name: 'battery_entity', label: 'Laadtoestand (accu %)', selector: ent },
        { name: 'ev_range_entity', label: 'Elektrisch bereik', selector: ent },
        { name: 'fuel_entity', label: 'Brandstofniveau (%)', selector: ent },
        { name: 'fuel_range_entity', label: 'Brandstof bereik', selector: ent },
      ] },
      { type: 'expandable', title: 'Rit & Laden', schema: [
        { name: 'odometer_entity', label: 'Kilometerteller', selector: ent },
        { name: 'ev_charge_status_entity', label: 'Laadstatus', selector: ent },
        { name: 'ev_charge_power_entity', label: 'Laadvermogen', selector: ent },
        { name: 'ev_plug_entity', label: 'Stekker', selector: ent },
      ] },
      { type: 'expandable', title: 'Voertuigstatus', schema: [
        { name: 'ignition_entity', label: 'Contact', selector: ent },
        { name: 'lock_entity', label: 'Vergrendeling', selector: ent },
        { name: 'door_entity', label: 'Deuren', selector: ent },
        { name: 'window_entity', label: 'Ramen', selector: ent },
        { name: 'climate_status_entity', label: 'Klimaat status', selector: ent },
        { name: 'climate_time_entity', label: 'Klimaat resterende tijd', selector: ent },
      ] },
      { type: 'expandable', title: 'Locatie', schema: [
        { name: 'location_entity', label: 'GPS / locatie sensor', selector: ent },
        { name: 'address_entity', label: 'Adres sensor (optioneel)', selector: ent },
        { name: 'show_map', label: 'Kaart tonen', selector: { boolean: {} } },
      ] },
    ];
  }

  _init() {
    if (!this._hass || this._ready) return;
    this._ready = true;
    this.innerHTML = '<ha-form></ha-form>';
    const form = this.querySelector('ha-form');
    form.hass = this._hass;
    form.schema = this._schema;
    form.data = this._data();
    form.computeLabel = (s) => s.label || s.name;

    /* Slechts EEN listener. e.detail.value bevat het volledige (platte)
       dataobject; we synchroniseren alle bekende velden en verwijderen lege. */
    form.addEventListener('value-changed', (e) => {
      const v = e.detail.value || {};
      let changed = false;
      for (const k of this._fields) {
        const nv = v[k];
        if (nv === undefined || nv === '' || nv === null) {
          if (this._config[k] !== undefined) { delete this._config[k]; changed = true; }
        } else if (nv !== this._config[k]) {
          this._config[k] = nv; changed = true;
        }
      }
      if (changed) this._fire();
    });
  }
}

/* ---------- bewaakte registratie ---------- */
if (!customElements.get('ultimate-vehicle-card-editor'))
  customElements.define('ultimate-vehicle-card-editor', UltimateVehicleCardEditor);
if (!customElements.get('ultimate-vehicle-card'))
  customElements.define('ultimate-vehicle-card', UltimateVehicleCard);

/* ---------- zichtbaar in de kaartkiezer ---------- */
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ultimate-vehicle-card',
  name: 'Ultimate Vehicle Card',
  description: 'Universele voertuigkaart: batterij, brandstof, statussensoren en een kaart met zone-detectie.',
  preview: true,
  documentationURL: 'https://github.com/Sven2410/ultimate-vehicle-card',
});

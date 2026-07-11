# Ultimate Vehicle Card

A universal Home Assistant Lovelace card for **any** vehicle — fuel, electric or
hybrid. Every sensor is optional, so you only show what your car exposes. GPS
coordinates are translated into an embedded map with automatic Home Assistant
**zone detection** (or an optional address sensor).

Built to match the *Liquid Glass* theme: the card sets no background of its own,
uses `var(--primary-color)` for accents, and relies entirely on Home Assistant
CSS variables so it follows your theme automatically.

## Features

- **Powertrain aware** — pick Fuel, Electric or Hybrid; a badge is shown accordingly.
- **State of charge & fuel gauges** with color coding (green / amber / red) and an
  optional range line underneath each bar.
- **Odometer** row.
- **Status tiles** for ignition, locks, doors, windows, plug, charge status,
  charge power and climate — each one optional and tappable (opens more-info).
- **Location** — parses GPS coordinates from a JSON sensor (even Python-style
  `{'lat': .., 'lon': .., 'alt': ..}`), from `latitude`/`longitude` attributes,
  or from a `"lat,lon"` string. It renders an embedded OpenStreetMap view and
  labels it with an optional address sensor, the matching HA zone, or the raw
  coordinates.
- **Mobile & desktop friendly** — 44px tap targets, scroll-aware tap detection,
  no accidental taps while scrolling.

## Installation (HACS)

1. In HACS go to **Frontend → ⋮ → Custom repositories**.
2. Add `https://github.com/Sven2410/ultimate-vehicle-card` as a **Dashboard** (Lovelace) repository.
3. Install **Ultimate Vehicle Card** and reload your browser.

The resource is loaded from `dist/ultimate-vehicle-card.js`.

### Manual installation

Copy `dist/ultimate-vehicle-card.js` to `/config/www/` and add a resource:

```yaml
url: /local/ultimate-vehicle-card.js
type: module
```

## Configuration

The card ships with a full graphical editor (`ha-form`). You can also configure
it in YAML. All options are optional except `type`.

| Option | Type | Description |
| --- | --- | --- |
| `type` | string | `custom:ultimate-vehicle-card` |
| `title` | string | Card title. |
| `name` | string | Vehicle name (subtitle). |
| `vehicle_type` | string | `fuel`, `electric` or `hybrid`. |
| `image` | string | Path or URL to the vehicle image (e.g. `/local/van.png`). |
| `battery_entity` | entity | State of charge (%). |
| `ev_range_entity` | entity | Electric range. |
| `fuel_entity` | entity | Fuel level (%). |
| `fuel_range_entity` | entity | Fuel range. |
| `odometer_entity` | entity | Odometer. |
| `ev_charge_status_entity` | entity | Charge status. |
| `ev_charge_power_entity` | entity | Charge power. |
| `ev_plug_entity` | entity | Plug connection. |
| `ignition_entity` | entity | Ignition / contact. |
| `lock_entity` | entity | Lock status. |
| `door_entity` | entity | Door status. |
| `window_entity` | entity | Window status. |
| `climate_status_entity` | entity | Climate / remote start status. |
| `climate_time_entity` | entity | Climate remaining time. |
| `location_entity` | entity | GPS / location sensor. |
| `address_entity` | entity | Optional address text sensor. |
| `show_map` | boolean | Show the embedded map (default `true`). |

### Example

```yaml
type: custom:ultimate-vehicle-card
title: Mijn bus
name: Volkswagen
vehicle_type: hybrid
image: /local/van.png
battery_entity: sensor.laadtoestand
ev_range_entity: sensor.ev
fuel_entity: sensor.brandstof
odometer_entity: sensor.kilometerteller
ignition_entity: sensor.contact
lock_entity: sensor.vergrendelingsstatus
door_entity: sensor.deurstatus
window_entity: sensor.raamstand
ev_plug_entity: sensor.ev_stekker
ev_charge_status_entity: sensor.ev_oplaadstatus
ev_charge_power_entity: sensor.ev_geladen
climate_status_entity: sensor.rc_status_externe_start
climate_time_entity: sensor.rc_resterende_tijd
location_entity: sensor.gps_json
show_map: true
```

## Notes

- The map uses an embedded OpenStreetMap frame — no API key required.
- Zone detection scans your `zone.*` entities and picks the smallest zone whose
  radius contains the vehicle. Add a zone in Home Assistant to get named places
  like *Home* or *Work*.
- For a street address, expose a reverse-geocoding sensor and point
  `address_entity` at it.

## License

MIT © Sven2410

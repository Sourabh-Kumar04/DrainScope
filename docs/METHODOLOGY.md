# Hydrological Methodology & Limitations

All basin-scale calculations in `apps/api/app/services/simulation.py` are **100% deterministic** (zero LLM inference) and audited by 18 automated `pytest` tests (`apps/api/tests/test_api.py`).

---

## 1. Waterlogging Susceptibility Index (`WSI`)

Each H3 cell and organic contour pocket is scored on `[0, 1]` from five normalized physical factors:

$$\text{WSI} = \text{clip}_{[0,1]}\left(0.25 \cdot \text{TWI}_n + 0.20 \cdot \text{Trap}_n + 0.20 \cdot \text{Runoff}_n + 0.20 \cdot \text{DrainDef}_n + 0.15 \cdot S(I)\right)$$

* **Terrain Pooling (`0.25`, $\text{TWI}_n$):** 90th-percentile Topographic Wetness Index derived from the Copernicus GLO-30 DEM.
* **Depression & Underpass Trap (`0.20`, $\text{Trap}_n$):** Equal blend of DEM sink depth (`sink_max_m`) and OSM sunken road underpass presence (`layer=-1`).
* **Concrete Runoff (`0.20`, $\text{Runoff}_n$):** Impervious surface fraction from ESA WorldCover 10 m, adjusted by stress-scenario infill and NbS bio-retention reductions (`0% – 40%`).
* **Mapped Trunk Drain Gap (`0.20`, $\text{DrainDef}_n$):** Distance to nearest OSM waterway/drain, scaled by stress-scenario drain siltation decay and reduced by `28%` (`× 0.72`) when park detention is enabled within `350 m` of a public park `>= 0.25 ha`.
* **Storm Load (`0.15`, $S(I)$):** Continuous rainfall intensity scalar for $I \in [10, 150]\text{ mm/hr}$:
  $$S(I) = \text{clip}_{[0.10, 1.0]}\left(\left(\frac{I}{110.0}\right)^{0.75}\right)$$

### Risk Tiers
* **Critical:** `WSI >= 0.68`
* **High:** `0.52 <= WSI < 0.68`
* **Moderate:** `0.35 <= WSI < 0.52` (organic contour display cutoff defaults to `0.38`)
* **Low:** `WSI < 0.35`

### Analytical `rain_to_flood_mm` Threshold
For every zone, the engine analytically inverts $S(I)$ to report the rainfall intensity (`mm/hr`) at which that pocket crosses into **High** susceptibility (`WSI >= 0.52`), given its current static drivers and active NbS interventions.

---

## 2. "Fix First" Intervention Priority Score (`IPS`)

$$\text{IPS} = \sqrt{\text{WSI} \cdot \text{Impact}_n}$$

where $\text{Impact}_n = 0.55 \cdot \text{ArterialRoadExposure}_n + 0.25 \cdot \text{ParkNbSFeasibility}_n + 0.10$. This prioritizes flood pockets that both disrupt major arterial roads and have nearby public park space for practical bio-retention retrofits.

---

## 3. Zone-Scale Rational Method & Park Detention Screening

For a 1-hour storm at effective intensity $I_{\text{eff}}$ (`mm/hr`):
* Runoff coefficient: $C = 0.25 + 0.65 \cdot \text{Runoff}_n$
* 1-hour runoff volume (`KL`): $V = C \cdot (I_{\text{eff}} / 1000) \cdot \text{Area}_{m^2}$
* Peak flow (`L/s`): $Q = (V \cdot 1000) / 3600$ — **strictly suppressed whenever zone area exceeds `50 ha`** (`rational_method_max_area_ha = 50.0`) because the Rational Method breaks down on larger catchments.
* Screening park bioswale capacity (`KL`): assumes `15%` of a nearby mapped park (`>= 2,500 m²`, within `350 m`) is converted into a `30 cm` shallow detention basin (`0.15 × park_area_sqm × 0.30`).

---

## 4. Illustrative Stress Scenarios (What-If Only)

| Horizon | Impervious Creep | Storm Intensity Multiplier | Drain Siltation Decay |
| :--- | :--- | :--- | :--- |
| **Baseline (`0 yr`)** | `+0.0%` | `1.00×` | `1.00×` |
| **+2 Yr Stress** | `+2.5%` | `1.04×` | `1.05×` |
| **+5 Yr Stress** | `+6.0%` | `1.10×` | `1.12×` |
| **+10 Yr Stress** | `+11.5%` | `1.18×` | `1.22×` |

These are illustrative stress-test multipliers exposed via `GET /v1/catchments/{slug}/methodology` and should not be cited as downscaled CMIP6 climate projections.

---

## 5. Known Limitations

1. **30 m DEM Resolution:** Copernicus GLO-30 cannot resolve micro-topography such as kerbs, medians, or narrow underpass ramps (hence OSM `layer=-1` is explicitly injected as a structural trap flag).
2. **OSM Trunk-Drain Bias:** OSM reliably maps primary nallahs (e.g., Barapullah) but misses minor colony drains—which is why the offline Street-Level Micro-Drainage Mapper (`extract_micro_drains.py`) was introduced to build a ground-level inlet inventory.
3. **Operational Interventions Not in Static DEM:** Active municipal measures (such as PWD pre-deployed sump pumps at Moolchand Underpass or seasonal desilting) can keep structurally high-risk dips clear during real storms.
4. **Monocular Depth Projection Error:** Street-level micro-drain GPS positions are projected from camera coordinates using `compass_angle` and monocular depth (`~3–16 m`) and carry approximate curb-level uncertainty (`±3–8 m`).

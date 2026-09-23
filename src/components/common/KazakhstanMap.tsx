import { useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Contractor } from "../../types";
import "./KazakhstanMap.css";

type MarkerType = "venue" | "talent" | "service";
type Category = "all" | MarkerType;
type MapMarker = {
  id: string;
  type: MarkerType;
  contractor: Pick<Contractor, "anon_name" | "city" | "categories" | "price_from_kzt">;
  x: number;
  y: number;
  offsetX?: number;
  offsetY?: number;
};

// Display coordinates from the supplied design, not verified geographic locations.
// Pixel offsets keep nearby demo markers independently clickable.
const DEMO_MARKERS: MapMarker[] = [
  { id: "1", type: "talent", x: 75.3, y: 78, offsetX: -24, offsetY: -22, contractor: { anon_name: "Буллма", city: "Алматы", categories: ["Ведущий"], price_from_kzt: 1000000 } },
  { id: "2", type: "venue", x: 76.8, y: 79.5, offsetX: 24, offsetY: -10, contractor: { anon_name: "Иноскэ Хашибира", city: "Алматы", categories: ["Банкетный зал"], price_from_kzt: 2500000 } },
  { id: "3", type: "service", x: 74, y: 76.5, offsetX: -6, offsetY: 32, contractor: { anon_name: "Тони Тони Чоппер", city: "Алматы", categories: ["Флорист"], price_from_kzt: 200000 } },
  { id: "4", type: "talent", x: 62.3, y: 29.4, offsetX: -24, offsetY: -18, contractor: { anon_name: "Санджи Виндсмок", city: "Астана", categories: ["Ведущий"], price_from_kzt: 800000 } },
  { id: "5", type: "service", x: 63.8, y: 27.5, offsetX: 24, offsetY: -10, contractor: { anon_name: "Тодороки Шото", city: "Астана", categories: ["Видеограф"], price_from_kzt: 400000 } },
  { id: "6", type: "service", x: 60.5, y: 31, offsetX: -3, offsetY: 27, contractor: { anon_name: "Хаку", city: "Астана", categories: ["Флорист"], price_from_kzt: 300000 } },
  { id: "7", type: "venue", x: 28.2, y: 34.3, contractor: { anon_name: "Grand Hotel", city: "Актобе", categories: ["Отель"], price_from_kzt: 1200000 } },
  { id: "8", type: "talent", x: 58, y: 83.5, contractor: { anon_name: "Нами", city: "Шымкент", categories: ["Ведущий"], price_from_kzt: 600000 } },
];

const CATEGORIES: { type: Category; label: string }[] = [
  { type: "all", label: "Все" },
  { type: "venue", label: "Площадки" },
  { type: "talent", label: "Артисты" },
  { type: "service", label: "Услуги" },
];

const CITY_LABELS = [
  { name: "Алматы", x: 75.3, y: 80, offsetX: 52, offsetY: 22 },
  { name: "Астана", x: 62.3, y: 31.4, offsetX: 44, offsetY: 22 },
  { name: "Шымкент", x: 58, y: 85.5, offsetX: 0, offsetY: 22 },
  { name: "Караганда", x: 66.3, y: 39.4, offsetX: 36, offsetY: 25 },
  { name: "Актобе", x: 28.2, y: 36.3, offsetX: 0, offsetY: 22 },
];

const priceFormatter = new Intl.NumberFormat("ru-RU");

function MapIcon({ type }: { type: MarkerType | "pin" | "navigation" | "close" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {type === "venue" && <>
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2M10 6h4M10 10h4M10 14h4M10 22v-4h4v4" />
      </>}
      {type === "talent" && <>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
      </>}
      {type === "service" && <>
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
        <circle cx="12" cy="14" r="3" />
      </>}
      {type === "pin" && <>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </>}
      {type === "navigation" && <path d="m3 11 19-9-9 19-2-8-8-2Z" />}
      {type === "close" && <path d="m6 6 12 12M18 6 6 18" />}
    </svg>
  );
}

export function KazakhstanMap({ className }: { className?: string }) {
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);
  const markerButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const componentId = useId();
  const cardId = `${componentId}-card`;
  const filteredMarkers = DEMO_MARKERS.filter((marker) => activeCategory === "all" || marker.type === activeCategory);

  function closeCard() {
    if (selectedMarker) markerButtons.current[selectedMarker.id]?.focus();
    setSelectedMarker(null);
  }

  return (
    <section
      className={["kazakhstan-map", className].filter(Boolean).join(" ")}
      aria-label="Подрядчики на карте Казахстана"
      onKeyDown={(event) => {
        if (event.key === "Escape" && selectedMarker) {
          event.stopPropagation();
          closeCard();
        }
      }}
    >
      <div className="kazakhstan-map__filters" role="group" aria-label="Категории на карте">
        {CATEGORIES.map(({ type, label }) => (
          <button
            key={type}
            type="button"
            className={`kazakhstan-map__filter kazakhstan-map__filter--${type}`}
            aria-pressed={activeCategory === type}
            onClick={() => {
              setActiveCategory(type);
              if (type !== "all" && selectedMarker?.type !== type) setSelectedMarker(null);
            }}
          >
            {type !== "all" && <MapIcon type={type} />}
            {label}
          </button>
        ))}
      </div>

      <div className="kazakhstan-map__viewport" tabIndex={0} role="group" aria-label="Интерактивная карта" aria-describedby={`${componentId}-hint`} onClick={() => setSelectedMarker(null)}>
        <div className="kazakhstan-map__canvas">
          <svg viewBox="0 0 1000 550" className="kazakhstan-map__drawing" aria-hidden="true" focusable="false">
            <path
              d="M 30.0 249.7 L 63.9 282.4 L 86.6 330.4 L 113.3 367.9 L 117.1 388.2 L 110.7 399.4 L 113.3 401.7 L 137.2 408.0 L 159.4 423.6 L 184.7 435.5 L 195.0 461.1 L 210.5 479.3 L 232.3 486.2 L 236.2 437.5 L 241.0 415.7 L 256.1 367.9 L 267.2 358.4 L 293.6 356.6 L 303.7 351.0 L 314.7 374.9 L 329.0 394.1 L 351.3 401.7 L 363.0 369.2 L 372.9 366.2 L 375.1 334.1 L 392.4 349.9 L 428.4 357.8 L 446.5 367.9 L 485.3 408.6 L 504.0 461.2 L 541.6 520.0 L 564.6 493.3 L 585.8 483.4 L 613.0 452.4 L 632.9 455.3 L 666.9 437.0 L 684.4 435.5 L 714.5 447.9 L 728.1 437.0 L 755.8 452.4 L 772.8 423.5 L 796.3 408.5 L 827.2 384.8 L 846.9 386.8 L 864.6 383.1 L 874.8 367.9 L 900.1 352.4 L 931.1 322.8 L 970.0 300.3 L 956.7 283.4 L 950.9 251.4 L 946.2 232.8 L 924.5 214.0 L 903.1 179.4 L 874.8 165.2 L 850.2 150.2 L 818.3 120.9 L 779.6 97.6 L 751.0 96.0 L 735.7 65.3 L 708.2 63.8 L 661.8 48.4 L 613.2 31.1 L 565.4 30.0 L 533.9 44.7 L 503.1 61.6 L 470.3 63.8 L 444.2 102.4 L 399.7 128.6 L 375.1 165.2 L 333.7 156.9 L 286.1 167.2 L 232.3 165.2 L 203.4 168.2 L 162.0 156.5 L 137.1 148.3 L 124.1 151.6 L 101.3 161.1 L 89.5 182.1 L 76.3 210.0 L 57.0 232.2 L 30.0 249.7 Z"
              fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2.5"
            />
          </svg>

          {CITY_LABELS.map((city) => (
            <span key={city.name} className="kazakhstan-map__city" style={{ left: `calc(${city.x}% + ${city.offsetX}px)`, top: `calc(${city.y}% + ${city.offsetY}px)` }}>{city.name}</span>
          ))}

          {filteredMarkers.map((marker) => {
            const isSelected = selectedMarker?.id === marker.id;
            return (
              <button
                key={marker.id}
                ref={(element) => { markerButtons.current[marker.id] = element; }}
                type="button"
                className={`kazakhstan-map__marker kazakhstan-map__marker--${marker.type}`}
                style={{ left: `calc(${marker.x}% + ${marker.offsetX ?? 0}px)`, top: `calc(${marker.y}% + ${marker.offsetY ?? 0}px)` } as CSSProperties}
                aria-label={`${marker.contractor.anon_name}, ${marker.contractor.city}, от ${priceFormatter.format(marker.contractor.price_from_kzt)} тенге`}
                aria-expanded={isSelected}
                aria-controls={isSelected ? cardId : undefined}
                title={`${marker.contractor.anon_name} · ${marker.contractor.city}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedMarker(isSelected ? null : marker);
                }}
              >
                <span className="kazakhstan-map__marker-disc"><MapIcon type={marker.type} /></span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="kazakhstan-map__sr-only" id={`${componentId}-hint`}>Демонстрационные маркеры. Нажмите для просмотра. На узком экране прокрутите карту по горизонтали.</p>
      {selectedMarker ? (
        <div id={cardId} className="kazakhstan-map__card" role="region" aria-label="Информация о подрядчике" aria-live="polite">
          <div className="kazakhstan-map__card-meta">
            <span className="kazakhstan-map__category">{selectedMarker.contractor.categories[0]}</span>
            <span className="kazakhstan-map__location"><MapIcon type="pin" />{selectedMarker.contractor.city}</span>
          </div>
          <h3>{selectedMarker.contractor.anon_name}</h3>
          <p className="kazakhstan-map__price">От {priceFormatter.format(selectedMarker.contractor.price_from_kzt)} ₸</p>
          <button className="kazakhstan-map__close" type="button" aria-label="Закрыть карточку" onClick={closeCard}><MapIcon type="close" /></button>
        </div>
      ) : (
        <p className="kazakhstan-map__hint"><MapIcon type="navigation" /><span>Нажмите на маркер для просмотра</span></p>
      )}
    </section>
  );
}

export default KazakhstanMap;

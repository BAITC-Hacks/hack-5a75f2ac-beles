import { useId, useRef, useState } from "react";
import type { Contractor } from "../../types";

type MarkerType = "venue" | "talent" | "service";

type DemoMarker = Pick<
  Contractor,
  "id" | "anon_name" | "city" | "price_from_kzt"
> & {
  type: MarkerType;
  // Coordinates are percentages of the SVG viewBox.
  x: number;
  y: number;
};

const DEMO_MARKERS: DemoMarker[] = [
  { id: "demo-1", anon_name: "Зал у Каспия", type: "venue", city: "Атырау", price_from_kzt: 250000, x: 18, y: 53 },
  { id: "demo-2", anon_name: "Ведущий Арман", type: "talent", city: "Актобе", price_from_kzt: 120000, x: 29, y: 36 },
  { id: "demo-3", anon_name: "Свет и звук", type: "service", city: "Астана", price_from_kzt: 90000, x: 61, y: 33 },
  { id: "demo-4", anon_name: "Студия декора", type: "service", city: "Караганда", price_from_kzt: 75000, x: 64, y: 47 },
  { id: "demo-5", anon_name: "Группа Saz", type: "talent", city: "Шымкент", price_from_kzt: 180000, x: 55, y: 77 },
  { id: "demo-6", anon_name: "Сад Алматы", type: "venue", city: "Алматы", price_from_kzt: 350000, x: 79, y: 72 },
];

const MARKER_STYLES: Record<MarkerType, { label: string; color: string; symbol: string }> = {
  venue: { label: "Площадки", color: "#047857", symbol: "◆" },
  talent: { label: "Артисты и ведущие", color: "#7c3aed", symbol: "★" },
  service: { label: "Услуги", color: "#0369a1", symbol: "✦" },
};

const priceFormatter = new Intl.NumberFormat("ru-KZ");

export function KazakhstanMap({ className }: { className?: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const markerButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const componentId = useId();
  const titleId = `${componentId}-title`;
  const cardId = `${componentId}-card`;
  const selectedMarker = DEMO_MARKERS.find((marker) => marker.id === selectedId);

  function closeCard() {
    if (selectedId) markerButtons.current[selectedId]?.focus();
    setSelectedId(null);
  }

  return (
    <section
      className={className}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === "Escape" && selectedMarker) {
          event.stopPropagation();
          closeCard();
        }
      }}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #dbe7e3",
        borderRadius: 24,
        background: "#f8fbfa",
        color: "#16382e",
        fontFamily: "inherit",
      }}
    >
      <header style={{ padding: "24px 24px 0" }}>
        <h2 id={titleId} style={{ margin: 0, fontSize: 22 }}>
          Подрядчики на карте Казахстана
        </h2>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "#526c63" }}>
          Выберите маркер, чтобы посмотреть имя и стоимость услуг.
        </p>
      </header>

      <div
        onClick={() => setSelectedId(null)}
        style={{ position: "relative", width: "100%", aspectRatio: "5 / 3" }}
      >
        <svg
          viewBox="0 0 1000 600"
          aria-hidden="true"
          focusable="false"
          style={{ display: "block", width: "100%", height: "100%" }}
        >
          {/* A simplified, decorative outline; not a geographic boundary dataset. */}
          <path
            d="M 76 244 L 103 217 L 92 185 L 130 156 L 163 167
               L 184 135 L 226 143 L 251 119 L 282 136 L 316 117
               L 351 141 L 380 129 L 402 98 L 441 107 L 462 80
               L 499 85 L 520 62 L 557 73 L 587 65 L 609 97
               L 650 100 L 669 129 L 708 113 L 735 140 L 768 135
               L 794 160 L 824 151 L 844 184 L 882 196 L 886 228
               L 926 244 L 907 272 L 942 291 L 920 320 L 877 332
               L 870 363 L 842 383 L 849 413 L 820 444 L 773 437
               L 744 459 L 703 448 L 674 473 L 635 456 L 610 480
               L 572 475 L 551 501 L 522 484 L 501 454 L 467 444
               L 448 416 L 414 409 L 390 384 L 367 397 L 337 376
               L 313 398 L 302 446 L 265 456 L 260 426 L 222 421
               L 217 452 L 180 454 L 177 416 L 147 399 L 158 369
               L 141 343 L 153 317 L 124 310 L 111 279 L 85 274 Z"
            fill="#d9eee3"
            stroke="#75a78f"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M 105 349 Q 125 364 116 390 Q 108 412 126 441
               L 115 483 Q 73 476 66 442 Q 80 418 67 388 Q 74 359 105 349 Z"
            fill="#dceef5"
          />
          <path
            d="M 633 378 Q 670 383 705 370 L 724 375
               Q 692 395 655 391 Z"
            fill="#b6dbe8"
          />
          <text x="455" y="325" textAnchor="middle" fill="#456c5a" fontSize="22" letterSpacing="5">
            ҚАЗАҚСТАН
          </text>
        </svg>

        {DEMO_MARKERS.map((marker) => {
          const markerStyle = MARKER_STYLES[marker.type];
          const isSelected = selectedId === marker.id;

          return (
            <button
              key={marker.id}
              ref={(element) => { markerButtons.current[marker.id] = element; }}
              type="button"
              aria-label={`${marker.anon_name}, ${marker.city}, от ${priceFormatter.format(marker.price_from_kzt)} тенге`}
              aria-expanded={isSelected}
              aria-controls={isSelected ? cardId : undefined}
              title={`${marker.anon_name} · ${marker.city}`}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedId(isSelected ? null : marker.id);
              }}
              style={{
                position: "absolute",
                left: `${marker.x}%`,
                top: `${marker.y}%`,
                transform: "translate(-50%, -50%)",
                width: 44,
                height: 44,
                padding: 0,
                display: "grid",
                placeItems: "center",
                border: 0,
                borderRadius: "50%",
                background: "transparent",
                cursor: "pointer",
                zIndex: isSelected ? 2 : 1,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: isSelected ? 34 : 28,
                  height: isSelected ? 34 : 28,
                  borderRadius: "50%",
                  border: "3px solid #fff",
                  background: markerStyle.color,
                  color: "#fff",
                  fontSize: 16,
                  boxShadow: isSelected
                    ? `0 0 0 4px ${markerStyle.color}33, 0 3px 10px #16382e30`
                    : "0 3px 10px #16382e30",
                }}
              >
                {markerStyle.symbol}
              </span>
            </button>
          );
        })}

        {selectedMarker && (
          <div
            id={cardId}
            role="region"
            aria-label="Информация о подрядчике"
            aria-live="polite"
            onClick={(event) => event.stopPropagation()}
            style={{
              position: "absolute",
              bottom: 8,
              left: 16,
              zIndex: 3,
              boxSizing: "border-box",
              width: 270,
              maxWidth: "calc(100% - 32px)",
              padding: "16px 48px 16px 18px",
              background: "#fff",
              border: "1px solid #dbe7e3",
              borderRadius: 16,
              boxShadow: "0 12px 32px #16382e24",
            }}
          >
            <button
              type="button"
              aria-label="Закрыть карточку"
              onClick={closeCard}
              style={{ position: "absolute", right: 2, top: 2, width: 44, height: 44, border: 0, borderRadius: 12, background: "transparent", color: "#526c63", fontSize: 24, cursor: "pointer" }}
            >
              ×
            </button>
            <p style={{ margin: "0 0 6px", color: "#526c63", fontSize: 12 }}>
              {selectedMarker.city} · {MARKER_STYLES[selectedMarker.type].label}
            </p>
            <h3 style={{ margin: "0 0 8px", fontSize: 17 }}>{selectedMarker.anon_name}</h3>
            <p style={{ margin: 0, color: "#047857", fontWeight: 700, fontSize: 16 }}>
              от {priceFormatter.format(selectedMarker.price_from_kzt)} ₸
            </p>
          </div>
        )}
      </div>

      <footer style={{ padding: "8px 24px 20px" }}>
        <ul aria-label="Типы подрядчиков" style={{ display: "flex", flexWrap: "wrap", gap: "12px 20px", padding: 0, margin: 0, listStyle: "none" }}>
          {(Object.keys(MARKER_STYLES) as MarkerType[]).map((type) => (
            <li key={type} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13 }}>
              <span aria-hidden="true" style={{ color: MARKER_STYLES[type].color }}>{MARKER_STYLES[type].symbol}</span>
              {MARKER_STYLES[type].label}
            </li>
          ))}
        </ul>
        <p style={{ margin: "12px 0 0", color: "#526c63", fontSize: 12 }}>
          Схематичная карта · 6 демо-подрядчиков · Цены указаны для примера
        </p>
      </footer>
    </section>
  );
}

export default KazakhstanMap;

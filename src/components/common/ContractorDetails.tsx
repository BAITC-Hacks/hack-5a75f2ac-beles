import { useEffect, useRef } from "react";
import type { Contractor, MatchResponse } from "../../types";
import { getContractorImage } from "../../data/contractor-images";
import "./ContractorDetails.css";

export type ContractorSelection = {
  contractor: Pick<Contractor, "id" | "anon_name" | "categories" | "city" | "price_from_kzt"> & Partial<Contractor>;
  source: "catalog" | "demo";
  date?: string;
  explanation?: string;
  explanationSource?: MatchResponse["explanation_source"];
};

type ContractorDetailsProps = {
  selection: ContractorSelection;
  onBack: () => void;
  targetId: string;
};

const MIN_DATE = "2026-09-23";
const MAX_DATE = "2026-12-31";
const priceFormatter = new Intl.NumberFormat("ru-KZ");
const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const monthFormatter = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });
const shortDateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", weekday: "short", timeZone: "UTC" });

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T12:00:00Z`));
}

export default function ContractorDetails({ selection, onBack, targetId }: ContractorDetailsProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const { contractor, source, date, explanation, explanationSource } = selection;
  const photo = getContractorImage(contractor);
  const isCatalog = source === "catalog";
  const hasCalendar = isCatalog && Array.isArray(contractor.busy_dates);
  const requestedDateInRange = Boolean(date && isValidDate(date) && date >= MIN_DATE && date <= MAX_DATE);
  const requestedDateBusy = Boolean(date && hasCalendar && contractor.busy_dates?.includes(date));
  const busyDates = isCatalog ? [...new Set(contractor.busy_dates ?? [])].filter(isValidDate).sort() : [];
  const busyMonths = new Map<string, string[]>();
  for (const busyDate of busyDates) {
    const month = busyDate.slice(0, 7);
    const dates = busyMonths.get(month) ?? [];
    dates.push(busyDate);
    busyMonths.set(month, dates);
  }

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sectionRef.current?.focus({ preventScroll: true });
    sectionRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }, [selection]);

  return (
    <section ref={sectionRef} id={targetId} tabIndex={-1} className="contractor-details" aria-labelledby={`${targetId}-title`}>
      <div className="contractor-details__topline">
        <p className="contractor-details__eyebrow">{isCatalog ? "Профиль из каталога" : "Карточка на демо-карте"}</p>
        <button type="button" className="contractor-details__back" onClick={onBack}>
          <span aria-hidden="true">↑</span> Назад к карточке
        </button>
      </div>

      <header className="contractor-details__header">
        <div className="contractor-details__identity">
          <figure className="contractor-details__photo">
            <img src={photo.src} alt={photo.alt} decoding="async" style={{ objectPosition: photo.position }} />
            <figcaption>ИИ-иллюстрация</figcaption>
          </figure>
          <div>
            <div className="contractor-details__badges">
              <span>{contractor.city}</span>
              {isCatalog && contractor.synthetic && <span className="contractor-details__synthetic">Синтетическая запись</span>}
            </div>
            <h2 id={`${targetId}-title`}>{contractor.anon_name}</h2>
            <p className="contractor-details__categories">{contractor.categories.join(" · ")}</p>
          </div>
        </div>
        <div className="contractor-details__price-block">
          <span className="contractor-details__price-label">Стоимость от</span>
          <p className="contractor-details__price">{priceFormatter.format(contractor.price_from_kzt)} ₸</p>
          {!isCatalog && <p className="contractor-details__note">Демонстрационная цена</p>}
          {isCatalog && contractor.price_imputed && <p className="contractor-details__note">Цена заполнена при подготовке датасета.</p>}
        </div>
      </header>
      <p className="contractor-details__image-note">Изображение создано ИИ для оформления каталога и не является реальной фотографией подрядчика.</p>

      {!isCatalog ? (
        <div className="contractor-details__notice">
          <h3>Демонстрационная карточка, полного профиля в каталоге нет</h3>
          <p>Этот маркер показывает, как работает карта. Описание услуг, языки, длительность и календарь занятости для него не заданы.</p>
        </div>
      ) : (
        <>
          {(contractor.synthetic || contractor.city_imputed) && (
            <div className="contractor-details__data-notes">
              {contractor.synthetic && <p>Синтетический профиль добавлен в датасет для демонстрации подбора.</p>}
              {contractor.city_imputed && <p>Город заполнен при подготовке датасета.</p>}
            </div>
          )}

          <div className="contractor-details__body">
            <div className="contractor-details__description">
              <h3>О подрядчике</h3>
              <p>{contractor.description?.trim() || "Описание в каталоге не указано."}</p>
              {explanation && (
                <div className="contractor-details__explanation">
                  <h3>{explanationSource === "openai" ? "Объяснение ИИ" : "По данным каталога"}</h3>
                  <p>{explanation}</p>
                </div>
              )}
            </div>

            <dl className="contractor-details__facts">
              <div>
                <dt>Город</dt>
                <dd>{contractor.city}</dd>
              </div>
              <div>
                <dt>Форматы событий</dt>
                <dd>{contractor.event_formats?.length ? contractor.event_formats.join(" · ") : "Не указаны"}</dd>
              </div>
              <div>
                <dt>Языки</dt>
                <dd>{contractor.languages?.length ? contractor.languages.join(" · ") : "Не указаны"}</dd>
              </div>
              <div>
                <dt>Длительность работы</dt>
                <dd>{contractor.max_hours === null ? "Работа не привязана к присутствию" : typeof contractor.max_hours === "number" ? `До ${priceFormatter.format(contractor.max_hours)} ч` : "Не указана"}</dd>
              </div>
            </dl>
          </div>

          <div className="contractor-details__availability">
            <h3>Занятость</h3>
            <p className="contractor-details__calendar-window">Календарь датасета: 23 сентября — 31 декабря 2026.</p>
            {date && requestedDateInRange && hasCalendar && (
              <p className={`contractor-details__date-status ${requestedDateBusy ? "contractor-details__date-status--busy" : "contractor-details__date-status--free"}`}>
                <span aria-hidden="true">{requestedDateBusy ? "×" : "✓"}</span>
                {formatDate(date)} — {requestedDateBusy ? "занят по календарю каталога" : "свободен по календарю каталога"}.
              </p>
            )}
            {date && !requestedDateInRange && <p className="contractor-details__note">Выбранная дата вне периода каталога. Для неё нет данных о доступности.</p>}
            {!hasCalendar ? <p className="contractor-details__note">Календарь занятости в профиле не указан.</p> : (
              <details key={contractor.id} className="contractor-details__calendar">
                <summary>Занятые даты в каталоге <span>({busyDates.length})</span></summary>
                {busyDates.length === 0 ? <p>Занятые даты не отмечены.</p> : (
                  <div className="contractor-details__months">
                    {[...busyMonths].map(([month, dates]) => (
                      <section key={month} className="contractor-details__month" aria-labelledby={`${targetId}-month-${month}`}>
                        <h4 id={`${targetId}-month-${month}`}>{monthFormatter.format(new Date(`${month}-01T12:00:00Z`))}</h4>
                        <ul>
                          {dates.map((busyDate) => (
                            <li key={busyDate} className={busyDate === date ? "contractor-details__selected-day" : undefined}>
                              <time dateTime={busyDate} aria-label={`${formatDate(busyDate)} — занят`}>
                                {shortDateFormatter.format(new Date(`${busyDate}T12:00:00Z`))}
                              </time>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </details>
            )}
          </div>
        </>
      )}
    </section>
  );
}

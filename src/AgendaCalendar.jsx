import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Check, ChevronLeft, ChevronRight, Clock, Plus, Trash2, X } from 'lucide-react';
import { useI18n } from './i18n';

const HOUR_OFFSETS = [-2, -1, 0, 1, 2];

function toLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function makeDefaultEventTime() {
  const soon = new Date(Date.now() + 15 * 60 * 1000);
  return `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`;
}

export default function AgendaCalendar({ events = [], onAddEvent, onDeleteEvent, onToggleEvent }) {
  const { t, locale } = useI18n();
  const [viewMode, setViewMode] = useState('Day');
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateKey(new Date()));
  const [isAdding, setIsAdding] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventTime, setEventTime] = useState(makeDefaultEventTime);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const timePickerRef = useRef(null);
  const hourColRef = useRef(null);
  const minColRef = useRef(null);
  const wheelAccumRef = useRef({ hour: 0, minute: 0, lastAt: 0 });

  const [selectedHour, selectedMinute] = useMemo(() => {
    const [h = '09', m = '00'] = String(eventTime || '09:00').split(':');
    return [h.padStart(2, '0'), m.padStart(2, '0')];
  }, [eventTime]);

  const stepHour = (delta) => {
    setEventTime((prev) => {
      const [h = '09', m = '00'] = String(prev || '09:00').split(':');
      const next = (Number(h) + delta + 24) % 24;
      return `${String(next).padStart(2, '0')}:${m.padStart(2, '0')}`;
    });
  };

  const stepMinute = (delta) => {
    setEventTime((prev) => {
      const [h = '09', m = '00'] = String(prev || '09:00').split(':');
      const next = (Number(m) + delta + 60) % 60;
      return `${h.padStart(2, '0')}:${String(next).padStart(2, '0')}`;
    });
  };

  useEffect(() => {
    if (!timePickerOpen) return undefined;
    const handleOutside = (e) => {
      if (timePickerRef.current && !timePickerRef.current.contains(e.target)) {
        setTimePickerOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setTimePickerOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);

    const makeWheelHandler = (kind, stepFn) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dy = e.deltaY;
      if (!dy) return;
      const now = performance.now();
      const acc = wheelAccumRef.current;
      // Mouse wheel notches are typically >= 50px; trackpads send small deltas.
      if (Math.abs(dy) >= 40) {
        if (now - acc.lastAt < 45) return;
        acc.lastAt = now;
        acc[kind] = 0;
        stepFn(dy > 0 ? 1 : -1);
        return;
      }
      acc[kind] += dy;
      if (Math.abs(acc[kind]) >= 28) {
        const dir = acc[kind] > 0 ? 1 : -1;
        acc[kind] = 0;
        stepFn(dir);
      }
    };

    const hEl = hourColRef.current;
    const mEl = minColRef.current;
    const onHourWheel = makeWheelHandler('hour', stepHour);
    const onMinWheel = makeWheelHandler('minute', stepMinute);
    hEl?.addEventListener('wheel', onHourWheel, { passive: false });
    mEl?.addEventListener('wheel', onMinWheel, { passive: false });

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
      hEl?.removeEventListener('wheel', onHourWheel);
      mEl?.removeEventListener('wheel', onMinWheel);
    };
  }, [timePickerOpen]);

  useEffect(() => {
    if (!isAdding) setTimePickerOpen(false);
  }, [isAdding]);

  const todayKey = toLocalDateKey(new Date());
  const selectedDateObject = new Date(`${selectedDate}T12:00:00`);
  const monthTitle = selectedDateObject.toLocaleDateString(locale, { month: 'long' });
  const monthYear = selectedDateObject.getFullYear();

  const weekDays = useMemo(() => {
    const start = new Date(selectedDateObject);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      return date;
    });
  }, [selectedDate]);

  const monthDays = useMemo(() => {
    const monthStart = new Date(selectedDateObject.getFullYear(), selectedDateObject.getMonth(), 1, 12);
    const offset = (monthStart.getDay() + 6) % 7;
    const daysInMonth = new Date(selectedDateObject.getFullYear(), selectedDateObject.getMonth() + 1, 0).getDate();
    const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;
    return Array.from({ length: cellCount }, (_, index) => {
      const date = new Date(monthStart);
      date.setDate(1 - offset + index);
      return date;
    });
  }, [selectedDate]);

  const eventDateKey = (event) => event?.date === 'Bugün' || event?.date === 'Today' || !event?.date ? todayKey : String(event.date).slice(0, 10);
  const eventsForDate = events
    .filter((event) => eventDateKey(event) === selectedDate)
    .sort((a, b) => String(a?.time || '').localeCompare(String(b?.time || '')));

  const moveDate = (amount) => {
    const next = new Date(selectedDateObject);
    if (viewMode === 'Month') next.setMonth(next.getMonth() + amount, 1);
    else next.setDate(next.getDate() + amount);
    setSelectedDate(toLocalDateKey(next));
  };

  const addEvent = (event) => {
    event.preventDefault();
    const title = eventTitle.trim();
    if (!title || !eventTime) return;
    onAddEvent?.({ title, date: selectedDate, time: eventTime, notified: false });
    setEventTitle('');
    setIsAdding(false);
  };

  const hasEventsOn = (date) => events.some((event) => eventDateKey(event) === toLocalDateKey(date));

  return (
    <div className="agenda-tab-view">
      <div className="agenda-top-row">
        <div className="agenda-title-group">
          <span className="agenda-eyebrow">{t('agenda.eyebrow')}</span>
          <div className="agenda-month-heading">
            <h2>{monthTitle} <span className="clock-number-text">{monthYear}</span></h2>
            <button type="button" className="agenda-nav-btn" onClick={() => moveDate(-1)} aria-label={t('agenda.prevPeriod')}><ChevronLeft size={15} /></button>
            <button type="button" className="agenda-nav-btn" onClick={() => moveDate(1)} aria-label={t('agenda.nextPeriod')}><ChevronRight size={15} /></button>
            <button type="button" className="agenda-today-btn" onClick={() => setSelectedDate(todayKey)}>{t('agenda.today')}</button>
          </div>
        </div>

        <div className="agenda-controls-right">
          <div className="agenda-day-month-pill">
            <button type="button" className={`dm-btn ${viewMode === 'Day' ? 'active' : ''}`} onClick={() => setViewMode('Day')} aria-pressed={viewMode === 'Day'}>{t('agenda.day')}</button>
            <button type="button" className={`dm-btn ${viewMode === 'Month' ? 'active' : ''}`} onClick={() => setViewMode('Month')} aria-pressed={viewMode === 'Month'}>{t('agenda.month')}</button>
          </div>
          <button
            type="button"
            className="agenda-plus-circle"
            onClick={() => {
              setEventTime(makeDefaultEventTime());
              setViewMode('Day');
              setIsAdding((value) => !value);
            }}
            title={t('agenda.addEvent')}
            aria-label={t('agenda.addEvent')}
          >
            {isAdding ? <X size={15} color="#fff" /> : <Plus size={16} strokeWidth={2.5} color="#eaf2f9" />}
          </button>
        </div>
      </div>

      {viewMode === 'Day' ? (
        <>
          <div className="agenda-week-strip">
            {weekDays.map((date) => {
              const key = toLocalDateKey(date);
              return (
                <button key={key} type="button" className={`agenda-date-cell ${key === selectedDate ? 'selected' : ''} ${key === todayKey ? 'today' : ''}`} onClick={() => setSelectedDate(key)} aria-pressed={key === selectedDate}>
                  <span>{date.toLocaleDateString(locale, { weekday: 'short' }).replace('.', '')}</span>
                  <strong>{date.getDate()}</strong>
                  {hasEventsOn(date) && <i />}
                </button>
              );
            })}
          </div>
          {isAdding && (
            <form className="agenda-quick-add" onSubmit={addEvent}>
              <input
                autoFocus
                value={eventTitle}
                onChange={(event) => setEventTitle(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Escape') setIsAdding(false); }}
                placeholder={t('agenda.eventNamePlaceholder')}
                aria-label={t('agenda.eventNamePlaceholder')}
              />
              <div className="agenda-time-picker-wrap" ref={timePickerRef}>
                <button
                  type="button"
                  className={`agenda-time-trigger ${timePickerOpen ? 'is-open' : ''}`}
                  onClick={() => setTimePickerOpen((v) => !v)}
                  onWheel={(e) => {
                    e.preventDefault();
                    const total = Number(selectedHour) * 60 + Number(selectedMinute);
                    const step = e.deltaY < 0 ? -1 : 1;
                    const next = (total + step + 1440) % 1440;
                    const nh = String(Math.floor(next / 60)).padStart(2, '0');
                    const nm = String(next % 60).padStart(2, '0');
                    setEventTime(`${nh}:${nm}`);
                  }}
                  aria-label={t('agenda.eventTimeAria')}
                  aria-expanded={timePickerOpen}
                >
                  <span className="agenda-time-value">{selectedHour}:{selectedMinute}</span>
                  <Clock size={12} strokeWidth={2} />
                </button>
                {timePickerOpen && (
                  <div className="agenda-time-popover" role="dialog" aria-label={t('agenda.eventTimeAria')}>
                    <div className="agenda-time-lens" aria-hidden="true" />
                    <div className="agenda-time-col" ref={hourColRef}>
                      {HOUR_OFFSETS.map((off) => {
                        const val = (Number(selectedHour) + off + 24) % 24;
                        const label = String(val).padStart(2, '0');
                        return (
                          <button
                            key={off}
                            type="button"
                            className={`agenda-time-opt ${off === 0 ? 'is-selected' : Math.abs(off) === 2 ? 'is-far' : ''}`}
                            onClick={() => setEventTime(`${label}:${selectedMinute}`)}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <span className="agenda-time-col-sep" aria-hidden="true">:</span>
                    <div className="agenda-time-col" ref={minColRef}>
                      {HOUR_OFFSETS.map((off) => {
                        const val = (Number(selectedMinute) + off + 60) % 60;
                        const label = String(val).padStart(2, '0');
                        return (
                          <button
                            key={off}
                            type="button"
                            className={`agenda-time-opt ${off === 0 ? 'is-selected' : Math.abs(off) === 2 ? 'is-far' : ''}`}
                            onClick={() => {
                              setEventTime(`${selectedHour}:${label}`);
                              if (off === 0) setTimePickerOpen(false);
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <button type="submit" className="agenda-submit-btn" disabled={!eventTitle.trim()}>
                <Check size={14} /> {t('agenda.add')}
              </button>
            </form>
          )}
          <div className="agenda-event-list">
            {eventsForDate.length ? eventsForDate.map((event, index) => {
              const titleText = event.title || t('agenda.eventFallback');
              return (
              <div className={`agenda-event-card ${event.completed ? 'is-completed' : ''}`} key={event.id || `${event.title}-${index}`}>
                <button
                  type="button"
                  className={`agenda-event-check ${event.completed ? 'is-checked' : ''}`}
                  onClick={() => onToggleEvent?.(event.id)}
                  aria-label={event.completed ? t('agenda.markIncomplete', { title: titleText }) : t('agenda.markComplete', { title: titleText })}
                  aria-pressed={Boolean(event.completed)}
                  title={event.completed ? t('agenda.completed') : t('agenda.markAsCompleted')}
                >
                  {event.completed && <Check size={11} strokeWidth={3} />}
                </button>
                <span className="agenda-event-time">{event.time || '09:00'}</span>
                <i className="agenda-event-accent" />
                <div><strong title={event.title || String(event)}>{event.title || event}</strong><small className={selectedDate === todayKey ? '' : 'clock-number-text'}>{selectedDate === todayKey ? t('agenda.today') : selectedDateObject.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}</small></div>
                <button type="button" className="agenda-event-delete" onClick={() => onDeleteEvent?.(event.id)} aria-label={t('agenda.deleteEventAria', { title: titleText })} title={t('agenda.deleteEvent')}><Trash2 size={14} /></button>
              </div>
              );
            }) : (
              <div className="agenda-empty-state">
                <span className="agenda-empty-icon"><Calendar size={19} strokeWidth={1.8} /></span>
                <span>{t('agenda.noEvents')}</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="agenda-month-grid" style={{ gridTemplateRows: `14px repeat(${monthDays.length / 7}, minmax(0, 1fr))` }}>
          {t('agenda.weekdays').map((day, index) => <span className="agenda-weekday-label" key={`${day}-${index}`}>{day}</span>)}
          {monthDays.map((date) => {
            const key = toLocalDateKey(date);
            return (
              <button key={key} type="button" className={`agenda-month-day ${date.getMonth() !== selectedDateObject.getMonth() ? 'outside' : ''} ${key === selectedDate ? 'selected' : ''} ${key === todayKey ? 'today' : ''}`} onClick={() => setSelectedDate(key)} aria-pressed={key === selectedDate}>
                {date.getDate()}{hasEventsOn(date) && <i />}
              </button>
            );
          })}
        </div>
      )}

      <div className="agenda-local-label">{t('agenda.localLabel')}</div>
    </div>
  );
}

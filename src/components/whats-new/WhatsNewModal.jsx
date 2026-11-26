import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import BedoLogoMark from '../BedoLogoMark';
import { resolveRoboAppearance } from '../../roboAppearance.mjs';
import WhatsNewVisualStage from './WhatsNewVisualStage';
import './whats-new.css';

function pickText(obj, langCode) {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return langCode === 'tr' ? obj.tr || obj.en || '' : obj.en || obj.tr || '';
}

export function WhatsNewShowcaseCard({
  release,
  langCode = 'tr',
  roboAppearance,
  isModal = false,
  onContinue,
  onNavigateTab,
}) {
  const highlights = Array.isArray(release?.highlights) ? release.highlights : [];
  const [step, setStep] = useState(0);
  const isTr = langCode === 'tr';
  const resolvedRobo = resolveRoboAppearance(roboAppearance);

  useEffect(() => {
    setStep(0);
  }, [release?.version]);

  useEffect(() => {
    if (!isModal) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onContinue?.();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setStep((s) => Math.min(highlights.length - 1, s + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setStep((s) => Math.max(0, s - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isModal, highlights.length, onContinue]);

  if (!release || highlights.length === 0) return null;
  const activeItem = highlights[step] || highlights[0];
  const isLast = step >= highlights.length - 1;

  return (
    <div
      className={`wn-sheet ${isModal ? 'is-modal' : 'is-embedded'}`}
      style={resolvedRobo.cssVars}
    >
      {/* Top minimal Apple-style bar: user's Bedo mark + version on left, pips in center, close on right */}
      <div className="wn-top-bar">
        <div className="wn-brand-chip">
          <BedoLogoMark size={20} appearance={resolvedRobo} />
          <span>Bedo {release.version}</span>
        </div>

        {highlights.length > 1 && (
          <div className="wn-pips" role="tablist">
            {highlights.map((item, idx) => (
              <button
                key={item.id || idx}
                type="button"
                role="tab"
                aria-selected={idx === step}
                className={`wn-pip ${idx === step ? 'is-active' : idx < step ? 'is-done' : ''}`}
                onClick={() => setStep(idx)}
                aria-label={pickText(item.title, langCode)}
              />
            ))}
          </div>
        )}

        {isModal && onContinue ? (
          <button
            type="button"
            className="wn-icon-close"
            onClick={onContinue}
            aria-label={isTr ? 'Kapat' : 'Close'}
          >
            <X size={14} />
          </button>
        ) : (
          <span className="wn-top-spacer" />
        )}
      </div>

      {/* Single clean animated hero stage using user's Bedo */}
      <WhatsNewVisualStage
        preset={activeItem.preset}
        outfit={resolvedRobo.outfit}
        seasonalOutfits={resolvedRobo.seasonalOutfits}
      />

      {/* Minimal centered Apple typography */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeItem.id || step}
          className="wn-copy"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.18 }}
        >
          <h3>{pickText(activeItem.title, langCode)}</h3>
          <p>{pickText(activeItem.subtitle, langCode)}</p>
        </motion.div>
      </AnimatePresence>

      {/* Clean footer */}
      <div className="wn-bottom-bar">
        <div className="wn-bottom-left">
          {step > 0 ? (
            <button
              type="button"
              className="wn-btn-ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              <ArrowLeft size={14} />
              <span>{isTr ? 'Geri' : 'Back'}</span>
            </button>
          ) : activeItem.action?.tab && onNavigateTab ? (
            <button
              type="button"
              className="wn-btn-ghost"
              onClick={() => onNavigateTab(activeItem.action.tab)}
            >
              <span>{pickText(activeItem.action.label, langCode)}</span>
            </button>
          ) : null}
        </div>

        <div className="wn-bottom-right">
          {step > 0 && activeItem.action?.tab && onNavigateTab && (
            <button
              type="button"
              className="wn-btn-ghost"
              onClick={() => onNavigateTab(activeItem.action.tab)}
            >
              <span>{pickText(activeItem.action.label, langCode)}</span>
            </button>
          )}

          {!isLast ? (
            <button
              type="button"
              className="wn-btn-primary"
              onClick={() => setStep((s) => Math.min(highlights.length - 1, s + 1))}
            >
              <span>{isTr ? 'İleri' : 'Next'}</span>
              <ArrowRight size={14} />
            </button>
          ) : isModal && onContinue ? (
            <button type="button" className="wn-btn-primary" onClick={onContinue}>
              <span>{isTr ? 'Tamam' : 'Done'}</span>
            </button>
          ) : highlights.length > 1 ? (
            <button type="button" className="wn-btn-ghost" onClick={() => setStep(0)}>
              <span>{isTr ? 'Başa Dön' : 'Replay'}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function WhatsNewModal({
  open = false,
  release,
  langCode = 'tr',
  roboAppearance,
  onClose,
  onNavigateTab,
}) {
  return (
    <AnimatePresence>
      {open && release && (
        <motion.div
          key="wn-backdrop"
          className="wn-backdrop"
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="wn-modal-shell"
            initial={{ opacity: 0, scale: 0.95, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.88 }}
            onClick={(e) => e.stopPropagation()}
          >
            <WhatsNewShowcaseCard
              release={release}
              langCode={langCode}
              roboAppearance={roboAppearance}
              isModal={true}
              onContinue={onClose}
              onNavigateTab={(tab) => {
                if (onClose) onClose();
                if (onNavigateTab) onNavigateTab(tab);
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function WhatsNewPage({
  releases = [],
  langCode = 'tr',
  roboAppearance,
  onNavigateTab,
}) {
  const [selectedVer, setSelectedVer] = useState(releases[0]?.version || '');
  const activeRelease =
    releases.find((r) => r.version === selectedVer) || releases[0] || null;

  return (
    <div className="settings-page-body wn-page-wrap">
      {releases.length > 1 && (
        <div className="wn-version-switcher">
          {releases.map((rel) => (
            <button
              key={rel.version}
              type="button"
              className={`wn-ver-chip ${activeRelease?.version === rel.version ? 'is-active' : ''}`}
              onClick={() => setSelectedVer(rel.version)}
            >
              {rel.version}
            </button>
          ))}
        </div>
      )}

      <WhatsNewShowcaseCard
        release={activeRelease}
        langCode={langCode}
        roboAppearance={roboAppearance}
        isModal={false}
        onNavigateTab={onNavigateTab}
      />
    </div>
  );
}

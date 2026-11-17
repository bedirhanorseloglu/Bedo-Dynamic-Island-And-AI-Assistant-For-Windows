import React, { createContext, useContext, useMemo } from 'react';
import en from './en.js';
import tr from './tr.js';

export const LANGUAGES = {
  tr: 'Türkçe',
  en: 'English',
};

export function normalizeLanguage(lang) {
  const s = String(lang || '').trim().toLowerCase();
  if (s === 'tr' || s === 'tr-tr' || s === 'türkçe' || s === 'turkce' || s === 'turkish') {
    return 'tr';
  }
  return 'en';
}

export function languageLabel(lang) {
  return LANGUAGES[normalizeLanguage(lang)];
}

export function getLocale(lang) {
  return normalizeLanguage(lang) === 'tr' ? 'tr-TR' : 'en-US';
}

export function createTranslator(lang) {
  const code = normalizeLanguage(lang);
  const dict = code === 'tr' ? tr : en;
  return function t(key, vars) {
    let text = dict[key] ?? en[key] ?? key;
    if (vars && typeof text === 'string') {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replaceAll(`{${k}}`, String(v ?? ''));
      }
    }
    return text;
  };
}

const defaultValue = {
  lang: 'en',
  language: 'English',
  locale: 'en-US',
  t: createTranslator('en'),
};

export const LanguageContext = createContext(defaultValue);

export function LanguageProvider({ language, children }) {
  const value = useMemo(() => {
    const lang = normalizeLanguage(language);
    return {
      lang,
      language: LANGUAGES[lang],
      locale: getLocale(lang),
      t: createTranslator(lang),
    };
  }, [language]);

  return React.createElement(LanguageContext.Provider, { value }, children);
}

export function useI18n() {
  return useContext(LanguageContext);
}

/**
 * i18n setup — English (default) + Bulgarian.
 *
 * Language priority:
 *   1. localStorage 'pdf-editor.lang' (user's explicit choice)
 *   2. Browser navigator.language
 *   3. Fallback to English
 *
 * To add another language: create src/i18n/locales/<code>.ts, register in `resources`.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en';
import bg from './locales/bg';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      bg: { translation: bg },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'bg'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'pdf-editor.lang',
      caches: ['localStorage'],
    },
  });

export default i18n;

export const SUPPORTED_LANGUAGES: { code: string; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'bg', label: 'Български', flag: '🇧🇬' },
];

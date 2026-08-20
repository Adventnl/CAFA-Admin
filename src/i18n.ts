import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import zh from './locales/zh.json';
import copyEn from './locales/copy.en.json';
import copyZh from './locales/copy.zh.json';

const ready = i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en, copy: copyEn },
      zh: { translation: zh, copy: copyZh },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh'],
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'cafa-admin-language',
    },
  });

function setDocumentLanguage(language: string): void {
  document.documentElement.lang = language.startsWith('zh') ? 'zh' : 'en';
}

i18n.on('languageChanged', setDocumentLanguage);
void ready.then(() => setDocumentLanguage(i18n.language));

export default i18n;

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import zhTW from './locales/zh-TW.json';
import zhCN from './locales/zh-CN.json';

const resources = {
  en: { translation: en },
  'zh-TW': { translation: zhTW },
  'zh-CN': { translation: zhCN },
};

// Get stored language from localStorage or default to 'en'
const getStoredLanguage = (): string => {
  try {
    const user = localStorage.getItem('user');
    if (user) {
      const parsed = JSON.parse(user);
      if (parsed.language && ['en', 'zh-TW', 'zh-CN'].includes(parsed.language)) {
        return parsed.language;
      }
    }
  } catch {
    // Ignore parsing errors
  }
  return 'en';
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getStoredLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  });

export default i18n;

// Function to change language and persist
export const changeLanguage = (lang: string) => {
  i18n.changeLanguage(lang);
};

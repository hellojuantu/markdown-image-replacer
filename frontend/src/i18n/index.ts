import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enTranslations from "./locales/en.json";
import zhTranslations from "./locales/zh.json";

const getBrowserLanguage = () => {
  const savedLang = localStorage.getItem("mdImageReplacerLanguage");
  if (savedLang) return savedLang;

  const browserLang = navigator.language.toLowerCase();
  return browserLang.startsWith("zh") ? "zh" : "en";
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enTranslations,
      },
      zh: {
        translation: zhTranslations,
      },
    },
    lng: getBrowserLanguage(),
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on("languageChanged", (lng) => {
  localStorage.setItem("mdImageReplacerLanguage", lng);
});

export default i18n;

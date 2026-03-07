import React, { createContext, useState, useContext } from 'react';
import translations from '../i18n/translations';

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => localStorage.getItem('lang') || 'ti');

  const changeLanguage = (code) => {
    setLanguage(code);
    localStorage.setItem('lang', code);
  };

  const t = (key) => translations[language]?.[key] || translations['en'][key] || key;

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
export default LanguageContext;

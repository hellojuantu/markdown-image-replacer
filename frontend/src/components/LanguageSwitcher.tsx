import React from 'react';
import {useTranslation} from 'react-i18next';

const LanguageSwitcher: React.FC = () => {
    const {i18n, t} = useTranslation();

    const toggleLanguage = () => {
        const newLang = i18n.language === 'zh' ? 'en' : 'zh';
        i18n.changeLanguage(newLang);
    };

    return (
        <button
            onClick={toggleLanguage}
            className="btn btn-icon"
            title={i18n.language === 'zh' ? t('language.switchToEnglish') : t('language.switchToChinese')}
            style={{'height': '38px'}}
        >
            {i18n.language === 'zh' ? t('language.english') : t('language.chinese')}
        </button>
    );
};

export default LanguageSwitcher;

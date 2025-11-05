import { useLanguage } from "../contexts/LanguageContext";
import { t } from "../i18n/translations";

export function useTranslation() {
  const { language } = useLanguage();
  
  const translate = (key, variables = {}) => {
    return t(key, language, variables);
  };
  
  return {
    t: translate,
    language,
  };
}


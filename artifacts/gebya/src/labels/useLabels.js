// useLabels — bind the central labels to the active language once per screen.
// Kept tiny on purpose: R2.1 moves copy, it does not introduce a new
// architecture (component props and APIs stay as they are).
import { useLang } from '../context/LangContext';
import { LABELS, label } from './index.js';

export function useLabels() {
  const ctx = useLang();
  const lang = ctx?.lang ?? 'am';
  return {
    lang,
    labels: LABELS,
    label: (key, ...args) => label(key, lang, ...args),
  };
}

export default useLabels;

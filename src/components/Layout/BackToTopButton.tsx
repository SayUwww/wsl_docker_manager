import { useEffect, useState, type RefObject } from 'react';
import { ArrowUp } from 'lucide-react';
import { translate } from '../../i18n';
import { useAppStore } from '../../store';

type BackToTopButtonProps = {
  containerRef: RefObject<HTMLElement | null>;
};

export default function BackToTopButton({ containerRef }: BackToTopButtonProps) {
  const language = useAppStore((s) => s.language);
  const [visible, setVisible] = useState(false);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateVisibility = () => {
      setVisible(container.scrollTop > 240);
    };

    updateVisibility();
    container.addEventListener('scroll', updateVisibility, { passive: true });
    return () => container.removeEventListener('scroll', updateVisibility);
  }, [containerRef]);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-5 right-5 z-40 flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/95 text-zinc-300 shadow-lg shadow-black/30 transition hover:border-zinc-500 hover:text-white"
      title={t('backToTop')}
    >
      <ArrowUp size={18} />
    </button>
  );
}

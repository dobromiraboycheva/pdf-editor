import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-6 py-24 text-center">
      <h1 className="text-3xl font-semibold text-ink">{t('notFound.title')}</h1>
      <Button onClick={() => navigate('/')}>{t('notFound.backHome')}</Button>
    </div>
  );
}

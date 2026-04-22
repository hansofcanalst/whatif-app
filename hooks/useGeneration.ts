import { useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useGenerationStore } from '@/stores/generationStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { requestGeneration, QuotaExceededError } from '@/lib/gemini';
import { config } from '@/constants/config';

export interface StartGenerationArgs {
  imageBase64: string;
  categoryId: string;
  subcategoryIds: string[];
  onPaywall: () => void;
}

export function useGeneration() {
  const { userDoc } = useAuthStore();
  const { isActive } = useSubscriptionStore();
  const { setLoading, setError, setResults } = useGenerationStore();

  const canGenerate = useCallback((): boolean => {
    if (isActive) return true;
    if (!userDoc) return false;
    return userDoc.freeGenerationsUsed < config.freeGenerationCap;
  }, [isActive, userDoc]);

  const remaining = userDoc
    ? Math.max(0, config.freeGenerationCap - userDoc.freeGenerationsUsed)
    : 0;

  const start = useCallback(
    async ({ imageBase64, categoryId, subcategoryIds, onPaywall }: StartGenerationArgs) => {
      if (!canGenerate()) {
        onPaywall();
        return null;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await requestGeneration({
          imageBase64,
          category: categoryId,
          subcategoryIds,
        });
        setResults(res.generationId, res.results);
        return res;
      } catch (e) {
        if (e instanceof QuotaExceededError) {
          onPaywall();
          return null;
        }
        setError(e instanceof Error ? e.message : 'Generation failed.');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [canGenerate, setLoading, setError, setResults],
  );

  return { start, canGenerate, remaining, isPro: isActive };
}

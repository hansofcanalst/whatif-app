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
        // Pull selection from the store at call time so we always see the
        // latest user choice without threading it through every caller.
        const { detectedPeople, selectedPersonIds } = useGenerationStore.getState();
        const selectedPeopleLabels =
          detectedPeople.length > 1 && selectedPersonIds.length > 0
            ? detectedPeople
                .filter((p) => selectedPersonIds.includes(p.id))
                .map((p) => p.label)
            : undefined;

        const res = await requestGeneration({
          imageBase64,
          category: categoryId,
          subcategoryIds,
          selectedPeopleLabels,
          totalPeopleInImage: detectedPeople.length || undefined,
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

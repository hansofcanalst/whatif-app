import { useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useGenerationStore } from '@/stores/generationStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { requestGeneration, QuotaExceededError } from '@/lib/gemini';
import { config } from '@/constants/config';
import { getCategory } from '@/constants/categories';

export interface StartGenerationArgs {
  imageBase64: string;
  categoryId: string;
  subcategoryIds: string[];
  onPaywall: () => void;
}

export function useGeneration() {
  const { user, userDoc } = useAuthStore();
  const { isActive } = useSubscriptionStore();
  const { setLoading, setError, setResults, appendLocalGeneration } = useGenerationStore();

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

        // Persist to the AsyncStorage-backed gallery. The dev /api/generate
        // route deliberately skips Firestore writes, so without this step
        // the Gallery tab stays empty no matter how many transformations
        // the user runs. In production, Firestore writes happen on the
        // server; we still persist locally as an offline-friendly cache
        // and dedupe by generationId in the gallery UI.
        //
        // Fire-and-forget: failures (storage quota, serialization) are
        // logged inside appendLocalGallery but should never break the
        // happy path — the user already has their results in-memory.
        try {
          const category = getCategory(categoryId);
          // Store the original as an inline data URI so the entry stays
          // self-contained even after the ephemeral file URI we picked
          // from is gone. The image model was already handed this same
          // base64, so we're not paying for anything new.
          const originalImageURL = `data:image/jpeg;base64,${imageBase64}`;
          await appendLocalGeneration({
            generationId: res.generationId,
            userId: user?.uid ?? null,
            categoryId,
            categoryLabel: category?.label ?? categoryId,
            originalImageURL,
            results: res.results,
          });
        } catch (persistErr) {
          console.warn('[useGeneration] local gallery persist failed', persistErr);
        }

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
    [canGenerate, setLoading, setError, setResults, appendLocalGeneration, user],
  );

  return { start, canGenerate, remaining, isPro: isActive };
}

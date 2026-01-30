/**
 * Unified handler for "Смотреть видеоответ" navigation
 * 
 * NEVER opens external links - only internal SPA navigation
 */

import { toast } from "sonner";
import type { NavigateFunction } from "react-router-dom";

interface KbQuestion {
  id: string;
  lesson_id?: string | null;
  timecode_seconds?: number | null;
  kinescope_url?: string | null;
  lesson?: {
    slug?: string | null;
    module?: {
      slug?: string | null;
    } | null;
  } | null;
}

interface GoToVideoAnswerOptions {
  navigate: NavigateFunction;
  question: KbQuestion;
  source?: string;
}

/**
 * Navigate to video answer lesson with timecode
 * 
 * If module/lesson data is missing, shows toast error - NEVER opens external link
 */
export function goToVideoAnswer({ navigate, question, source = 'unknown' }: GoToVideoAnswerOptions): void {
  const moduleSlug = question.lesson?.module?.slug;
  const lessonSlug = question.lesson?.slug;
  const seekTo = question.timecode_seconds ?? 0;
  
  if (moduleSlug && lessonSlug) {
    // Internal navigation with seekTo and autoplay
    const nonce = Date.now();
    navigate(`/library/${moduleSlug}/${lessonSlug}`, {
      state: { 
        seekTo, 
        autoplay: true, 
        nonce,
        source 
      }
    });
    
    console.info('[goToVideoAnswer] Internal navigation:', {
      path: `/library/${moduleSlug}/${lessonSlug}`,
      seekTo,
      nonce,
      source,
    });
  } else {
    // NO EXTERNAL LINKS - show error
    console.warn('[goToVideoAnswer] Missing lesson/module data:', {
      questionId: question.id,
      lessonId: question.lesson_id,
      lessonSlug,
      moduleSlug,
      kinescopeUrl: question.kinescope_url,
      source,
    });
    
    toast.error("Видеоответ не привязан к уроку", {
      description: "Обратитесь к администратору для настройки связи"
    });
  }
}

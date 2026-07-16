export const CHAT_AUTO_SCROLL_THRESHOLD_PX = 80;

export function isChatNearBottom(
  { scrollHeight, scrollTop, clientHeight }: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>,
  threshold = CHAT_AUTO_SCROLL_THRESHOLD_PX,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

export function chatScrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? 'auto' : 'smooth';
}

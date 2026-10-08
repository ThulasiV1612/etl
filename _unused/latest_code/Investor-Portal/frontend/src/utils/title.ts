import { APP_NAME } from "@/config/app";

/**
 * Browser tab title: **page first**, then brand (`Page · SyndicationX`).
 * Screen readers and multi-tab UX rely on the leading segment being unique per route.
 */
export const formatTitle = (page: string): string => {
  const p = page.trim();
  if (!p) return APP_NAME;
  return `${APP_NAME} | ${p}`;
};

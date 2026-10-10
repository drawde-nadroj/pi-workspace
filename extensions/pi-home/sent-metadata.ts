import type { Theme } from "@earendil-works/pi-coding-agent";
import { mixColors, type Color } from "@earendil-works/pi-tui";
import type { FooterPrefs } from "./footer-state.ts";
import { COMPOSER_ICONS } from "./composer-icons.ts";

/** One display vocabulary for sourced Sent metadata; callers own the timestamp and slot. */
export function sentTime(timestamp: number | undefined, prefs: Pick<FooterPrefs, "timestamps"> | undefined, now: number): string {
  if (!Number.isFinite(timestamp) || timestamp! < 0) return "";
  const date = new Date(timestamp!);
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: prefs?.timestamps === "12h" });
  return date.toDateString() === new Date(now).toDateString() ? time
    : `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
}

export function sentLabel(time: string, icons: FooterPrefs["icons"] = "nerd"): string {
  return time ? ` ${icons === "nerd" ? COMPOSER_ICONS.sent : "Sent"} ${time} ` : "";
}

/** User-send metadata keeps user red; assistant/group metadata is quiet in its frame hue. */
export function styledSentLabel(theme: Theme, time: string, color: Color, tone: "user" | "quiet", icons: FooterPrefs["icons"] = "nerd"): string {
  const label = sentLabel(time, icons);
  return label ? theme.style(label, { fg: tone === "user" ? color : mixColors(color, theme.colors.muted, .55), bold: true }) : "";
}

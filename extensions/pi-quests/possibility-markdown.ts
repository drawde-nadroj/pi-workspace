import type { Theme } from "@earendil-works/pi-coding-agent";
import { parseColor } from "@earendil-works/pi-tui";
import { QUEST_PALETTES } from "./surface.ts";

/** Explicit standalone Markdown title convention, not a classifier of ordinary prose.
 * The original Markdown remains in session/model context; only the display transforms.
 */
export function possibilityMarkdown(markdown: string, context: {messageType:string}, theme?: Theme): string {
  if (context.messageType !== "assistant" || !theme) return markdown;
  let fence: {char:string; length:number} | undefined;
  let comment=false;
  const green=QUEST_PALETTES[theme.appearance === "light" ? "light" : "dark"].jade;
  return markdown.split("\n").map(line=>{
    if (comment) { if(line.includes("-->"))comment=false; return line; }
    if (line.includes("<!--")) {comment=!line.includes("-->");return line;}
    const delimiter=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if(delimiter && delimiter[1][0]===fence.char && delimiter[1].length>=fence.length && !delimiter[2].trim())fence=undefined;
      return line;
    }
    if(delimiter){fence={char:delimiter[1][0],length:delimiter[1].length};return line;}
    const title=/^\*\*(Possibility · [^*\r\n`<>\[\]\x00-\x1f\x7f]{1,200})\*\*$/.exec(line);
    return title ? theme.style(title[1],{fg:parseColor(green),bold:true}) : line;
  }).join("\n");
}

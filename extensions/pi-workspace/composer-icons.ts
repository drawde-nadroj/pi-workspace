/** One Material Design family from Nerd Fonts. Codepoints verified against the
 * installed Symbols Nerd Font cmap/post tables, not guessed from glyph shapes. */
export const COMPOSER_ICONS = {
  sent: "\u{f10dd}",       // md-email_send_outline
  reply: "\u{f10db}",      // md-email_receive_outline
  session: "\u{f0822}",    // md-forum_outline
  directory: "\u{f0256}",  // md-folder_outline
  model: "\u{f061a}",      // md-chip
  git: "\u{f062c}",        // md-source_branch
  mic: "\u{f036c}",        // md-microphone
  context: "",             // The rail already communicates context; no extra chart.
} as const;

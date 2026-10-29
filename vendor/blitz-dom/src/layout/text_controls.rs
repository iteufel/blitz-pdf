use std::borrow::Cow;

/// Omit non-whitespace ASCII controls before shaping. They have no printable
/// meaning, but can otherwise produce .notdef glyphs and unwanted advances.
/// Keep CSS whitespace (TAB, LF, FF, CR) for normal whitespace processing.
pub(super) fn strip_text_controls(text: &str) -> Cow<'_, str> {
    fn is_text_control(c: char) -> bool {
        matches!(c, '\u{0}'..='\u{8}' | '\u{b}' | '\u{e}'..='\u{1f}' | '\u{7f}')
    }

    if text.chars().any(is_text_control) {
        Cow::Owned(text.chars().filter(|&c| !is_text_control(c)).collect())
    } else {
        Cow::Borrowed(text)
    }
}

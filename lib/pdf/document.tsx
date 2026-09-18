import path from "node:path";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { Locale } from "../types.ts";

// Amiri, bundled rather than fetched: it shapes Arabic correctly in
// @react-pdf, which the UI webfonts do not do inside a PDF. next.config.mjs
// keeps these files in the standalone build.
const FONT_DIR = path.join(process.cwd(), "lib", "pdf", "fonts");

let registered = false;
function registerFonts(): void {
  if (registered) return;
  Font.register({
    family: "Amiri",
    fonts: [
      { src: path.join(FONT_DIR, "Amiri-Regular.ttf") },
      { src: path.join(FONT_DIR, "Amiri-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // @react-pdf hyphenates Latin by default, which mangles references like
  // SH-2026-0001 by breaking them across lines.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

const CORAL = "#E35657";
const ORANGE = "#FE8F4B";
const INK = "#1a1a1c";
const MUTED = "#6b6b70";
const LINE = "#e6e2dc";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Amiri",
    fontSize: 11,
    color: INK,
    paddingTop: 44,
    paddingBottom: 56,
    paddingHorizontal: 44,
    lineHeight: 1.6,
  },
  brandRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 6 },
  wordmark: { fontSize: 18, fontWeight: 700, letterSpacing: -0.2 },
  // The coral-to-orange signature. @react-pdf has no gradients, so the rule is
  // drawn as two abutting blocks - the same motif, within the medium.
  ruleCoral: { width: 34, height: 3, backgroundColor: CORAL },
  ruleOrange: { width: 22, height: 3, backgroundColor: ORANGE },
  docTitle: { fontSize: 22, fontWeight: 700, marginTop: 22 },
  ref: { fontSize: 10, color: MUTED, marginTop: 4 },

  section: { marginTop: 26 },
  sectionTitle: {
    fontSize: 9,
    color: MUTED,
    letterSpacing: 1.2,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingVertical: 7,
  },
  label: { width: 130, color: MUTED, fontSize: 10 },
  value: { flex: 1, fontWeight: 700 },
  note: { marginTop: 22, fontSize: 10, color: MUTED, lineHeight: 1.7 },
  footer: {
    position: "absolute",
    bottom: 26,
    left: 44,
    right: 44,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 8,
    fontSize: 8,
    color: MUTED,
  },
});

export type PdfRow = [string, string];

export type PdfDocumentProps = {
  locale: Locale;
  brandName: string;
  docTitle: string;
  reference: string;
  sections: { title: string; rows: PdfRow[] }[];
  note?: string | null;
  footer: string;
};

/**
 * One layout for both documents the system prints. A confirmation and a call
 * sheet differ only in which sections they carry, so they share a shape - the
 * spec's "one standard form of words" applied to paper.
 */
export function StudioDocument(props: PdfDocumentProps) {
  registerFonts();
  const rtl = props.locale === "ar";
  const align = rtl ? ("right" as const) : ("left" as const);
  const direction = rtl ? ("rtl" as const) : ("ltr" as const);

  return (
    <Document title={`${props.docTitle} ${props.reference}`} author={props.brandName}>
      <Page size="A4" style={[styles.page, { direction, textAlign: align }]}>
        <View>
          <View style={styles.brandRow}>
            <Text style={styles.wordmark}>{props.brandName}</Text>
          </View>
          <View style={{ flexDirection: "row" }}>
            <View style={styles.ruleCoral} />
            <View style={styles.ruleOrange} />
          </View>

          <Text style={styles.docTitle}>{props.docTitle}</Text>
          {/* The reference is Latin and must not be reordered by the RTL run. */}
          <Text style={[styles.ref, { direction: "ltr", textAlign: align }]}>{props.reference}</Text>
        </View>

        {props.sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.rows
              .filter(([, value]) => value && value !== "—")
              .map(([label, value]) => (
                <View key={label} style={styles.row}>
                  <Text style={styles.label}>{label}</Text>
                  <Text style={styles.value}>{value}</Text>
                </View>
              ))}
          </View>
        ))}

        {props.note ? <Text style={styles.note}>{props.note}</Text> : null}

        <Text style={styles.footer} fixed>
          {props.footer}
        </Text>
      </Page>
    </Document>
  );
}

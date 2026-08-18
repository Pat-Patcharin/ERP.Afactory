import type { ReactNode } from "react";
import type { IconName } from "./icons";

/* ============================================================
   SCHEMA CONTRACTS

   A schema describes WHAT to show. The engines decide HOW.
   Adding a new master or document means writing one schema file —
   no new markup, no new CSS, no new engine code.
   ============================================================ */

/** Anything the engines can render must at least be addressable by code. */
export interface RecordBase {
  code: string;
}

/** Injected into every schema callback that can navigate or notify. */
export interface ActionCtx {
  goto: (href: string) => void;
  /** Open a master/document list by its registry key. */
  openEntity: (entity: string, code?: string) => void;
  toast: (title: string, message?: string, tone?: ToastTone) => void;
  confirm: (opts: ConfirmOptions) => void;
  /** Open the schema-driven modal used for lot/serial/picker dialogs. */
  formModal: (opts: FormModalOptions) => void;
  /** Re-read the source after a mutation without losing filters. */
  refresh: () => void;
  /** Open the Quick View drawer for a record of any entity. */
  quickView: (entity: string, record: RecordBase) => void;
  /**
   * Open a side panel of blocks — the "View All" surface.
   *
   * Overview shows the default address and the primary contact; the rest go
   * behind this rather than behind their own tab. Same BlockRenderer, so a
   * panel costs a schema nothing beyond the blocks it already builds.
   */
  panel: (opts: PanelOptions) => void;
}

export interface PanelOptions {
  title: string;
  subtitle?: string;
  blocks: Block[];
}

export type ToastTone = "success" | "info" | "warning" | "danger";

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
}

export interface FormModalOptions {
  title: string;
  body: (helpers: { close: () => void }) => ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** Return false to keep the modal open (validation failed). */
  onConfirm?: () => boolean | void;
  width?: "default" | "wide";
}

/* ---------- List ---------- */

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: "right" | "center";
  muted?: boolean;
  /** Value used for sorting when the cell renders something non-comparable. */
  sortValue?: (rec: T) => string | number;
  /**
   * Start hidden behind Column Settings. Wide operational tables offer far
   * more columns than fit; this picks the ones that open by default.
   */
  defaultHidden?: boolean;
  /** Never hideable — the column that identifies the row. */
  locked?: boolean;
  cell: (rec: T) => ReactNode;
}

/**
 * A button on the row itself — see `ListSchema.quickActions`.
 *
 * It reads as a button with words on it, not an icon. A row of bare glyphs
 * makes somebody hover each one to find out what it does, and the tick and
 * the cross beside each other are exactly the pair you do not want anybody
 * guessing at.
 */
export interface QuickAction<T> {
  /**
   * The act, named as the row menu names it.
   *
   * Also the accessible name, and the string that must appear in
   * `rowActions` too — the menu is where somebody looks when the button they
   * expected is not there, so a quick action that exists only on the row is
   * a feature that disappears the moment the row is narrow.
   */
  label: string;
  /**
   * Shorter text for the button, when the full label is too long to sit on a
   * row. The full label stays as the tooltip and the accessible name.
   */
  short?: string;
  icon: IconName;
  tone?: "ok" | "neutral";
  danger?: boolean;
  run: (rec: T, ctx: ActionCtx) => void;
}

export interface RowAction<T> {
  label?: string;
  icon?: IconName;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** Renders a divider instead of an item. */
  sep?: boolean;
  run?: (rec: T) => void;
}

export interface ListTab<T> {
  key: string;
  label: string;
  test?: (rec: T) => boolean;
}

export interface ListFilter<T> {
  id: string;
  label: string;
  options: () => string[];
  test: (rec: T, value: string) => boolean;
  /**
   * Move this filter off the toolbar and into the More Filters drawer.
   * The toolbar holds the handful a user reaches for daily; everything
   * else belongs behind the drawer rather than pushing the table down
   * the page. Filtering behaviour is identical either way.
   */
  advanced?: boolean;
}

/** Optional operational banner + KPI strip above the table. */
export interface HeroKpi {
  label: string;
  value: string;
  sub?: string;
  link?: string;
  tone?: "primary" | "warn" | "ok";
  icon?: IconName;
  goTab?: string;
  run?: () => void;
}

export interface Hero {
  banner?: {
    title: string;
    icon?: IconName;
    items: string[];
    stamp?: string;
    action?: string;
    onAction?: () => void;
  };
  kpis?: HeroKpi[];
}

export interface ListSchema<T extends RecordBase = RecordBase> {
  /** Registry key — also the URL segment: /m/{key} */
  key: string;
  entity: string;
  entityPlural: string;
  title: string;
  subtitle: string;
  crumb: string;
  crumbParent?: string;
  primaryLabel: string;
  searchPlaceholder?: string;
  emptyTitle?: string;

  source: () => T[];
  searchFields: string[];
  tabs: ListTab<T>[];
  filters: ListFilter<T>[];
  columns: Column<T>[];
  rowActions: (rec: T, ctx: ActionCtx) => RowAction<T>[];
  /**
   * The act this row is waiting for, as a button on the row.
   *
   * For queues where somebody works down a list making the same decision
   * over and over: approving eight requests should be eight clicks, not
   * eight menus. Return nothing for rows with nothing pending — a row of
   * greyed-out buttons is noise on every other line of the table.
   *
   * Never the only way to do something. Whatever appears here is also in
   * `rowActions`, because the menu is where somebody looks when the button
   * they expected is not there.
   */
  quickActions?: (rec: T, ctx: ActionCtx) => QuickAction<T>[];
  hero?: (ctx: ActionCtx) => Hero | undefined;
  secondaryActions?: (ctx: ActionCtx) => { label: string; icon?: IconName; run: () => void }[];
  /**
   * Actions offered while rows are ticked. Documents need their own verbs —
   * a batch of invoices is issued, not activated. Omit to keep the generic
   * Activate / Deactivate pair master data uses.
   */
  bulkActions?: (
    rows: T[],
    ctx: ActionCtx,
  ) => { label: string; icon?: IconName; danger?: boolean; run: () => void }[];

  /**
   * Summary panels rendered between the hero and the table, through the same
   * BlockRenderer the detail tabs use. Lets an operational list carry its own
   * widgets without the engine knowing what they contain.
   */
  panels?: (rows: T[], ctx: ActionCtx) => Block[];

  /** Defaults to opening the Quick View drawer. */
  onRowClick?: (rec: T, ctx: ActionCtx) => void;
  /** Defaults to navigating to /m/{key}/new. */
  onCreate?: (ctx: ActionCtx) => void;
  /** Hide the Import/Export toolbar pair for document modules. */
  hideImportExport?: boolean;
  /** Read-only lists (an inquiry screen) have nothing to create. */
  hideCreate?: boolean;
  /** Documents that may only be raised by converting the document upstream. */
  convertOnly?: ConvertOnly;
}

/**
 * A document nobody may open from a blank page.
 *
 * A sales order raised on its own has no approved price and no customer's yes
 * behind it; a delivery note raised on its own says goods left the building
 * that no order asked for. Every one of these documents exists because the one
 * before it produced it, so the way in is that conversion and nothing else.
 *
 * Stated as data rather than as a hidden button: the list uses it to drop the
 * Create button, and the create ROUTE uses it to refuse a URL typed by hand or
 * kept in a bookmark from before the rule existed. Editing an existing
 * document is untouched — this closes the front door, not the record.
 */
export interface ConvertOnly {
  /** Which document produces this one, in Thai — for the message. */
  from: string;
  /** Where to send someone who came here wanting to raise one. */
  goto: string;
  /** How that destination reads on the button. */
  gotoLabel: string;
  /**
   * When the create route may open its form after all, judged on the query
   * string the conversion handed over.
   *
   * A document whose conversion pushes the record straight into the store
   * omits this: nothing legitimate ever reaches /new, so nothing may. An
   * invoice is the exception — the conversion cannot write it, because a
   * human still has to say what is being billed — so it arrives at the form
   * carrying its source, and that is the only shape of URL allowed through.
   */
  allowSeeded?: (params: Record<string, string>) => boolean;
}

/* ---------- Detail blocks ---------- */

/**
 * A tab returns a Block[]; falsy entries are dropped so schemas can write
 * `isLow && { type: 'alert', ... }` inline instead of building the array
 * imperatively.
 */
export type Block = RenderableBlock | null | false | undefined;

export type RenderableBlock =
  | FieldsBlock
  | CardsBlock
  | TableBlock
  | EntityBlock
  | DocsBlock
  | TimelineBlock
  | AlertBlock
  | FlagsBlock
  | PlannedBlock
  | RestrictedBlock
  | AuditBlock
  | EmptyBlock
  | TreeBlock
  | NoteBlock
  | NodeBlock
  | GridBlock;

interface BlockBase {
  title?: string;
}

export interface FieldRow {
  label: string;
  value: ReactNode;
  /** Span both columns in a two-column grid (long descriptions). */
  span?: boolean;
  muted?: boolean;
}

export interface FieldsBlock extends BlockBase {
  type: "fields";
  cols?: 1 | 2;
  items: (FieldRow | null | false | undefined)[];
}

export interface MetricCard {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: string;
  tone?: "accent" | "warn" | "locked";
}

export interface CardsBlock extends BlockBase {
  type: "cards";
  cols?: 2 | 3 | 4;
  items: (MetricCard | null | false | undefined)[];
}

export interface TableCol<R> {
  key: string;
  label: string;
  align?: "right";
  muted?: boolean;
  cell?: (row: R) => ReactNode;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TableBlock<R = any> extends BlockBase {
  type: "table";
  rows: R[];
  cols: TableCol<R>[];
  empty?: string;
}

export interface EntityBlock extends BlockBase {
  type: "entity";
  items: {
    name: string;
    sub?: string;
    avatar?: string;
    end?: ReactNode;
    onClick?: () => void;
  }[];
  empty?: string;
}

export interface DocsBlock extends BlockBase {
  type: "docs";
  items: { name: string; meta: string; onClick?: () => void }[];
  empty?: string;
}

export interface TimelineEvent {
  title: string;
  detail?: string;
  user?: string;
  when?: string;
  /** Dot colour on the rail: primary | info | warn, anything else is neutral. */
  kind?: string;
}

export interface TimelineBlock extends BlockBase {
  type: "timeline";
  items: TimelineEvent[];
}

export interface AlertBlock extends BlockBase {
  type: "alert";
  tone: "warn" | "danger" | "info" | "success";
  title: string;
  message: ReactNode;
}

export interface FlagsBlock extends BlockBase {
  type: "flags";
  cols?: 1 | 2;
  items: { label: string; value: boolean }[];
}

export interface PlannedBlock extends BlockBase {
  type: "planned";
  label: string;
  message?: string;
}

export interface RestrictedBlock extends BlockBase {
  type: "restricted";
}

export interface AuditEvent {
  event: string;
  user: string;
  when: string;
  field?: string;
  from?: string;
  to?: string;
  /** Dot colour on the rail: primary | info | warn, anything else is neutral. */
  kind?: string;
}

export interface AuditBlock extends BlockBase {
  type: "audit";
  items: AuditEvent[];
}

export interface EmptyBlock extends BlockBase {
  type: "empty";
  heading: string;
  message?: string;
  icon?: IconName;
}

export interface TreeNode {
  label: string;
  sub?: string;
  icon?: IconName;
  badge?: string;
  badgeTone?: BadgeTone;
  meta?: string;
  children?: TreeNode[];
}

export interface TreeBlock extends BlockBase {
  type: "tree";
  nodes: TreeNode[];
  empty?: string;
}

export interface NoteBlock extends BlockBase {
  type: "note";
  text: ReactNode;
}

/** Escape hatch for a bespoke visual (pricing ladder, barcode, sparkline). */
export interface NodeBlock extends BlockBase {
  type: "node";
  node: ReactNode;
}

/**
 * Blocks side by side on a wide screen, stacking as it narrows.
 *
 * This is what makes an "Overview first" page possible: six summary cards in
 * a grid read in one screenful, where six stacked sections would not.
 */
export interface GridBlock extends BlockBase {
  type: "grid";
  /** Defaults to 2. Three is for compact summary cards. */
  cols?: 2 | 3;
  items: Block[];
}

/* ---------- Detail schema ---------- */

export type BadgeTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "primary";

export interface Identity {
  image?: ReactNode;
  code: string;
  title: string;
  copyFields?: { label: string; value: string }[];
  badges: { text: string; tone: BadgeTone }[];
  tags: string[];
}

export interface Kpi {
  icon: IconName;
  label: string;
  value: string;
  sub?: string;
  /** Clicking the card jumps to this tab. */
  goTab?: string;
  wide?: boolean;
}

export interface AsidePanel {
  top?: ReactNode;
  /** Heading above the rows. Omit for the unlabelled rail masters use today. */
  title?: string;
  rows: {
    icon: IconName;
    label: string;
    value: ReactNode;
    muted?: boolean;
  }[];
  /** Jump-off points rendered under the rows — Quick Links in the spec. */
  links?: { label: string; icon?: IconName; sub?: string; run: () => void }[];
  bottom?: ReactNode;
}

export interface DetailTab<T> {
  key: string;
  label: string;
  /** Role-conditional tabs (Purchasing only exists for suppliers). */
  when?: (rec: T) => boolean;
  blocks: (rec: T, ctx: ActionCtx) => Block[];
  /** Right-hand summary rail, wide screens only. */
  aside?: (rec: T, ctx: ActionCtx) => AsidePanel;
}

export interface DetailSchema<T extends RecordBase = RecordBase> {
  key: string;
  entityLabel: string;
  identity: (rec: T) => Identity;
  kpis: (rec: T) => Kpi[];
  /**
   * A panel beside the KPI tiles in the sticky header — a short list where a
   * tile would only carry one number of it.
   *
   * "Last transaction: 25/06/2026" was a tile, and a date on its own never
   * answered the question somebody opens a customer to ask: what did we bill,
   * did they pay, and where is the parcel. That is three facts about each of
   * three documents, which is a panel and not a tile.
   *
   * Its presence also shrinks the tiles: the band is one row of header and the
   * two halves share it.
   *
   * `goTab` is the same jump a KPI tile makes with `goTab` — the panel is
   * inside the tab rail's own header, so sending the reader to the tab that
   * owns the detail is the one navigation it needs.
   */
  heroPanel?: (rec: T, ctx: ActionCtx, goTab: (key: string) => void) => ReactNode;
  tabs: DetailTab<T>[];
  /** Extra items for the "More Actions" menu on the full detail page. */
  actions?: (rec: T, ctx: ActionCtx) => RowAction<T>[];
}

/* ---------- Form ---------- */

/**
 * The mutable draft the form engine edits. Schemas read and write it by
 * dot-path ("pricing.retail", "items.0.qty"), so it stays deliberately loose —
 * the record type only reappears at the `toState` / `save` boundary.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FormState = Record<string, any>;

/** One line inside a `grid` field. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GridRow = Record<string, any>;

export type FieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "textarea"
  | "toggle"
  /**
   * A short, mutually exclusive choice shown in full — every option visible
   * without opening anything. Two or three options that the user must weigh
   * against each other, where a dropdown would hide the alternative.
   */
  | "radio"
  /**
   * The same one-of-N answer as `radio`, pressed rather than ticked — the
   * option IS the button. For the question that decides what the rest of the
   * form means: it earns the top of the page, and a dropdown there hides the
   * fact that there was a question at all until somebody opens it.
   */
  | "choice"
  /**
   * A fixed list where picking nothing means everything.
   *
   * "Which customer groups?" is answered "all of them" nine times in ten, and
   * the tenth answer is two or three of five. A grid of Add buttons makes the
   * common answer look like an empty form somebody forgot to fill in, and
   * charges a press per row for the rare one.
   */
  | "picks"
  /** Emoji stand-in picker plus upload — masters that only need a marker. */
  | "image"
  /** Upload only. A real photograph, no icon to fall back on. */
  | "photo"
  | "static"
  | "grid"
  | "cards"
  | "secure"
  | "tree"
  | "note";

export interface SelectOption {
  value: string;
  label: string;
}

export interface GridCol {
  key: string;
  label: string;
  type?:
    | "text"
    | "number"
    | "date"
    | "select"
    | "check"
    | "radio"
    | "static"
    | "computed"
    | "lookup"
    | "seg";
  /**
   * A plain string is both the value stored and the text shown. Pass
   * `{ value, label }` when they differ — a product row stores the code
   * because every lookup in the system is by code, while the person choosing
   * needs the name to know which one it is.
   */
  options?: (string | SelectOption)[];
  /**
   * Options that depend on the row — a district list belongs to the province
   * picked on that row and nowhere else.
   *
   * `options` cannot express this: it is one list for the whole column, so a
   * cascade had to be faked with one conditional column per parent value.
   * That worked for Bangkok's fifty districts and stops working at seventy-
   * seven provinces. Takes precedence over `options` when both are given.
   */
  optionsFor?: (row: GridRow) => (string | SelectOption)[];
  /** Segmented control choices. */
  segOptions?: { val: string; label: string; tone?: "ok" | "danger" | "neutral" }[];
  align?: "right";
  width?: string;
  /** Stacked layout only — a long value that deserves two columns. */
  span?: boolean;
  muted?: boolean;
  placeholder?: string;
  required?: boolean;
  /** Lookup source key, resolved through FormSchema.lookup. */
  source?: string;
  /**
   * Conditional column, decided per row — an international bank account needs
   * a SWIFT code and a domestic one does not. In `stacked` layout the field
   * simply disappears from that row's card; in `table` layout the column
   * survives as long as any row still wants it.
   */
  when?: (row: GridRow) => boolean;
  /** Read-only derived cell. */
  get?: (row: GridRow) => ReactNode;
  cls?: (row: GridRow) => string;
}

export interface FormField {
  type: FieldType;
  path?: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  span?: boolean;
  readonly?: boolean;
  min?: number;
  max?: number;
  step?: string;
  rows?: number;
  options?: (string | SelectOption)[];
  /** Placeholder mark on a `photo` field with nothing uploaded yet. */
  icon?: IconName;
  /** Conditional field — hidden when this returns false. */
  when?: (state: FormState) => boolean;
  /** static fields compute their display value from state. */
  value?: (state: FormState) => ReactNode;
  /** secure fields render `as` when the permission passes. */
  as?: FieldType;
  permission?: string;
  /** grid fields */
  cols?: GridCol[];
  addLabel?: string;
  empty?: string;
  /**
   * `table` (default) packs a row onto one scrolling line. `stacked` gives
   * each row a card and lets its fields wrap, which is what a collection with
   * a dozen typed columns actually needs.
   */
  layout?: "table" | "stacked";
  /** Heading on a stacked row: "ผู้ติดต่อ 1", "ที่อยู่ 2". */
  rowLabel?: string;
  /**
   * A second Add that takes several at once.
   *
   * The single Add is one row per press with a dropdown inside it, and the
   * dropdown covers the rows already chosen. Fourteen products is fourteen of
   * those, chosen blind. This opens the same list instead, with what is
   * already on the grid marked as taken.
   *
   * Fills the grid's first `select` column; the rest of each row is built by
   * `newRow`, exactly as the single Add builds it.
   */
  multiAdd?: boolean;
  /** cards (multi-select role picker) */
  cardOptions?: { key: string; label: string; desc?: string; tone?: BadgeTone }[];
  /** tree field levels */
  levels?: { label: string; codePh?: string; namePh?: string }[];
  /** picks — what the empty list means, said in the affirmative: "ทุกกลุ่ม". */
  allLabel?: string;
  /** note field */
  text?: string;
  onText?: string;
  offText?: string;
}

/** A group of fields laid out on a `cols`-wide grid inside one card. */
export interface FormCard {
  type: "card";
  title?: string;
  cols?: "2" | "3" | "4" | "5";
  badge?: ReactNode;
  fields: (FormField | null | false | undefined)[];
}

/**
 * A block is either a card of fields, or a single field standing on its own —
 * how grids, trees and role pickers get the full width of the step.
 */
export type FormBlock = FormCard | FormField;

export interface FormStep {
  key: string;
  label: string;
  railLabel?: string;
  labelTh?: string;
  /** Progressive disclosure — step only exists when this passes. */
  when?: (state: FormState) => boolean;
  /**
   * Which side of the business this section belongs to, when it belongs to
   * one. Tints the section so a form that asks about both a customer and a
   * supplier does not read as one long questionnaire — the person filling it
   * can see at a glance which half they are in.
   *
   * Only for sections that are genuinely one-sided. A section everybody fills
   * in leaves this off and stays neutral, which is what makes the tint mean
   * something.
   */
  side?: "customer" | "supplier";
  /** Falsy entries are dropped, so a step can inline `isSupplier && {...}`. */
  blocks: (state: FormState) => (FormBlock | null | false | undefined)[];
  /** The final summary step. */
  review?: boolean;
}

export interface RequiredRule {
  path: string;
  label: string;
  step: string;
  /** Custom satisfaction test for collection fields. */
  test?: (state: FormState) => boolean;
}

/** A cross-field constraint. `test` returns true when the rule is SATISFIED. */
export interface BusinessRule {
  label: string;
  step: string;
  test: (state: FormState) => boolean;
}

export interface DuplicateHit {
  code: string;
  name: string;
  why: string;
}

/** One row of a lookup dropdown inside a grid cell. */
export interface LookupHit {
  code: string;
  name: string;
  meta?: string;
}

export interface FormSchema<T extends RecordBase = RecordBase> {
  key: string;
  entityLabel: string;
  /** Field on the state used for the preview title. */
  titleField?: string;
  saveButton?: string;
  saveTitle?: string;
  savedLabel?: string;
  statusBadge?: Record<string, BadgeTone>;

  blank: () => FormState;
  toState: (rec: T) => FormState;
  save: (state: FormState, ctx: ActionCtx) => void;

  /**
   * Refuse to open the edit form for a record the process has locked — an
   * issued invoice, a completed task. Returning a reason shows it instead of
   * the form, so nobody types into a document that cannot be saved.
   */
  editGuard?: (rec: T) => string | null;

  steps: FormStep[];
  required: RequiredRule[];
  rules?: BusinessRule[];

  /**
   * Fired after any field write, with the path that changed and the draft.
   * This is how a document reacts to its own header: choosing a PO on a Goods
   * Receipt pulls the ordered lines, choosing a supplier on a PO adopts that
   * supplier's currency and payment term.
   */
  onChange?: (path: string, state: FormState) => void;
  /** Recalculate derived line values after any cell edit in a grid. */
  onGridChange?: (path: string, state: FormState) => void;
  /** Blank line for the Add button; return null to refuse (nothing to add). */
  newRow?: (path: string, isFirst: boolean) => GridRow | null;

  lookup?: Record<string, (q: string) => LookupHit[]>;
  onLookupPick?: (
    source: string,
    gridPath: string,
    index: number,
    rec: LookupHit,
    state: FormState,
  ) => void;

  /**
   * A badge beside the title saying WHAT is being made, when one form makes
   * more than one thing — a promotion form is a free-goods form or a discount
   * form, and they ask different questions of the same page. The answer was
   * given before the form opened, so it is a label here and not a field.
   */
  headerBadge?: (state: FormState) => { text: string; tone: BadgeTone } | null;

  findDuplicates?: (state: FormState) => DuplicateHit[];
  openDuplicate?: (code: string, ctx: ActionCtx) => void;

  /* No  and no . Every form carried a summary
     rail assembled out of figures already on the page — see the note in
     MasterForm. A summary of what is visible is the same thing twice. */
  /** Review step layout; falls back to listing every required field. */
  reviewCards?: (
    state: FormState,
    row: (label: string, value: unknown, step: string) => ReactNode,
  ) => ReactNode;
  /** Confirmation step before committing (GR post-receipt). */
  beforeSave?: (state: FormState, proceed: () => void, ctx: ActionCtx) => void;
}

/** The three schemas that make one entity work end to end. */
export interface EntitySchemas<T extends RecordBase = RecordBase> {
  list: ListSchema<T>;
  detail: DetailSchema<T>;
  form?: FormSchema<T>;
  /**
   * A purpose-built create/edit screen, used instead of the generic form.
   *
   * Most documents are served perfectly well by the schema-driven form. A few
   * are the document — a quotation is what the customer receives, so it is
   * edited as the printed sheet rather than as a set of cards. When this is
   * present the form routes render it and ignore `form`.
   */
  editor?: (props: { record?: T }) => ReactNode;
  /**
   * A purpose-built READ screen, used instead of the tabbed profile.
   *
   * Same argument as `editor`, from the other side: for a document, the
   * thing somebody wants to look at is the document. Four tabs of cards is
   * a summary of a request rather than the request, and an approver reading
   * a summary is approving a summary.
   */
  document?: (props: { record: T }) => ReactNode;
}

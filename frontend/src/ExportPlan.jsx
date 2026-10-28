import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "./api";
import { WeeklyCalendar } from "./Planner";
import "./export-plan.css";

const DEFAULT_CELL_WIDTH = 145;
const DEFAULT_HOUR_HEIGHT = 64;
const DEFAULT_FONT_SCALE = 100;
const TIME_COLUMN_WIDTH = 50;
const SHEET_HORIZONTAL_PADDING = 56;

const COLOR_PRESETS = {
  stars: {
    name: "STARS",
    light: {
      background: "#ffffff", table: "#ffffff", header: "#e6f4f6",
      grid: "#bfd8df", ink: "#06065d", muted: "#53657a", accent: "#ed0101",
      courses: ["#06065d", "#0e49b5", "#a2dae0", "#ed0101", "#a70107", "#3f75c2", "#2b869c", "#c91621", "#7f1724", "#9b3b54"],
    },
    dark: {
      background: "#090a22", table: "#101331", header: "#182b5a",
      grid: "#394b77", ink: "#f3f6ff", muted: "#b7c4dd", accent: "#ff4b4b",
      courses: ["#5b63e8", "#3f7fe8", "#8ed4e0", "#ff4b4b", "#d83742", "#6ba6f2", "#54b8c4", "#f06a71", "#c45b67", "#e08498"],
    },
  },
  ocean: {
    name: "Ocean",
    light: {
      background: "#fff9f7", table: "#ffffff", header: "#dff4f0",
      grid: "#bfded8", ink: "#255194", muted: "#61788c", accent: "#33b5ab",
      courses: ["#f8c3b6", "#f39883", "#66bfaf", "#33b5ab", "#255194", "#e8756d", "#f6a99b", "#159c9c", "#79cfc4", "#3477a8"],
    },
    dark: {
      background: "#0c2432", table: "#102f3c", header: "#164756",
      grid: "#376676", ink: "#f4fbff", muted: "#b4d0d7", accent: "#39c9bd",
      courses: ["#ffb6a4", "#ff8f78", "#7ad8c6", "#39c9bd", "#4d82c4", "#ea6b65", "#ffc8bb", "#1db4ae", "#8addd4", "#5c9bc5"],
    },
  },
  sage: {
    name: "Sage",
    light: {
      background: "#fbfcf8", table: "#ffffff", header: "#e9eddf",
      grid: "#cdd4c2", ink: "#394033", muted: "#707765", accent: "#5a896f",
      courses: ["#bcb88a", "#6f7259", "#b4d3c4", "#b4c04c", "#6e9daf", "#b5bda5", "#aea26e", "#5a896f", "#8f9779", "#63b76c"],
    },
    dark: {
      background: "#1a2018", table: "#222a20", header: "#384234",
      grid: "#596551", ink: "#f3f6ed", muted: "#c0c9b8", accent: "#83b397",
      courses: ["#d2cda2", "#92977b", "#c5e4d5", "#cbd85d", "#8ab9c9", "#cbd4bc", "#c6b981", "#76aa8c", "#adba9c", "#83ce8b"],
    },
  },
  violet: {
    name: "Violet",
    light: {
      background: "#fdfaff", table: "#ffffff", header: "#efe5fa",
      grid: "#dac9e8", ink: "#330066", muted: "#746285", accent: "#8806ce",
      courses: ["#ee82ee", "#c71585", "#8806ce", "#d6b4fc", "#6a5acd", "#330066", "#b284be", "#9400d3", "#702963", "#c54b8c"],
    },
    dark: {
      background: "#160d24", table: "#20132f", header: "#3a2054",
      grid: "#65467c", ink: "#faf3ff", muted: "#cbb7d7", accent: "#d792ff",
      courses: ["#f29af2", "#e13ca4", "#a73aed", "#dcc4ff", "#887be0", "#7d4db2", "#c79bd0", "#b53be6", "#a45a98", "#8054be"],
    },
  },
};

function ThemeIcon({ theme }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
      {theme === "dark" ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
        </>
      ) : (
        <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2z" />
      )}
    </svg>
  );
}

export const exportFileName = (plan) => {
  const name = String(plan?.label || plan?.plan_name || "plan")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "plan";
  const year = String(plan?.academic_year || "academic-year")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const semester = plan?.semester
    ? `semester-${plan.semester}`
    : "semester";

  return `${name}-${year}-${semester}`;
};

const downloadDataUrl = (dataUrl, filename) => {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
};

const imageSize = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.width, height: image.height });
    image.onerror = reject;
    image.src = src;
  });

export default function ExportPlan({ planId }) {
  const sheetRef = useRef(null);
  const previewRef = useRef(null);
  const [theme, setTheme] = useState(() =>
    document.documentElement.dataset.theme === "dark"
      ? "dark"
      : "light"
  );
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState("");
  const [error, setError] = useState("");
  const [cellWidth, setCellWidth] = useState(DEFAULT_CELL_WIDTH);
  const [hourHeight, setHourHeight] = useState(DEFAULT_HOUR_HEIGHT);
  const [fontScale, setFontScale] = useState(DEFAULT_FONT_SCALE);
  const [colorPreset, setColorPreset] = useState("stars");
  const [displayFields, setDisplayFields] = useState({
    courseTitle: false,
    classType: true,
    time: true,
    venue: true,
  });
  const [preview, setPreview] = useState({ scale: 1, height: 0 });

  const sheetWidth =
    SHEET_HORIZONTAL_PADDING + TIME_COLUMN_WIDTH + cellWidth * 7;
  const palette = COLOR_PRESETS[colorPreset][theme];
  const paletteStyle = {
    "--export-background": palette.background,
    "--export-table": palette.table,
    "--export-table-head": palette.header,
    "--export-grid": palette.grid,
    "--export-ink": palette.ink,
    "--export-muted": palette.muted,
    "--export-accent": palette.accent,
  };

  useLayoutEffect(() => {
    if (!previewRef.current || !sheetRef.current || loading) return undefined;

    const updatePreview = () => {
      const availableWidth = previewRef.current?.clientWidth || sheetWidth;
      const naturalHeight = sheetRef.current?.offsetHeight || 0;
      const scale = Math.min(1, availableWidth / sheetWidth);

      setPreview((current) => {
        const height = naturalHeight * scale;
        if (
          Math.abs(current.scale - scale) < 0.001 &&
          Math.abs(current.height - height) < 1
        ) {
          return current;
        }
        return { scale, height };
      });
    };

    updatePreview();
    const observer = new ResizeObserver(updatePreview);
    observer.observe(previewRef.current);

    return () => observer.disconnect();
  }, [cellWidth, fontScale, hourHeight, loading, plan, sheetWidth]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    try {
      localStorage.setItem("smart-stars-theme", theme);
    } catch {
      // Storage may be unavailable.
    }
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    if (!/^\d+$/.test(String(planId || ""))) {
      setError("This export link does not contain a valid plan ID.");
      setLoading(false);
      return () => {};
    }

    api.planSummary(planId)
      .then((data) => {
        if (cancelled) return;
        setPlan(data);
        document.title = `${data.label || data.plan_name} — Timetable`;
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [planId]);

  const renderPng = async () => {
    if (!sheetRef.current) throw new Error("The timetable is not ready.");
    await document.fonts?.ready;
    const { toPng } = await import("html-to-image");
    return toPng(sheetRef.current, {
      backgroundColor: palette.background,
      cacheBust: true,
      pixelRatio: 2,
    });
  };

  const downloadPng = async () => {
    setExporting("png");
    setError("");
    try {
      downloadDataUrl(
        await renderPng(),
        `${exportFileName(plan)}-${theme}.png`
      );
    } catch {
      setError("The PNG could not be generated. Please try again.");
    } finally {
      setExporting("");
    }
  };

  const downloadPdf = async () => {
    setExporting("pdf");
    setError("");
    try {
      const dataUrl = await renderPng();
      const [{ jsPDF }, size] = await Promise.all([
        import("jspdf"),
        imageSize(dataUrl),
      ]);
      const margin = 8;
      const pixelToMillimetre = 25.4 / 96 / 2;
      const contentWidth = size.width * pixelToMillimetre;
      const contentHeight = size.height * pixelToMillimetre;
      const requestedWidth = contentWidth + margin * 2;
      const requestedHeight = contentHeight + margin * 2;
      const pdf = new jsPDF({
        orientation: requestedWidth >= requestedHeight ? "landscape" : "portrait",
        unit: "mm",
        format: [requestedWidth, requestedHeight],
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      pdf.setFillColor(palette.background);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");

      pdf.addImage(
        dataUrl,
        "PNG",
        margin,
        margin,
        contentWidth,
        contentHeight
      );
      pdf.save(`${exportFileName(plan)}-${theme}.pdf`);
    } catch {
      setError("The PDF could not be generated. Please try again.");
    } finally {
      setExporting("");
    }
  };

  const hasTimetable = Boolean(plan?.sessions?.length);
  const resetRenderSettings = () => {
    setCellWidth(DEFAULT_CELL_WIDTH);
    setHourHeight(DEFAULT_HOUR_HEIGHT);
    setFontScale(DEFAULT_FONT_SCALE);
    setColorPreset("stars");
    setDisplayFields({
      courseTitle: false,
      classType: true,
      time: true,
      venue: true,
    });
  };

  return (
    <main
      className="export-page"
      style={{ "--export-sheet-width": `${sheetWidth}px` }}
    >
      <div className="export-toolbar" aria-label="Export controls">
        <div>
          <strong>Export timetable</strong>
          <span>Downloads follow the preview theme and render settings.</span>
        </div>
        <div className="export-actions">
          <button type="button" className="export-close" onClick={() => window.close()}>
            Close
          </button>
          <button type="button" disabled={!hasTimetable || Boolean(exporting)} onClick={downloadPng}>
            {exporting === "png" ? "Creating PNG…" : "Download PNG"}
          </button>
          <button type="button" disabled={!hasTimetable || Boolean(exporting)} onClick={downloadPdf}>
            {exporting === "pdf" ? "Creating PDF…" : "Download PDF"}
          </button>
        </div>
      </div>

      {error && <div className="export-message export-error" role="alert">{error}</div>}
      {loading && <div className="export-message">Loading timetable…</div>}

      {!loading && plan && (
        <div className="export-layout">
          <div
            className="export-preview"
            ref={previewRef}
            style={{ height: preview.height ? `${preview.height}px` : undefined }}
          >
            <div
              className="export-preview-scale"
              style={{ transform: `scale(${preview.scale})` }}
            >
              <section
                className="export-sheet"
                ref={sheetRef}
                aria-label="Exported timetable"
                style={{
                  "--export-font-scale": fontScale / 100,
                  ...paletteStyle,
                }}
              >
                <header className="export-sheet-header">
                  <div>
                    <span className="export-brand">Smart STARS</span>
                    <h1>{plan.label || plan.plan_name}</h1>
                  </div>
                  <p>
                    AY {String(plan.academic_year || "—").replace("-", "–")}
                    {plan.semester ? ` · Semester ${plan.semester}` : ""}
                  </p>
                </header>

                {hasTimetable ? (
                  <WeeklyCalendar
                    slots={plan.sessions}
                    mode={null}
                    blockedHours={[]}
                    lockedIndexes={{}}
                    onHourClick={() => {}}
                    onLessonClick={() => {}}
                    busy={false}
                    pixelsPerHour={hourHeight}
                    courseColors={palette.courses}
                    displayFields={displayFields}
                  />
                ) : (
                  <div className="export-empty">This plan does not have a generated timetable yet.</div>
                )}
              </section>
            </div>
          </div>

          <aside className="export-settings" aria-label="Render settings">
            <div className="export-settings-heading">
              <span>Render settings</span>
              <strong>Customise output</strong>
            </div>

            <div className="export-setting-group">
              <span className="export-setting-label">Colour theme</span>
              <button
                className="theme-toggle"
                type="button"
                aria-pressed={theme === "dark"}
                aria-label={`Switch to ${theme === "dark" ? "day" : "night"} mode`}
                onClick={() =>
                  setTheme((current) => current === "dark" ? "light" : "dark")
                }
              >
                <ThemeIcon theme={theme} />
                <span>{theme === "dark" ? "Day" : "Night"}</span>
              </button>
            </div>

            <fieldset className="export-preset-setting">
              <legend>Colour preset</legend>
              <div className="export-preset-grid">
                {Object.entries(COLOR_PRESETS).map(([key, preset]) => (
                  <button
                    type="button"
                    key={key}
                    className={colorPreset === key ? "is-selected" : ""}
                    aria-pressed={colorPreset === key}
                    onClick={() => setColorPreset(key)}
                  >
                    <span className="export-preset-swatches" aria-hidden="true">
                      {preset[theme].courses.slice(0, 5).map((colour) => (
                        <i key={colour} style={{ background: colour }} />
                      ))}
                    </span>
                    <span>{preset.name}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="export-display-setting">
              <legend>Display</legend>
              <label>
                <input type="checkbox" checked disabled />
                Course code <small>Always shown</small>
              </label>
              {[
                ["courseTitle", "Course full name"],
                ["classType", "Course type (LEC / TUT)"],
                ["time", "Course time"],
                ["venue", "Course location"],
              ].map(([field, label]) => (
                <label key={field}>
                  <input
                    type="checkbox"
                    checked={displayFields[field]}
                    onChange={(event) => setDisplayFields((current) => ({
                      ...current,
                      [field]: event.target.checked,
                    }))}
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            <label className="export-range-setting">
              <span>
                Day column width
                <output>{cellWidth}px</output>
              </span>
              <input
                type="range"
                min="90"
                max="210"
                step="5"
                value={cellWidth}
                onChange={(event) => setCellWidth(Number(event.target.value))}
              />
            </label>

            <label className="export-range-setting">
              <span>
                Hour row height
                <output>{hourHeight}px</output>
              </span>
              <input
                type="range"
                min="40"
                max="100"
                step="2"
                value={hourHeight}
                onChange={(event) => setHourHeight(Number(event.target.value))}
              />
            </label>

            <label className="export-range-setting">
              <span>
                Font size
                <output>{fontScale}%</output>
              </span>
              <input
                type="range"
                min="80"
                max="150"
                step="5"
                value={fontScale}
                onChange={(event) => setFontScale(Number(event.target.value))}
              />
            </label>

            <div className="export-size-summary">
              <span>Cell proportion</span>
              <strong>{cellWidth} × {hourHeight}px</strong>
              <small>PNG and PDF dimensions follow this preview.</small>
            </div>

            <button
              type="button"
              className="export-reset"
              onClick={resetRenderSettings}
            >
              Reset defaults
            </button>
          </aside>
        </div>
      )}
    </main>
  );
}

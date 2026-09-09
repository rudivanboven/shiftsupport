"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./Safety.module.css";

/* Inline 24x24 stroke icons — no icon package, no image assets.
   Every row gets its own glyph rather than a repeated check circle. */
const paths: Record<string, ReactNode> = {
  shield: (
    <>
      <path d="M12 3.2 5.5 5.8v5c0 4.2 2.7 7.6 6.5 8.6 3.8-1 6.5-4.4 6.5-8.6v-5L12 3.2Z" />
      <path d="m9.3 11.9 1.9 1.9 3.6-3.6" />
    </>
  ),
  umbrella: (
    <>
      <path d="M3.2 12a8.8 8.8 0 0 1 17.6 0Z" />
      <path d="M12 12v5.9a2.4 2.4 0 0 0 4.8 0" />
      <path d="M12 2.6V3.2" />
    </>
  ),
  payroll: (
    <>
      <rect x="2.8" y="6.2" width="18.4" height="11.6" rx="2.2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.4 9.8h.01M17.6 14.2h.01" />
    </>
  ),
  onboarding: (
    <>
      <circle cx="9.5" cy="7.6" r="3.4" />
      <path d="M3.6 19.4a5.9 5.9 0 0 1 11.8 0" />
      <path d="m16.6 12.6 1.7 1.7 3.3-3.3" />
    </>
  ),
  store: (
    <>
      <path d="M4 9.2 5.4 4.8h13.2L20 9.2" />
      <path d="M4.9 9.2v9.9h14.2V9.2" />
      <path d="m9.4 14.2 1.8 1.8 3.4-3.4" />
    </>
  ),
  clipboard: (
    <>
      <path d="M9 4.4H7.4a1.8 1.8 0 0 0-1.8 1.8v12.2a1.8 1.8 0 0 0 1.8 1.8h9.2a1.8 1.8 0 0 0 1.8-1.8V6.2a1.8 1.8 0 0 0-1.8-1.8H15" />
      <rect x="9" y="2.8" width="6" height="3.2" rx="1.1" />
      <path d="M8.8 11.4h6.4M8.8 15.2h4.2" />
    </>
  ),
  care: (
    <path d="M12 20.2s-7.4-4.6-7.4-9.4a4.2 4.2 0 0 1 7.4-2.7 4.2 4.2 0 0 1 7.4 2.7c0 4.8-7.4 9.4-7.4 9.4Z" />
  ),
  document: (
    <>
      <path d="M13.4 3.2H7.6a1.8 1.8 0 0 0-1.8 1.8v14a1.8 1.8 0 0 0 1.8 1.8h8.8a1.8 1.8 0 0 0 1.8-1.8V7.8l-4.8-4.6Z" />
      <path d="M13.2 3.4v4.4h4.6" />
      <path d="m9.2 14.4 1.8 1.8 3.6-3.6" />
    </>
  ),
};

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

const modules = [
  {
    key: "insurance",
    label: "Insurance Coverage",
    caption: "Coverage and protection handled through ShiftSupport.",
  },
  {
    key: "safety",
    label: "Workplace Safety",
    caption: "Clear expectations, guidance, and a safe host environment.",
  },
  {
    key: "responsibility",
    label: "Clear Responsibilities",
    caption:
      "Everyone knows what ShiftSupport handles and what retailers provide.",
  },
];

const shiftSupportRows = [
  ["shield", "Insurance & Employment Support"],
  ["umbrella", "Workers’ Compensation Insurance"],
  ["payroll", "Payroll Coverage For Work-Related Injuries"],
  ["onboarding", "General Onboarding And Safety Guidance"],
];

const retailerRows = [
  ["store", "A Safe Host Workplace"],
  ["clipboard", "Site-Specific Guidance And Store Rules"],
  ["care", "A Safe And Supportive Workplace"],
  ["document", "Clear Instructions For The Assigned Shift"],
];

export default function Safety() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof IntersectionObserver === "undefined" || reduced) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`${styles.section} ${inView ? styles.inView : ""}`}
    >
      <div className="container">
        <div className={styles.intro}>
          <p className={`headingFont ${styles.eyebrow}`}>
            <span className={styles.eyebrowLine} aria-hidden="true" />
            Safety &amp; Protection
            <span className={styles.eyebrowLine} aria-hidden="true" />
          </p>

          <h2 className={styles.heading}>
            Safety, <span className={styles.accent}>Insurance</span> &amp;
            <br />
            Peace of Mind
          </h2>

          <p className={styles.subheading}>
            Clear Roles. Shared Safety. No Confusion.
          </p>
        </div>

        {/* --- three visual summary modules --- */}
        <ul className={styles.modules}>
          {modules.map((module) => (
            <li className={styles.module} key={module.key}>
              <div className={styles.graphic}>
                {module.key === "insurance" && (
                  <span className={styles.ring}>
                    <span className={styles.ringMid} aria-hidden="true" />
                    <span className={styles.ringCore}>
                      <Icon name="shield" className={styles.graphicIcon} />
                    </span>
                  </span>
                )}

                {module.key === "safety" && (
                  <span className={styles.pathRow}>
                    <span className={styles.node}>
                      <Icon name="store" className={styles.graphicIcon} />
                    </span>
                    <span className={styles.dotted} aria-hidden="true" />
                    <span className={`${styles.node} ${styles.nodeSolid}`}>
                      <Icon name="shield" className={styles.graphicIcon} />
                    </span>
                  </span>
                )}

                {module.key === "responsibility" && (
                  <span className={styles.pathRow}>
                    <span className={styles.sideNode}>
                      <span className={`${styles.node} ${styles.nodeSolid}`}>
                        <Icon name="shield" className={styles.graphicIcon} />
                      </span>
                      <span className={`headingFont ${styles.nodeLabel}`}>
                        ShiftSupport
                      </span>
                    </span>
                    <span className={styles.swap} aria-hidden="true">
                      ↔
                    </span>
                    <span className={styles.sideNode}>
                      <span className={styles.node}>
                        <Icon name="store" className={styles.graphicIcon} />
                      </span>
                      <span className={`headingFont ${styles.nodeLabel}`}>
                        Retailer
                      </span>
                    </span>
                  </span>
                )}
              </div>

              <h3 className={`headingFont ${styles.moduleLabel}`}>
                {module.label}
              </h3>
              <p className={styles.moduleCaption}>{module.caption}</p>
            </li>
          ))}
        </ul>

        {/* --- two responsibility panels --- */}
        <div className={styles.panels}>
          <article className={`${styles.panel} ${styles.panelLeft}`}>
            <Icon name="shield" className={styles.panelWatermark} />
            <header className={styles.panelHead}>
              <span className={styles.panelBadge}>
                <Icon name="shield" />
              </span>
              <h3 className={styles.panelTitle}>ShiftSupport Provides</h3>
            </header>
            <ul className={styles.rows}>
              {shiftSupportRows.map(([icon, text]) => (
                <li className={styles.row} key={text}>
                  <span className={styles.rowIcon}>
                    <Icon name={icon} />
                  </span>
                  <p className={styles.rowText}>{text}</p>
                </li>
              ))}
            </ul>
          </article>

          <div className={styles.connector} aria-hidden="true">
            <span className={styles.connectorDisc}>↔</span>
            <span className={`headingFont ${styles.connectorLabel}`}>
              Shared Safety
            </span>
          </div>

          <article className={`${styles.panel} ${styles.panelRight}`}>
            <Icon name="store" className={styles.panelWatermark} />
            <header className={styles.panelHead}>
              <span className={styles.panelBadge}>
                <Icon name="store" />
              </span>
              <h3 className={styles.panelTitle}>Retailers Provide</h3>
            </header>
            <ul className={styles.rows}>
              {retailerRows.map(([icon, text]) => (
                <li className={styles.row} key={text}>
                  <span className={styles.rowIcon}>
                    <Icon name={icon} />
                  </span>
                  <p className={styles.rowText}>{text}</p>
                </li>
              ))}
            </ul>
          </article>
        </div>

        {/* --- peace of mind strip --- */}
        <div className={styles.strip}>
          <p className={styles.stripText}>
            Built for safer shifts, clearer roles, and less uncertainty.
          </p>
          <ul className={styles.badges}>
            {["Insured", "Guided", "Supported"].map((badge) => (
              <li className={`headingFont ${styles.badge}`} key={badge}>
                {badge}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

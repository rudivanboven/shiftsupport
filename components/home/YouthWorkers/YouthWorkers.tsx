"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./YouthWorkers.module.css";

/* Inline stroke icons — no package, no photography, no stock assets. */
const paths: Record<string, ReactNode> = {
  cap: (
    <>
      <path d="M12 4 2.6 8.4 12 12.8l9.4-4.4L12 4Z" />
      <path d="M6.6 10.5v4.1c0 1.6 2.4 2.9 5.4 2.9s5.4-1.3 5.4-2.9v-4.1" />
      <path d="M20.6 9.4v4.3" />
    </>
  ),
  document: (
    <>
      <path d="M13.4 3.2H7.6a1.8 1.8 0 0 0-1.8 1.8v14a1.8 1.8 0 0 0 1.8 1.8h8.8a1.8 1.8 0 0 0 1.8-1.8V7.8l-4.8-4.6Z" />
      <path d="M13.2 3.4v4.4h4.6" />
      <path d="M9 13h6M9 16.6h4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 5.5 5.8v5c0 4.2 2.7 7.6 6.5 8.6 3.8-1 6.5-4.4 6.5-8.6v-5L12 3.2Z" />
      <path d="m9.3 11.9 1.9 1.9 3.6-3.6" />
    </>
  ),
  documentCheck: (
    <>
      <path d="M13.4 3.2H7.6a1.8 1.8 0 0 0-1.8 1.8v14a1.8 1.8 0 0 0 1.8 1.8h8.8a1.8 1.8 0 0 0 1.8-1.8V7.8l-4.8-4.6Z" />
      <path d="M13.2 3.4v4.4h4.6" />
      <path d="m9.2 14.6 1.8 1.8 3.6-3.6" />
    </>
  ),
  store: (
    <>
      <path d="M4 9.2 5.4 4.8h13.2L20 9.2" />
      <path d="M4.9 9.2v9.9h14.2V9.2" />
      <path d="M9.6 19.1v-5.2h4.8v5.2" />
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

const cards = [
  {
    key: "w2",
    icon: "document",
    title: "W-2 Employment",
    text: "All youth workers are W-2 employees of ShiftSupport.",
  },
  {
    key: "permit",
    icon: "documentCheck",
    title: "Verified Work Permits",
    text: "ShiftSupport verifies valid California work permits before workers are placed on shifts.",
  },
  {
    key: "safe",
    icon: "shield",
    title: "Safe & Age-Appropriate Work",
    text: "We enforce legal working hours, school-day limits, and age-appropriate, non-hazardous duties.",
  },
];

export default function YouthWorkers() {
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
      id="youth-workers"
    >
      <div className={`container ${styles.inner}`}>
        {/* ---------------- LEFT ---------------- */}
        <div className={styles.intro}>
          <p className={`headingFont ${styles.eyebrow}`}>
            <span className={styles.eyebrowLine} aria-hidden="true" />
            Youth Employment
          </p>

          <h2 className={styles.heading}>
            Youth &amp; <span className={styles.accent}>Student</span> Workers
          </h2>

          <p className={styles.subheading}>
            Safe, Legal Youth Employment — Handled by ShiftSupport
          </p>

          <p className={styles.description}>
            ShiftSupport makes it easier for high-school students to find short,
            flexible work opportunities while handling the employment and
            compliance requirements.
          </p>

          <p className={styles.highlight}>
            <span className={styles.highlightIcon} aria-hidden="true">
              <Icon name="cap" />
            </span>
            Built for students. Structured for compliance.
          </p>
        </div>

        {/* ---------------- RIGHT ---------------- */}
        <div className={styles.visual}>
          <span className={styles.blob} aria-hidden="true" />

          <ul className={styles.cards}>
            {cards.map((card) => (
              <li className={styles.card} key={card.key}>
                <span className={styles.cardIcon} aria-hidden="true">
                  <Icon name={card.icon} />
                </span>
                <h3 className={styles.cardTitle}>{card.title}</h3>
                <p className={styles.cardText}>{card.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ---------------- BOTTOM CTA ---------------- */}
      <div className={`container ${styles.ctaWrap}`}>
        <div className={styles.cta}>
          <span className={styles.ctaIcon} aria-hidden="true">
            <Icon name="store" />
          </span>

          <div className={styles.ctaBody}>
            <p className={styles.ctaTitle}>
              Retailers provide a safe and supportive workplace.
            </p>
            <p className={styles.ctaText}>
              They don’t need to collect work permits or manage school
              paperwork.
            </p>
          </div>

          <a className={`headingFont ${styles.ctaButton}`} href="#employer">
            Learn More <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}
